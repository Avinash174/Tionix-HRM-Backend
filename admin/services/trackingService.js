const { sql } = require("../../config/db");
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
      ? {
          latitude: punchInLat,
          longitude: punchInLon,
          address: row.punchInAddress,
        }
      : null,
    punchOutTime: row.punchOutTime,
    punchOutLocation: punchOutLat != null
      ? {
          latitude: punchOutLat,
          longitude: punchOutLon,
          address: row.punchOutAddress,
        }
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
  if (row.latitude != null && row.longitude != null) {
    return row;
  }

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
  const result = await new sql.Request().query(`
      SELECT 
        EmpCode,
        EmpName,
        MAX(CASE WHEN Punch = 'Check IN' THEN PunchDatetime END) AS punchInTime,
        MAX(CASE WHEN Punch = 'Check IN' THEN Latitude END) AS punchInLat,
        MAX(CASE WHEN Punch = 'Check IN' THEN Longitude END) AS punchInLon,
        MAX(CASE WHEN Punch = 'Check IN' THEN Address END) AS punchInAddress,
        MAX(CASE WHEN Punch = 'Check OUT' THEN PunchDatetime END) AS punchOutTime,
        MAX(CASE WHEN Punch = 'Check OUT' THEN Latitude END) AS punchOutLat,
        MAX(CASE WHEN Punch = 'Check OUT' THEN Longitude END) AS punchOutLon,
        MAX(CASE WHEN Punch = 'Check OUT' THEN Address END) AS punchOutAddress,
        MAX(PunchDatetime) AS lastPunchTime,
        MAX(Punch) AS lastPunchStatus
      FROM Attendance
      WHERE AtDate = CONVERT(VARCHAR, GETDATE(), 23)
      GROUP BY EmpCode, EmpName
    `);

  return result.recordset.map(mapPunchRecord);
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
    const punchTime = existing?.lastPunchTime
      ? new Date(existing.lastPunchTime).getTime()
      : 0;

    if (!existing || liveTime >= punchTime) {
      const hasActivityToday = !!(existing?.hasActivityToday || live.hasActivityToday);
      map.set(key, {
        ...existing,
        ...live,
        hasActivityToday,
        isStaleLocation: !hasActivityToday && !!live.isStaleLocation,
        source: existing ? "live_gps+attendance_punch" : "live_gps",
      });
    } else if (existing) {
      map.set(key, {
        ...live,
        ...existing,
        hasActivityToday: true,
        isStaleLocation: false,
        source: "live_gps+attendance_punch",
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const ta = a.lastActiveAt || a.lastPunchTime
      ? new Date(a.lastActiveAt || a.lastPunchTime).getTime()
      : 0;
    const tb = b.lastActiveAt || b.lastPunchTime
      ? new Date(b.lastActiveAt || b.lastPunchTime).getTime()
      : 0;
    return tb - ta;
  });
};

const fetchOfficeById = async (locationId) => {
  const office = getFixedOfficeByLocationId(locationId);
  if (!office) return null;

  return {
    LocationID: office.locationId,
    LocationName: office.name,
    Latitude: office.latitude,
    Longitude: office.longitude,
    AllowedRadius: office.radius,
    Address: null,
  };
};

const fetchActiveOffices = async () =>
  getFixedOfficeListForAdmin().map((office) => ({
    LocationID: office.locationId,
    LocationName: office.name,
    Latitude: office.latitude,
    Longitude: office.longitude,
    AllowedRadius: office.allowedRadius ?? getDefaultRadiusMeters(),
    Address: null,
  }));

const formatOfficeForResponse = (row) =>
  row
    ? {
        locationId: row.LocationID,
        name: row.LocationName,
        latitude: Number(row.Latitude),
        longitude: Number(row.Longitude),
        radiusMeters: Number(row.AllowedRadius),
        address: row.Address,
      }
    : null;

const toOfficeForRadius = (row) =>
  row
    ? {
        Latitude: row.Latitude,
        Longitude: row.Longitude,
        AllowedRadius: row.AllowedRadius,
      }
    : null;

const buildOfficeMap = (officeRows) => {
  const map = new Map();
  for (const row of officeRows) {
    if (row.fkEmpId != null) {
      map.set(row.fkEmpId.toString(), row);
    }
  }
  return map;
};

const getTodayPunchSummaryForOffice = async (locationId) => {
  const result = await new sql.Request()
    .input("locationId", sql.Int, locationId)
    .query(`
      SELECT 
        a.EmpCode,
        a.EmpName,
        MAX(CASE WHEN a.Punch = 'Check IN' THEN a.PunchDatetime END) AS punchInTime,
        MAX(CASE WHEN a.Punch = 'Check IN' THEN a.Latitude END) AS punchInLat,
        MAX(CASE WHEN a.Punch = 'Check IN' THEN a.Longitude END) AS punchInLon,
        MAX(CASE WHEN a.Punch = 'Check IN' THEN a.Address END) AS punchInAddress,
        MAX(CASE WHEN a.Punch = 'Check OUT' THEN a.PunchDatetime END) AS punchOutTime,
        MAX(CASE WHEN a.Punch = 'Check OUT' THEN a.Latitude END) AS punchOutLat,
        MAX(CASE WHEN a.Punch = 'Check OUT' THEN a.Longitude END) AS punchOutLon,
        MAX(CASE WHEN a.Punch = 'Check OUT' THEN a.Address END) AS punchOutAddress,
        MAX(a.PunchDatetime) AS lastPunchTime,
        MAX(a.Punch) AS lastPunchStatus
      FROM Attendance a
      INNER JOIN dbo.AppUser u ON CAST(u.fkEmpId AS NVARCHAR(50)) = CAST(a.EmpCode AS NVARCHAR(50))
      WHERE a.AtDate = CONVERT(VARCHAR, GETDATE(), 23)
        AND u.fkLocationId = @locationId
      GROUP BY a.EmpCode, a.EmpName
    `);

  return result.recordset.map(mapPunchRecord);
};

const mapLiveDbRow = (row) => ({
  empCode: row.emp_code?.toString(),
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
  hasActivityToday: row.is_today === 1 || row.is_today === true,
  isStaleLocation: !(row.is_today === 1 || row.is_today === true),
  isSuspiciousGps: !!row.is_suspicious,
  gpsTrustStatus: row.is_suspicious ? "suspicious" : "trusted",
});

const enrichEmployeeForMap = (emp, selectedOffice) => {
  const lastSeen = computeLastSeen(emp.lastActiveAt || emp.lastPunchTime);
  const officeStatus = computeOfficeStatus(emp.latitude, emp.longitude, selectedOffice);

  return {
    empCode: emp.empCode,
    empName: emp.empName,
    latitude: emp.latitude,
    longitude: emp.longitude,
    address: emp.address || null,
    status: emp.status || "offline",
    lastActiveAt: emp.lastActiveAt || emp.lastPunchTime || null,
    punchInTime: emp.punchInTime || null,
    punchOutTime: emp.punchOutTime || null,
    source: emp.source || null,
    isStaleLocation: emp.isStaleLocation || false,
    ...lastSeen,
    ...officeStatus,
    distanceMeters: officeStatus.distanceFromOfficeMeters,
    isInsideGeofence: officeStatus.isInsideOfficeRadius,
  };
};

const getLiveTracking = async (query = {}) => {
  const locationId = query.locationId ? parseInt(query.locationId, 10) : null;
  const search = query.search ? query.search.toLowerCase() : null;
  const geofenceFilter = query.geofenceStatus;
  const staleSeconds = liveLocationService.getStaleSeconds();

  let selectedOffice = null;
  let assignedCount = 0;
  let liveRows = [];
  let todayPunchRows = [];

  if (locationId) {
    selectedOffice = await fetchOfficeById(locationId);
    const assignedEmployees = await liveLocationModel.getEmployeesByOffice(locationId);
    assignedCount = assignedEmployees.length;

    const liveDbRows = await liveLocationModel.getLatestLiveByOfficeLatest(
      locationId,
      staleSeconds
    );
    liveRows = liveDbRows.map(mapLiveDbRow);
    todayPunchRows = await getTodayPunchSummaryForOffice(locationId);
  } else {
    liveRows = await liveLocationService.getLiveLocations(query);
    todayPunchRows = await getTodayPunchSummary();
    const activeOffices = await fetchActiveOffices();
    selectedOffice = activeOffices[0] || null;
  }

  let merged = mergeLiveAndPunch(liveRows, todayPunchRows).map(resolveMapCoordinates);

  merged = merged.filter((row) => {
    if (row.latitude == null || row.longitude == null) return false;
    if (locationId) {
      // Show assigned employees with last known location even if not from today
      if (!search) return true;
    } else if (!row.hasActivityToday) {
      return false;
    }
    if (!search) return true;
    return (
      row.empCode?.toString().toLowerCase().includes(search) ||
      row.empName?.toString().toLowerCase().includes(search)
    );
  });

  const officeMap = buildOfficeMap(await liveLocationModel.getEmployeeOfficeMap());
  const officeForRadius = toOfficeForRadius(selectedOffice);

  let enrichedEmployees = merged.map((emp) => {
    const assignedOfficeRow = officeMap.get(emp.empCode?.toString());
    const radiusOffice = locationId
      ? officeForRadius
      : toOfficeForRadius(assignedOfficeRow) || officeForRadius;
    return enrichEmployeeForMap(emp, radiusOffice);
  });

  if (geofenceFilter === "inside") {
    enrichedEmployees = enrichedEmployees.filter((e) => e.geofenceStatus === "inside");
  } else if (geofenceFilter === "outside") {
    enrichedEmployees = enrichedEmployees.filter((e) => e.geofenceStatus === "outside");
  }

  const office = formatOfficeForResponse(selectedOffice);

  let hint = null;
  if (locationId && !selectedOffice) {
    hint = "Office not found in AttendanceLocations for this locationId.";
  } else if (!selectedOffice) {
    hint = "No active office in AttendanceLocations table. Add office via POST /api/admin/offices.";
  } else if (locationId && assignedCount === 0) {
    hint = "No employees assigned to this office. Use PUT /api/admin/employees/:id with locationId.";
  } else if (locationId && enrichedEmployees.length === 0) {
    hint = "Employees assigned but no location data yet. Send POST /api/attendance/live-location from mobile.";
  } else if (locationId && enrichedEmployees.some((e) => e.isStaleLocation)) {
    hint = "Showing last known locations (not live today). Ask employees to send GPS via POST /api/attendance/live-location.";
  } else if (locationId && enrichedEmployees.length > 0) {
    const outsideCount = enrichedEmployees.filter((e) => e.geofenceStatus === "outside").length;
    if (outsideCount === enrichedEmployees.length) {
      hint = "Employees found but all are outside office radius. Zoom out on map — marker may be far from office circle.";
    }
  }

  return {
    employees: enrichedEmployees,
    geofences: [],
    office,
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

const getTrackingAnalytics = async (query = {}) => {
  const locationId = query.locationId ? parseInt(query.locationId, 10) : null;
  const liveData = await getLiveTracking({ ...query, locationId });

  const officeWise = await new sql.Request().query(`
    SELECT
      l.LocationID AS locationId,
      l.LocationName AS officeName,
      COUNT(u.fkEmpId) AS assignedEmployees
    FROM dbo.AttendanceLocations l
    LEFT JOIN dbo.AppUser u ON u.fkLocationId = l.LocationID AND u.fkEmpId IS NOT NULL
    WHERE l.IsActive = 1
    GROUP BY l.LocationID, l.LocationName
    ORDER BY l.LocationName
  `);

  const today = new Date().toISOString().split("T")[0];
  const punchStats = await new sql.Request()
    .input("today", sql.VarChar, today)
    .query(`
      SELECT
        COUNT(DISTINCT CASE WHEN Punch = 'Check IN' THEN EmpCode END) AS checkedInToday,
        COUNT(DISTINCT CASE WHEN Punch = 'Check OUT' THEN EmpCode END) AS checkedOutToday
      FROM Attendance
      WHERE AtDate = @today
    `);

  const suspiciousCount = await new sql.Request().query(`
    SELECT COUNT(*) AS suspiciousCount
    FROM (
      SELECT emp_code,
             ROW_NUMBER() OVER (PARTITION BY emp_code ORDER BY recorded_at DESC) AS rn
      FROM dbo.employee_live_locations
      WHERE CAST(recorded_at AS DATE) = CAST(GETDATE() AS DATE)
        AND is_suspicious = 1
    ) x
    WHERE x.rn = 1
  `);

  return {
    date: today,
    liveSummary: liveData.summary,
    office: liveData.office,
    officeWise: officeWise.recordset,
    punchStats: punchStats.recordset[0] || {},
    suspiciousGpsCount: Number(suspiciousCount.recordset[0]?.suspiciousCount || 0),
    employees: liveData.employees,
  };
};

const getRoutePlayback = async (employeeId, query = {}) => {
  const { resolveFinalEmpCode } = require("../../utils/resolveEmpCode");
  const resolved = await resolveFinalEmpCode(employeeId);
  const empCode = resolved.empCode ?? employeeId;

  let sinceSeconds = query.sinceSeconds ? parseInt(query.sinceSeconds, 10) : null;
  if (sinceSeconds == null && query.sinceMinutes) {
    sinceSeconds = parseInt(query.sinceMinutes, 10) * 60;
  }
  if (sinceSeconds == null) {
    sinceSeconds = 86400;
  }

  const rows = await liveLocationModel.getTrailPlayback(empCode, {
    sinceSeconds,
    limit: Math.min(parseInt(query.limit, 10) || 1000, 2000),
  });

  const points = rows.map((row, index) => {
    let segmentDistanceMeters = 0;
    let segmentDurationSeconds = 0;

    if (index > 0) {
      const prev = rows[index - 1];
      segmentDistanceMeters = Math.round(
        calculateDistance(
          Number(prev.latitude),
          Number(prev.longitude),
          Number(row.latitude),
          Number(row.longitude)
        )
      );
      segmentDurationSeconds = Math.max(
        0,
        Math.floor(
          (new Date(row.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 1000
        )
      );
    }

    return {
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
      segmentDistanceMeters,
      segmentDurationSeconds,
    };
  });

  const totalDistanceMeters = points.reduce(
    (sum, point) => sum + (point.segmentDistanceMeters || 0),
    0
  );
  const durationSeconds =
    points.length >= 2
      ? Math.floor(
          (new Date(points[points.length - 1].recordedAt).getTime() -
            new Date(points[0].recordedAt).getTime()) /
            1000
        )
      : 0;

  return {
    empCode: empCode.toString(),
    empName: resolved.empName,
    playback: {
      points,
      totalPoints: points.length,
      totalDistanceMeters,
      durationSeconds,
      startAt: points[0]?.recordedAt || null,
      endAt: points[points.length - 1]?.recordedAt || null,
    },
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
  const lastSeen = computeLastSeen(latest?.recorded_at);

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
          isSuspicious: !!latest.is_suspicious,
          gpsRiskScore: latest.gps_risk_score,
          gpsFlags: latest.gps_flags,
          ...lastSeen,
        }
      : null,
  };
};

module.exports = {
  getLiveTracking,
  getTrackingAnalytics,
  getRoutePlayback,
  getTrackingHistory,
  getLiveTrail,
  getEmployeeLiveSnapshot,
};
