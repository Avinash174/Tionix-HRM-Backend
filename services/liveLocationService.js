const liveLocationModel = require("../models/liveLocationModel");
const { resolveFinalEmpCode } = require("../utils/resolveEmpCode");
const { emitEvent } = require("../sockets");

const getPingIntervalSeconds = () =>
  parseInt(process.env.LIVE_LOCATION_PING_INTERVAL_SECONDS || "15", 10);

const getStaleSeconds = () =>
  parseInt(process.env.LIVE_LOCATION_STALE_SECONDS || "45", 10);

const getTrackingConfig = () => ({
  pingIntervalSeconds: getPingIntervalSeconds(),
  staleAfterSeconds: getStaleSeconds(),
  recommendedPingMs: getPingIntervalSeconds() * 1000,
});

const recordLocation = async (userId, payload = {}) => {
  const resolved = await resolveFinalEmpCode(userId);

  if (!resolved.empCode || !Number.isFinite(Number(resolved.empCode))) {
    const error = new Error(
      "Only employees linked to SalEmployee can share live location. Admin accounts are not supported."
    );
    error.statusCode = 403;
    throw error;
  }

  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const error = new Error("Valid latitude and longitude are required");
    error.statusCode = 400;
    throw error;
  }

  const inserted = await liveLocationModel.insertLocation({
    empCode: resolved.empCode,
    empName: resolved.empName,
    latitude,
    longitude,
    accuracyMeters: payload.accuracy != null ? Number(payload.accuracy) : null,
    heading: payload.heading != null ? Number(payload.heading) : null,
    speed: payload.speed != null ? Number(payload.speed) : null,
    address: payload.address || null,
    deviceInfo: payload.device_info || payload.deviceInfo || null,
  });

  const point = {
    empCode: resolved.empCode.toString(),
    empName: resolved.empName,
    latitude,
    longitude,
    accuracyMeters: payload.accuracy != null ? Number(payload.accuracy) : null,
    heading: payload.heading != null ? Number(payload.heading) : null,
    speed: payload.speed != null ? Number(payload.speed) : null,
    address: payload.address || null,
    recordedAt: inserted.recorded_at,
    status: "online",
    source: "live_gps",
  };

  emitEvent("employee-live-location", point);
  emitEvent("employee-location-update", {
    empCode: point.empCode,
    empName: point.empName,
    latitude: point.latitude,
    longitude: point.longitude,
    address: point.address,
    status: "Live",
    timestamp: point.recordedAt,
    source: "live_gps",
  });

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
