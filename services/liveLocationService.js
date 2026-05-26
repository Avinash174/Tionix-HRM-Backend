const liveLocationModel = require("../models/liveLocationModel");
const gpsAttendanceModel = require("../models/gpsAttendanceModel");
const empGeoLocationModel = require("../models/empGeoLocationModel");
const { resolveFinalEmpCode } = require("../utils/resolveEmpCode");
const { getFixedOfficeForEmpId, getDefaultAttendanceRadius } = require("../utils/employeeOffice");
const { calculateDistance } = require("../utils/locationUtils");
const { emitEvent, emitToOffice } = require("../sockets");
const { analyzeGpsPoint } = require("../utils/fakeGpsDetection");
const { normalizeGpsReading, getGpsAccuracyConfig } = require("../utils/gpsCoordinates");
const {
  computeLastSeen,
  computeOfficeStatus,
  getShiftStatusForEmployee,
} = require("../utils/trackingEnrichment");

const getPingIntervalSeconds = () =>
  parseInt(process.env.LIVE_LOCATION_PING_INTERVAL_SECONDS || "15", 10);

const getStaleSeconds = () =>
  parseInt(process.env.LIVE_LOCATION_STALE_SECONDS || "45", 10);

const getBackgroundPingIntervalSeconds = () =>
  parseInt(
    process.env.BACKGROUND_LOCATION_PING_INTERVAL_SECONDS ||
      process.env.LIVE_LOCATION_PING_INTERVAL_SECONDS ||
      "60",
    10
  );

const getTrackingConfig = () => ({
  pingIntervalSeconds: getPingIntervalSeconds(),
  staleAfterSeconds: getStaleSeconds(),
  recommendedPingMs: getPingIntervalSeconds() * 1000,
  backgroundTracking: {
    enabled: process.env.BACKGROUND_TRACKING_ENABLED !== "false",
    pingIntervalSeconds: getBackgroundPingIntervalSeconds(),
    recommendedBackgroundPingMs: getBackgroundPingIntervalSeconds() * 1000,
    staleAfterSeconds: parseInt(
      process.env.BACKGROUND_LOCATION_STALE_SECONDS ||
        process.env.LIVE_LOCATION_STALE_SECONDS ||
        "120",
      10
    ),
    allowBackground: process.env.ALLOW_BACKGROUND_LOCATION !== "false",
  },
  fakeGpsDetection: {
    enabled: process.env.FAKE_GPS_DETECTION_ENABLED !== "false",
    maxSpeedMs: parseFloat(process.env.MAX_GPS_SPEED_MS || "55"),
  },
  gpsAccuracy: getGpsAccuracyConfig(),
});

const getEmployeeOffice = async (empCode) => {
  const { office } = await getFixedOfficeForEmpId(empCode);
  if (!office) return null;

  return {
    fkEmpId: empCode,
    fkLocationId: office.locationId,
    LocationName: office.name,
    Latitude: office.latitude,
    Longitude: office.longitude,
    AllowedRadius: office.allowed_radius,
    source: "FIXED_CONFIG",
  };
};

const toOfficeStatusInput = (office) =>
  office
    ? {
        latitude: office.latitude,
        longitude: office.longitude,
        allowedRadius: office.allowed_radius ?? office.radius,
      }
    : null;

const recordLocation = async (userId, payload = {}) => {
  const resolved = await resolveFinalEmpCode(userId);

  if (!resolved.empCode || !Number.isFinite(Number(resolved.empCode))) {
    const error = new Error(
      "Only employees linked to SalEmployee can share live location. Admin accounts are not supported."
    );
    error.statusCode = 403;
    throw error;
  }

  const previousPoint = await liveLocationModel.getLatestByEmployee(resolved.empCode);
  const normalized = normalizeGpsReading(
    {
      latitude:
        payload.latitude ??
        payload.employee_latitude ??
        payload.lat ??
        payload.employeeLatitude,
      longitude:
        payload.longitude ??
        payload.employee_longitude ??
        payload.lng ??
        payload.employeeLongitude,
      accuracy: payload.accuracy,
    },
    previousPoint
  );

  if (normalized.rejected) {
    const error = new Error(normalized.rejectReason);
    error.statusCode = normalized.rejectCode === "GPS_ACCURACY_TOO_LOW" ? 422 : 400;
    error.code = normalized.rejectCode;
    throw error;
  }

  const latitude = normalized.latitude;
  const longitude = normalized.longitude;
  const accuracyMeters = normalized.accuracyMeters;

  const gpsPayload = {
    ...payload,
    latitude,
    longitude,
    accuracy: accuracyMeters,
  };

  const gpsAnalysis =
    process.env.FAKE_GPS_DETECTION_ENABLED !== "false"
      ? analyzeGpsPoint(gpsPayload, previousPoint)
      : { isSuspicious: false, riskScore: 0, flags: [], status: "trusted" };

  const inserted = await liveLocationModel.insertLocation({
    empCode: resolved.empCode,
    empName: resolved.empName,
    latitude,
    longitude,
    accuracyMeters,
    heading: payload.heading != null ? Number(payload.heading) : null,
    speed: payload.speed != null ? Number(payload.speed) : null,
    address: payload.address || null,
    deviceInfo: payload.device_info || payload.deviceInfo || null,
    isSuspicious: gpsAnalysis.isSuspicious,
    gpsRiskScore: gpsAnalysis.riskScore,
    gpsFlags: gpsAnalysis.flags.join(","),
  });

  const { office, assignmentSource: officeSource } = await getFixedOfficeForEmpId(
    resolved.empCode
  );
  const allowedRadius = office?.allowed_radius ?? getDefaultAttendanceRadius();
  let officeStatus = computeOfficeStatus(latitude, longitude, toOfficeStatusInput(office), {
    accuracyMeters: accuracyMeters,
    applyLiveGpsBuffer: false,
  });
  let trackingValid = officeStatus.isInsideOfficeRadius === true;
  let attendanceStatus = "unknown";

  if (!office) {
    officeStatus = {
      ...officeStatus,
      geofenceStatus: "unknown",
    };
    attendanceStatus = "no_office_config";
  } else {
    attendanceStatus = trackingValid ? "approved" : "rejected";
  }

  await empGeoLocationModel.insertEmployeeLocation({
    fkEmpId: resolved.empCode,
    latitude,
    longitude,
    atDate: inserted.recorded_at || new Date(),
  }).catch((err) => {
    console.warn("EmpGeoLocation insert skipped:", err.message);
  });

  if (office) {
    await gpsAttendanceModel.createLiveTrackingRecord({
      employeeId: resolved.empCode,
      attendanceType: "LIVE_TRACKING",
      attendanceDate: gpsAttendanceModel.getAttendanceDate(new Date()),
      timestamp: inserted.recorded_at || new Date(),
      employeeLatitude: latitude,
      employeeLongitude: longitude,
      officeLatitude: office.latitude,
      officeLongitude: office.longitude,
      distanceMeters: officeStatus.distanceFromOfficeMeters ?? calculateDistance(
        latitude,
        longitude,
        office.latitude,
        office.longitude
      ),
      allowedRadiusMeters: allowedRadius,
      attendanceStatus,
    }).catch((err) => {
      console.warn("gps_attendance_logs insert skipped:", err.message);
    });
  }

  const officeRow = await getEmployeeOffice(resolved.empCode);
  const lastSeen = computeLastSeen(inserted.recorded_at);
  const shift = await getShiftStatusForEmployee(resolved.empCode, "Check IN");

  const point = {
    empCode: resolved.empCode.toString(),
    empName: resolved.empName,
    latitude,
    longitude,
    accuracyMeters,
    heading: payload.heading != null ? Number(payload.heading) : null,
    speed: payload.speed != null ? Number(payload.speed) : null,
    address: payload.address || null,
    recordedAt: inserted.recorded_at,
    status: "online",
    source: "live_gps",
    locationId: officeRow?.fkLocationId ?? office?.locationId ?? null,
    officeName: officeRow?.LocationName ?? office?.name ?? null,
    officeSource: officeSource || "FIXED_CONFIG",
    officeLatitude: office?.latitude ?? null,
    officeLongitude: office?.longitude ?? null,
    allowedRadiusMeters: allowedRadius,
    trackingValid,
    attendanceStatus,
    matchingRule: "FIXED_OFFICE_GEOFENCE",
    ...officeStatus,
    ...lastSeen,
    shift,
    gpsTrustStatus: gpsAnalysis.status,
    isSuspiciousGps: gpsAnalysis.isSuspicious,
    gpsRiskScore: gpsAnalysis.riskScore,
    gpsFlags: gpsAnalysis.flags,
    gpsCorrections: normalized.corrections,
    gpsSmoothed: normalized.smoothed,
  };

  emitEvent("employee-live-location", point);
  emitEvent("employee-location-update", point);

  if (point.locationId) {
    emitToOffice(point.locationId, "employee-live-location", point);
    emitToOffice(point.locationId, "employee-location-update", point);
  }

  if (gpsAnalysis.isSuspicious) {
    emitEvent("gps-suspicious-alert", {
      empCode: point.empCode,
      empName: point.empName,
      latitude,
      longitude,
      gpsRiskScore: gpsAnalysis.riskScore,
      gpsFlags: gpsAnalysis.flags,
      recordedAt: inserted.recorded_at,
    });
  }

  return point;
};

const getLiveLocations = async (query = {}) => {
  const staleSeconds = getStaleSeconds();
  const rows = await liveLocationModel.getLatestByAllEmployees(staleSeconds);

  const search = query.search ? query.search.toLowerCase() : null;

  return rows
    .map((row) => ({
      empCode: row.emp_code,
      empName: row.emp_name,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracyMeters: row.accuracy_meters,
      heading: row.heading,
      speed: row.speed,
      address: row.address,
      lastActiveAt: row.recorded_at,
      status: row.live_status,
      source: "live_gps",
      isSuspiciousGps: !!row.is_suspicious,
      gpsTrustStatus: row.is_suspicious ? "suspicious" : "trusted",
      gpsRiskScore: row.gps_risk_score,
      gpsFlags: row.gps_flags ? row.gps_flags.split(",") : [],
    }))
    .filter((row) => {
      if (!search) return true;
      return (
        row.empCode?.toString().toLowerCase().includes(search) ||
        row.empName?.toString().toLowerCase().includes(search)
      );
    });
};

const getEmployeeTrail = async (employeeId, query = {}) => {
  const resolved = await resolveFinalEmpCode(employeeId);
  const empCode = resolved.empCode ?? employeeId;
  const limit = Math.min(parseInt(query.limit, 10) || 100, 500);

  let sinceSeconds = query.sinceSeconds ? parseInt(query.sinceSeconds, 10) : null;
  if (sinceSeconds == null && query.sinceMinutes) {
    sinceSeconds = parseInt(query.sinceMinutes, 10) * 60;
  }
  if (sinceSeconds == null) {
    sinceSeconds = 900;
  }

  const trail = await liveLocationModel.getTrail(empCode, { limit, sinceSeconds });

  return {
    empCode: empCode.toString(),
    empName: resolved.empName,
    trail: trail.map((row) => ({
      id: row.id,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracyMeters: row.accuracy_meters,
      heading: row.heading,
      speed: row.speed,
      address: row.address,
      recordedAt: row.recorded_at,
      isSuspicious: !!row.is_suspicious,
      gpsRiskScore: row.gps_risk_score,
      gpsFlags: row.gps_flags,
    })),
  };
};

const isLocationOnline = (recordedAt) => {
  if (!recordedAt) return false;
  const ageMs = Date.now() - new Date(recordedAt).getTime();
  return ageMs <= getStaleSeconds() * 1000;
};

module.exports = {
  recordLocation,
  getLiveLocations,
  getEmployeeTrail,
  getPingIntervalSeconds,
  getStaleSeconds,
  getTrackingConfig,
  isLocationOnline,
};
