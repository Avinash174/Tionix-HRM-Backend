const { sql } = require("../../config/db");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const liveLocationService = require("../../services/liveLocationService");
const liveLocationModel = require("../../models/liveLocationModel");
const { calculateDistance } = require("../../utils/locationUtils");

const getPunchBasedTracking = async (query = {}) => {
  const onlineWindowSeconds = parseInt(
    process.env.ONLINE_WINDOW_SECONDS || "30",
    10
  );

  const result = await new sql.Request().query(`
    SELECT EmpCode, EmpName, Latitude, Longitude, Address, PunchDatetime, Punch
    FROM (
      SELECT EmpCode, EmpName, Latitude, Longitude, Address, PunchDatetime, Punch,
             ROW_NUMBER() OVER (PARTITION BY EmpCode ORDER BY PunchDatetime DESC) AS rn
      FROM Attendance
    ) latest
    WHERE latest.rn = 1
  `);

  const now = Date.now();
  return result.recordset.map((row) => {
    const lastSeen = row.PunchDatetime ? new Date(row.PunchDatetime).getTime() : null;
    const secondsAgo = lastSeen ? (now - lastSeen) / 1000 : null;
    const isOnline =
      lastSeen && secondsAgo <= onlineWindowSeconds && row.Punch !== "Check OUT";
    return {
      empCode: row.EmpCode?.toString(),
      empName: row.EmpName,
      latitude: row.Latitude != null ? Number(row.Latitude) : null,
      longitude: row.Longitude != null ? Number(row.Longitude) : null,
      address: row.Address,
      lastActiveAt: row.PunchDatetime,
      punchStatus: row.Punch,
      status: isOnline ? "online" : "offline",
      source: "attendance_punch",
    };
  });
};

const mergeLiveAndPunch = (liveRows, punchRows) => {
  const map = new Map();

  for (const row of punchRows) {
    if (row.empCode) map.set(row.empCode.toString(), row);
  }

  for (const live of liveRows) {
    const key = live.empCode.toString();
    const existing = map.get(key);
    const liveTime = live.lastActiveAt ? new Date(live.lastActiveAt).getTime() : 0;
    const punchTime = existing?.lastActiveAt
      ? new Date(existing.lastActiveAt).getTime()
      : 0;

    if (!existing || liveTime >= punchTime) {
      map.set(key, {
        ...existing,
        ...live,
        punchStatus: existing?.punchStatus ?? null,
        source: "live_gps",
      });
    } else if (existing) {
      map.set(key, {
        ...live,
        ...existing,
        source: "live_gps+attendance_punch",
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const ta = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
    const tb = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
    return tb - ta;
  });
};

const getLiveTracking = async (query = {}) => {
  const liveRows = await liveLocationService.getLiveLocations(query);
  const punchRows = await getPunchBasedTracking(query);
  const merged = mergeLiveAndPunch(liveRows, punchRows);

  const search = query.search ? query.search.toLowerCase() : null;
  const sourceFilter = query.source;
  const fkHLId = query.fkHLId ? parseInt(query.fkHLId, 10) : null;

  let filtered = merged.filter((row) => {
    if (sourceFilter === "live_gps" && row.source !== "live_gps") return false;
    if (sourceFilter === "attendance_punch" && !row.source?.includes("attendance"))
      return false;
    if (!search) return true;
    return (
      row.empCode?.toString().toLowerCase().includes(search) ||
      row.empName?.toString().toLowerCase().includes(search)
    );
  });

  // If branch filter is provided, fetch geofences and calculate distance for each employee
  let geofences = [];
  if (fkHLId) {
    const hlGeoService = require("./hlGeoService");
    geofences = await hlGeoService.listHLGeolocations(fkHLId);
  }

  // Enrich employees with distance to nearest geofence (if any geofences exist)
  const enrichedEmployees = filtered.map((emp) => {
    if (!geofences.length || !emp.latitude || !emp.longitude) {
      return {
        ...emp,
        distanceMeters: null,
        nearestGeofenceId: null,
        isInsideGeofence: null,
      };
    }

    let minDistance = Infinity;
    let nearestGeo = null;

    for (const geo of geofences) {
      const dist = calculateDistance(
        emp.latitude,
        emp.longitude,
        geo.Latitude,
        geo.Longitude
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestGeo = geo;
      }
    }

    const isInside = nearestGeo ? minDistance <= nearestGeo.RadiusMeters : false;

    return {
      ...emp,
      distanceMeters: Math.round(minDistance),
      nearestGeofenceId: nearestGeo?.pkGeoId || null,
      isInsideGeofence: isInside,
    };
  });

  return {
    employees: enrichedEmployees,
    geofences,
  };
};

const getTrackingHistory = async (employeeId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);

  const result = await new sql.Request()
    .input("employeeId", sql.VarChar, employeeId.toString())
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT id, employee_id, attendance_type, attendance_date, recorded_at,
             employee_latitude, employee_longitude, distance_meters,
             allowed_radius_meters, attendance_status
      FROM dbo.gps_attendance_logs
      WHERE employee_id = @employeeId
      ORDER BY recorded_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  const totalResult = await new sql.Request()
    .input("employeeId", sql.VarChar, employeeId.toString())
    .query(`
      SELECT COUNT(*) AS total
      FROM dbo.gps_attendance_logs
      WHERE employee_id = @employeeId
    `);

  const total = Number(totalResult.recordset[0]?.total || 0);

  return {
    data: result.recordset,
    meta: buildPaginationMeta(page, limit, total),
  };
};

const getLiveTrail = async (employeeId, query = {}) => {
  return liveLocationService.getEmployeeTrail(employeeId, query);
};

const getEmployeeLiveSnapshot = async (employeeId) => {
  const { resolveFinalEmpCode } = require("../../utils/resolveEmpCode");
  const resolved = await resolveFinalEmpCode(employeeId);
  const empCode = resolved.empCode ?? employeeId;
  const latest = await liveLocationModel.getLatestByEmployee(empCode);
  const isOnline = liveLocationService.isLocationOnline(latest?.recorded_at);

  return {
    empCode: empCode.toString(),
    empName: resolved.empName,
    location: latest
      ? {
          latitude: Number(latest.latitude),
          longitude: Number(latest.longitude),
          address: latest.address,
          recordedAt: latest.recorded_at,
          status: isOnline ? "online" : "offline",
        }
      : null,
  };
};

module.exports = {
  getLiveTracking,
  getTrackingHistory,
  getLiveTrail,
  getEmployeeLiveSnapshot,
};
