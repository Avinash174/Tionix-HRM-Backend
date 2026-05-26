const { query } = require("../../config/db");
const { joinUserToLocation, filterUserLocationId } = require("../../config/dialect");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const {
  getFixedOfficeByLocationId,
  getFixedOfficeListForAdmin,
  getDefaultRadiusMeters,
} = require("../../config/officeGeofences");
const liveLocationService = require("../../services/liveLocationService");
const liveLocationModel = require("../../models/liveLocationModel");
const {
  computeLastSeen,
  computeOfficeStatus,
} = require("../../utils/trackingEnrichment");
const { calculateDistance } = require("../../utils/locationUtils");

const mapPunchRecord = (row) => {
  const punchInLat = row.punchInLat != null ? Number(row.punchInLat) : null;
  const punchInLon = row.punchInLon != null ? Number(row.punchInLon) : null;
  const punchOutLat = row.punchOutLat != null ? Number(row.punchOutLat) : null;
  const punchOutLon = row.punchOutLon != null ? Number(row.punchOutLon) : null;
  const latitude = punchInLat ?? punchOutLat;
  const longitude = punchInLon ?? punchOutLon;

  return {
    empCode: row.EmpCode?.toString().trim(),
    empName: row.EmpName,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    address: row.punchInAddress || row.punchOutAddress || null,
    punchInTime: row.punchInTime,
    punchInLocation: punchInLat != null
      ? { latitude: punchInLat, longitude: punchInLon, address: row.punchInAddress }
      : null,
    punchOutTime: row.punchOutTime,
    punchOutLocation: punchOutLat != null
      ? { latitude: punchOutLat, longitude: punchOutLon, address: row.punchOutAddress }
      : null,
    lastPunchTime: row.lastPunchTime,
    lastPunchStatus: row.lastPunchStatus,
    lastActiveAt: row.lastPunchTime || null,
    status: "offline",
    hasActivityToday: true,
    source: "attendance_punch",
  };
};

const resolveMapCoordinates = (row) => {
  if (row.latitude != null && row.longitude != null) return row;
  const punchLoc = row.punchInLocation || row.punchOutLocation;
  if (punchLoc?.latitude != null && punchLoc?.longitude != null) {
    return {
      ...row,
      latitude: Number(punchLoc.latitude),
      longitude: Number(punchLoc.longitude),
      address: row.address || punchLoc.address || null,
    };
  }
  return row;
};

const getTodayPunchSummary = async () => {
  const result = await query(`
    SELECT
      "EmpCode", "EmpName",
      MAX(CASE WHEN "Punch" = 'Check IN' THEN "PunchDatetime" END) AS "punchInTime",
      MAX(CASE WHEN "Punch" = 'Check IN' THEN "Latitude" END)      AS "punchInLat",
      MAX(CASE WHEN "Punch" = 'Check IN' THEN "Longitude" END)     AS "punchInLon",
      MAX(CASE WHEN "Punch" = 'Check IN' THEN "Address" END)       AS "punchInAddress",
      MAX(CASE WHEN "Punch" = 'Check OUT' THEN "PunchDatetime" END) AS "punchOutTime",
      MAX(CASE WHEN "Punch" = 'Check OUT' THEN "Latitude" END)     AS "punchOutLat",
      MAX(CASE WHEN "Punch" = 'Check OUT' THEN "Longitude" END)    AS "punchOutLon",
      MAX(CASE WHEN "Punch" = 'Check OUT' THEN "Address" END)      AS "punchOutAddress",
      MAX("PunchDatetime") AS "lastPunchTime",
      MAX("Punch")         AS "lastPunchStatus"
    FROM "dbo.Attendance"
    WHERE "AtDate" = CURRENT_DATE::text
    GROUP BY "EmpCode", "EmpName"
  `);
  return result.rows.map(mapPunchRecord);
};

const mergeLiveAndPunch = (liveRows, todayPunchRows) => {
  const map = new Map();
  for (const row of todayPunchRows) {
    if (row.empCode) map.set(row.empCode.toString(), row);
  }
  for (const live of liveRows) {
    const key = live.empCode.toString();
    const existing = map.get(key);
    const liveTime = live.lastActiveAt ? new Date(live.lastActiveAt).getTime() : 0;
    const punchTime = existing?.lastPunchTime ? new Date(existing.lastPunchTime).getTime() : 0;
    if (!existing || liveTime >= punchTime) {
      const hasActivityToday = !!(existing?.hasActivityToday || live.hasActivityToday);
      map.set(key, {
        ...existing, ...live,
        hasActivityToday,
        isStaleLocation: !hasActivityToday && !!live.isStaleLocation,
        source: existing ? "live_gps+attendance_punch" : "live_gps",
      });
    } else if (existing) {
      map.set(key, { ...live, ...existing, hasActivityToday: true, isStaleLocation: false, source: "live_gps+attendance_punch" });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.lastActiveAt || a.lastPunchTime ? new Date(a.lastActiveAt || a.lastPunchTime).getTime() : 0;
    const tb = b.lastActiveAt || b.lastPunchTime ? new Date(b.lastActiveAt || b.lastPunchTime).getTime() : 0;
    return tb - ta;
  });
};

const fetchOfficeById = async (locationId) => {
  const office = getFixedOfficeByLocationId(locationId);
  if (!office) return null;
  return { LocationID: office.locationId, LocationName: office.name, Latitude: office.latitude, Longitude: office.longitude, AllowedRadius: office.radius, Address: null };
};

const fetchActiveOffices = async () =>
  getFixedOfficeListForAdmin().map((office) => ({
    LocationID: office.locationId, LocationName: office.name,
    Latitude: office.latitude, Longitude: office.longitude,
    AllowedRadius: office.allowedRadius ?? getDefaultRadiusMeters(), Address: null,
  }));

const formatOfficeForResponse = (row) =>
  row ? { locationId: row.LocationID, name: row.LocationName, latitude: Number(row.Latitude), longitude: Number(row.Longitude), radiusMeters: Number(row.AllowedRadius), address: row.Address } : null;

const toOfficeForRadius = (row) =>
  row ? { Latitude: row.Latitude, Longitude: row.Longitude, AllowedRadius: row.AllowedRadius } : null;

const buildOfficeMap = (officeRows) => {
  const map = new Map();
  for (const row of officeRows) {
    if (row.fkEmpId != null) map.set(row.fkEmpId.toString(), row);
  }
  return map;
};

const getTodayPunchSummaryForOffice = async (locationId) => {
  const result = await query(
    `SELECT
       a."EmpCode", a."EmpName",
       MAX(CASE WHEN a."Punch" = 'Check IN'  THEN a."PunchDatetime" END) AS "punchInTime",
       MAX(CASE WHEN a."Punch" = 'Check IN'  THEN a."Latitude" END)      AS "punchInLat",
       MAX(CASE WHEN a."Punch" = 'Check IN'  THEN a."Longitude" END)     AS "punchInLon",
       MAX(CASE WHEN a."Punch" = 'Check IN'  THEN a."Address" END)       AS "punchInAddress",
       MAX(CASE WHEN a."Punch" = 'Check OUT' THEN a."PunchDatetime" END) AS "punchOutTime",
       MAX(CASE WHEN a."Punch" = 'Check OUT' THEN a."Latitude" END)      AS "punchOutLat",
       MAX(CASE WHEN a."Punch" = 'Check OUT' THEN a."Longitude" END)     AS "punchOutLon",
       MAX(CASE WHEN a."Punch" = 'Check OUT' THEN a."Address" END)       AS "punchOutAddress",
       MAX(a."PunchDatetime") AS "lastPunchTime",
       MAX(a."Punch")         AS "lastPunchStatus"
     FROM "dbo.Attendance" a
     INNER JOIN "dbo.AppUser" u ON u."fkEmpId"::text = a."EmpCode"::text
     WHERE a."AtDate" = CURRENT_DATE::text AND ${filterUserLocationId("u", 1)}
     GROUP BY a."EmpCode", a."EmpName"`,
    [locationId]
  );
  return result.rows.map(mapPunchRecord);
};

const mapLiveDbRow = (row) => ({
  empCode: row.emp_code?.toString(), empName: row.emp_name,
  latitude: Number(row.latitude), longitude: Number(row.longitude),
  accuracyMeters: row.accuracy_meters, heading: row.heading, speed: row.speed,
  address: row.address, lastActiveAt: row.recorded_at, status: row.live_status,
  source: "live_gps",
  hasActivityToday: row.is_today === 1 || row.is_today === true,
  isStaleLocation: !(row.is_today === 1 || row.is_today === true),
  isSuspiciousGps: !!row.is_suspicious,
  gpsTrustStatus: row.is_suspicious ? "suspicious" : "trusted",
});

const enrichEmployeeForMap = (emp, selectedOffice) => {
  const lastSeen = computeLastSeen(emp.lastActiveAt || emp.lastPunchTime);
  const officeStatus = computeOfficeStatus(emp.latitude, emp.longitude, selectedOffice);
  return {
    empCode: emp.empCode, empName: emp.empName,
    latitude: emp.latitude, longitude: emp.longitude, address: emp.address || null,
    status: emp.status || "offline",
    lastActiveAt: emp.lastActiveAt || emp.lastPunchTime || null,
    punchInTime: emp.punchInTime || null, punchOutTime: emp.punchOutTime || null,
    source: emp.source || null, isStaleLocation: emp.isStaleLocation || false,
    ...lastSeen, ...officeStatus,
    distanceMeters: officeStatus.distanceFromOfficeMeters,
    isInsideGeofence: officeStatus.isInsideOfficeRadius,
  };
};

const getLiveTracking = async (q = {}) => {
  const locationId = q.locationId ? parseInt(q.locationId, 10) : null;
  const search = q.search ? q.search.toLowerCase() : null;
  const geofenceFilter = q.geofenceStatus;
  const staleSeconds = liveLocationService.getStaleSeconds();

  let selectedOffice = null, assignedCount = 0, liveRows = [], todayPunchRows = [];

  if (locationId) {
    selectedOffice = await fetchOfficeById(locationId);
    const assignedEmployees = await liveLocationModel.getEmployeesByOffice(locationId);
    assignedCount = assignedEmployees.length;
    const liveDbRows = await liveLocationModel.getLatestLiveByOfficeLatest(locationId, staleSeconds);
    liveRows = liveDbRows.map(mapLiveDbRow);
    todayPunchRows = await getTodayPunchSummaryForOffice(locationId);
  } else {
    liveRows = await liveLocationService.getLiveLocations(q);
    todayPunchRows = await getTodayPunchSummary();
    const activeOffices = await fetchActiveOffices();
    selectedOffice = activeOffices[0] || null;
  }

  let merged = mergeLiveAndPunch(liveRows, todayPunchRows).map(resolveMapCoordinates);
  merged = merged.filter((row) => {
    if (row.latitude == null || row.longitude == null) return false;
    if (locationId) { if (!search) return true; } else if (!row.hasActivityToday) { return false; }
    if (!search) return true;
    return row.empCode?.toString().toLowerCase().includes(search) || row.empName?.toString().toLowerCase().includes(search);
  });

  const officeMap = buildOfficeMap(await liveLocationModel.getEmployeeOfficeMap());
  const officeForRadius = toOfficeForRadius(selectedOffice);

  let enrichedEmployees = merged.map((emp) => {
    const assignedOfficeRow = officeMap.get(emp.empCode?.toString());
    const radiusOffice = locationId ? officeForRadius : toOfficeForRadius(assignedOfficeRow) || officeForRadius;
    return enrichEmployeeForMap(emp, radiusOffice);
  });

  if (geofenceFilter === "inside") enrichedEmployees = enrichedEmployees.filter((e) => e.geofenceStatus === "inside");
  else if (geofenceFilter === "outside") enrichedEmployees = enrichedEmployees.filter((e) => e.geofenceStatus === "outside");

  const office = formatOfficeForResponse(selectedOffice);
  let hint = null;
  if (locationId && !selectedOffice) hint = "Office not found in AttendanceLocations for this locationId.";
  else if (!selectedOffice) hint = "No active office in AttendanceLocations table. Add office via POST /api/admin/offices.";
  else if (locationId && assignedCount === 0) hint = "No employees assigned to this office. Use PUT /api/admin/employees/:id with locationId.";
  else if (locationId && enrichedEmployees.length === 0) hint = "Employees assigned but no location data yet. Send POST /api/attendance/live-location from mobile.";
  else if (locationId && enrichedEmployees.some((e) => e.isStaleLocation)) hint = "Showing last known locations (not live today).";
  else if (locationId && enrichedEmployees.length > 0) {
    const outsideCount = enrichedEmployees.filter((e) => e.geofenceStatus === "outside").length;
    if (outsideCount === enrichedEmployees.length) hint = "Employees found but all are outside office radius.";
  }

  return {
    employees: enrichedEmployees, geofences: [], office,
    summary: {
      total: enrichedEmployees.length,
      online: enrichedEmployees.filter((e) => e.status === "online").length,
      inside: enrichedEmployees.filter((e) => e.geofenceStatus === "inside").length,
      outside: enrichedEmployees.filter((e) => e.geofenceStatus === "outside").length,
      assignedToOffice: assignedCount,
      stale: enrichedEmployees.filter((e) => e.isStaleLocation).length,
    },
    hint,
  };
};

const getTrackingAnalytics = async (q = {}) => {
  const locationId = q.locationId ? parseInt(q.locationId, 10) : null;
  const liveData = await getLiveTracking({ ...q, locationId });

  const officeWise = await query(`
    SELECT l."LocationID" AS "locationId", l."LocationName" AS "officeName", COUNT(u."fkEmpId") AS "assignedEmployees"
    FROM "dbo.AttendanceLocations" l
    LEFT JOIN "dbo.AppUser" u ON ${joinUserToLocation("u", "l")} AND u."fkEmpId" IS NOT NULL
    WHERE l."IsActive" = true
    GROUP BY l."LocationID", l."LocationName"
    ORDER BY l."LocationName"
  `);

  const today = new Date().toISOString().split("T")[0];
  const punchStats = await query(
    `SELECT
       COUNT(DISTINCT CASE WHEN "Punch" = 'Check IN'  THEN "EmpCode" END) AS "checkedInToday",
       COUNT(DISTINCT CASE WHEN "Punch" = 'Check OUT' THEN "EmpCode" END) AS "checkedOutToday"
     FROM "dbo.Attendance" WHERE "AtDate" = $1`,
    [today]
  );

  const suspiciousCount = await query(`
    SELECT COUNT(*) AS "suspiciousCount" FROM (
      SELECT DISTINCT ON (emp_code) emp_code
      FROM employee_live_locations
      WHERE recorded_at::date = CURRENT_DATE AND is_suspicious = true
      ORDER BY emp_code, recorded_at DESC
    ) x
  `);

  return {
    date: today,
    liveSummary: liveData.summary,
    office: liveData.office,
    officeWise: officeWise.rows,
    punchStats: punchStats.rows[0] || {},
    suspiciousGpsCount: Number(suspiciousCount.rows[0]?.suspiciousCount || 0),
    employees: liveData.employees,
  };
};

const getRoutePlayback = async (employeeId, q = {}) => {
  const { resolveFinalEmpCode } = require("../../utils/resolveEmpCode");
  const resolved = await resolveFinalEmpCode(employeeId);
  const empCode = resolved?.empCode ?? employeeId;

  let sinceSeconds = q.sinceSeconds ? parseInt(q.sinceSeconds, 10) : null;
  if (sinceSeconds == null && q.sinceMinutes) sinceSeconds = parseInt(q.sinceMinutes, 10) * 60;
  if (sinceSeconds == null) sinceSeconds = 86400;

  const rows = await liveLocationModel.getTrailPlayback(empCode, {
    sinceSeconds,
    limit: Math.min(parseInt(q.limit, 10) || 1000, 2000),
  });

  const points = rows.map((row, index) => {
    let segmentDistanceMeters = 0, segmentDurationSeconds = 0;
    if (index > 0) {
      const prev = rows[index - 1];
      segmentDistanceMeters = Math.round(calculateDistance(Number(prev.latitude), Number(prev.longitude), Number(row.latitude), Number(row.longitude)));
      segmentDurationSeconds = Math.max(0, Math.floor((new Date(row.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 1000));
    }
    return {
      id: row.id, latitude: Number(row.latitude), longitude: Number(row.longitude),
      accuracyMeters: row.accuracy_meters, heading: row.heading, speed: row.speed, address: row.address,
      recordedAt: row.recorded_at, isSuspicious: !!row.is_suspicious, gpsRiskScore: row.gps_risk_score,
      gpsFlags: row.gps_flags, segmentDistanceMeters, segmentDurationSeconds,
    };
  });

  const totalDistanceMeters = points.reduce((sum, p) => sum + (p.segmentDistanceMeters || 0), 0);
  const durationSeconds = points.length >= 2
    ? Math.floor((new Date(points[points.length - 1].recordedAt).getTime() - new Date(points[0].recordedAt).getTime()) / 1000)
    : 0;

  return {
    empCode: empCode.toString(), empName: resolved?.empName,
    playback: { points, totalPoints: points.length, totalDistanceMeters, durationSeconds, startAt: points[0]?.recordedAt || null, endAt: points[points.length - 1]?.recordedAt || null },
  };
};

const getTrackingHistory = async (employeeId, q = {}) => {
  const { page, limit, offset } = parsePagination(q);
  const result = await query(
    `SELECT id, employee_id, attendance_type, attendance_date, recorded_at,
            employee_latitude, employee_longitude, distance_meters, allowed_radius_meters, attendance_status
     FROM gps_attendance_logs WHERE employee_id = $1 ORDER BY recorded_at DESC LIMIT $2 OFFSET $3`,
    [employeeId.toString(), limit, offset]
  );
  const totalResult = await query(`SELECT COUNT(*) AS total FROM gps_attendance_logs WHERE employee_id = $1`, [employeeId.toString()]);
  const total = Number(totalResult.rows[0]?.total || 0);
  return { data: result.rows, meta: buildPaginationMeta(page, limit, total) };
};

const getLiveTrail = async (employeeId, q = {}) => liveLocationService.getEmployeeTrail(employeeId, q);

const getEmployeeLiveSnapshot = async (employeeId) => {
  const { resolveFinalEmpCode } = require("../../utils/resolveEmpCode");
  const resolved = await resolveFinalEmpCode(employeeId);
  const empCode = resolved?.empCode ?? employeeId;
  const latest = await liveLocationModel.getLatestByEmployee(empCode);
  const isOnline = liveLocationService.isLocationOnline(latest?.recorded_at);
  const lastSeen = computeLastSeen(latest?.recorded_at);

  return {
    empCode: empCode.toString(), empName: resolved?.empName,
    location: latest ? {
      latitude: Number(latest.latitude), longitude: Number(latest.longitude),
      address: latest.address, recordedAt: latest.recorded_at,
      status: isOnline ? "online" : "offline", isSuspicious: !!latest.is_suspicious,
      gpsRiskScore: latest.gps_risk_score, gpsFlags: latest.gps_flags, ...lastSeen,
    } : null,
  };
};

module.exports = { getLiveTracking, getTrackingAnalytics, getRoutePlayback, getTrackingHistory, getLiveTrail, getEmployeeLiveSnapshot };
