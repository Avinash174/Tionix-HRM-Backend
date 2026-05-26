const { query, pool } = require("../config/db");
const { createLiveLocationTableSql, isMysql, joinUserToLocation, filterUserLocationId } = require("../config/dialect");
const { getFixedOfficeByLocationId } = require("../config/officeGeofences");

let tableReady = false;

const ensureLiveLocationTable = async () => {
  if (tableReady) return;

  await query(createLiveLocationTableSql());

  // Create indexes if not exist (PostgreSQL safe way)
  await query(`
    CREATE INDEX IF NOT EXISTS ix_live_loc_emp_code
      ON employee_live_locations (emp_code, recorded_at DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS ix_live_loc_recorded_at
      ON employee_live_locations (recorded_at DESC)
  `);

  tableReady = true;
};

const insertLocation = async (record) => {
  await ensureLiveLocationTable();

  const result = await query(
    `INSERT INTO employee_live_locations (
       emp_code, emp_name, latitude, longitude,
       accuracy_meters, heading, speed, address, device_info,
       is_suspicious, gps_risk_score, gps_flags
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, recorded_at`,
    [
      record.empCode.toString(),
      record.empName,
      record.latitude,
      record.longitude,
      record.accuracyMeters,
      record.heading,
      record.speed,
      record.address,
      record.deviceInfo,
      isMysql() ? (record.isSuspicious ? 1 : 0) : record.isSuspicious ? true : false,
      record.gpsRiskScore ?? null,
      record.gpsFlags ?? null,
    ]
  );
  return result.rows[0];
};

const getLatestByAllEmployees = async (staleSeconds = 45) => {
  await ensureLiveLocationTable();

  const result = await query(
    `SELECT
       l.emp_code, l.emp_name, l.latitude, l.longitude,
       l.accuracy_meters, l.heading, l.speed, l.address, l.recorded_at,
       CASE
         WHEN l.recorded_at >= NOW() - ($1 || ' seconds')::INTERVAL THEN 'online'
         ELSE 'offline'
       END AS live_status
     FROM (
       SELECT *,
         ROW_NUMBER() OVER (PARTITION BY emp_code ORDER BY recorded_at DESC) AS rn
       FROM employee_live_locations
     ) l
     WHERE l.rn = 1
     ORDER BY l.recorded_at DESC`,
    [staleSeconds]
  );
  return result.rows;
};

const getLatestByEmployee = async (empCode) => {
  await ensureLiveLocationTable();

  const result = await query(
    `SELECT id, emp_code, emp_name, latitude, longitude,
            accuracy_meters, heading, speed, address, device_info, recorded_at
     FROM employee_live_locations
     WHERE emp_code = $1
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [empCode.toString()]
  );
  return result.rows[0] || null;
};

const getTrail = async (empCode, { limit = 100, sinceSeconds = null } = {}) => {
  await ensureLiveLocationTable();

  let text = `
    SELECT id, emp_code, emp_name, latitude, longitude,
           accuracy_meters, heading, speed, address, device_info, recorded_at
    FROM employee_live_locations
    WHERE emp_code = $1
  `;
  const params = [empCode.toString()];

  if (sinceSeconds != null && Number.isFinite(Number(sinceSeconds))) {
    params.push(Number(sinceSeconds));
    text += ` AND recorded_at >= NOW() - ($${params.length} || ' seconds')::INTERVAL`;
  }

  params.push(limit);
  text += ` ORDER BY recorded_at DESC LIMIT $${params.length}`;

  const result = await query(text, params);
  return result.rows;
};

const getTrailPlayback = async (empCode, { sinceSeconds = 86400, limit = 1000 } = {}) => {
  await ensureLiveLocationTable();

  const result = await query(
    `SELECT id, emp_code, emp_name, latitude, longitude,
            accuracy_meters, heading, speed, address, device_info,
            is_suspicious, gps_risk_score, gps_flags, recorded_at
     FROM employee_live_locations
     WHERE emp_code = $1
       AND recorded_at >= NOW() - ($2 || ' seconds')::INTERVAL
     ORDER BY recorded_at ASC
     LIMIT $3`,
    [empCode.toString(), sinceSeconds, limit]
  );
  return result.rows;
};

const getLatestLiveByOffice = async (locationId, staleSeconds = 45) => {
  await ensureLiveLocationTable();

  const result = await query(
    `SELECT
       l.emp_code, l.emp_name, l.latitude, l.longitude,
       l.accuracy_meters, l.heading, l.speed, l.address, l.recorded_at,
       l.is_suspicious, l.gps_risk_score, l.gps_flags,
       CASE
         WHEN l.recorded_at >= NOW() - ($2 || ' seconds')::INTERVAL THEN 'online'
         ELSE 'offline'
       END AS live_status
     FROM (
       SELECT el.*,
              ROW_NUMBER() OVER (PARTITION BY el.emp_code ORDER BY el.recorded_at DESC) AS rn
       FROM employee_live_locations el
       INNER JOIN "dbo.AppUser" u ON u."fkEmpId"::TEXT = el.emp_code
       WHERE ${filterUserLocationId("u", 1)}
         AND u."fkEmpId" IS NOT NULL
         AND el.recorded_at::date = CURRENT_DATE
     ) l
     WHERE l.rn = 1
     ORDER BY l.recorded_at DESC`,
    [locationId, staleSeconds]
  );
  return result.rows;
};

const getLatestLiveByOfficeLatest = async (locationId, staleSeconds = 45) => {
  await ensureLiveLocationTable();

  const result = await query(
    `SELECT
       l.emp_code, l.emp_name, l.latitude, l.longitude,
       l.accuracy_meters, l.heading, l.speed, l.address, l.recorded_at,
       l.is_suspicious, l.gps_risk_score, l.gps_flags,
       CASE
         WHEN l.recorded_at >= NOW() - ($2 || ' seconds')::INTERVAL THEN 'online'
         ELSE 'offline'
       END AS live_status,
       CASE WHEN l.recorded_at::date = CURRENT_DATE THEN 1 ELSE 0 END AS is_today
     FROM (
       SELECT el.*,
              ROW_NUMBER() OVER (PARTITION BY el.emp_code ORDER BY el.recorded_at DESC) AS rn
       FROM employee_live_locations el
       INNER JOIN "dbo.AppUser" u ON u."fkEmpId"::TEXT = el.emp_code
       WHERE ${filterUserLocationId("u", 1)}
         AND u."fkEmpId" IS NOT NULL
     ) l
     WHERE l.rn = 1
     ORDER BY l.recorded_at DESC`,
    [locationId, staleSeconds]
  );
  return result.rows;
};

const getEmployeesByOffice = async (locationId) => {
  const result = await query(
    `SELECT "fkEmpId", "UserName", "fkLocationId"
     FROM "dbo.AppUser"
     WHERE NULLIF(TRIM("fkLocationId"), '')::bigint = $1::bigint AND "fkEmpId" IS NOT NULL`,
    [locationId]
  );
  return result.rows;
};

const getEmployeeOfficeMap = async () => {
  const result = await query(
    `SELECT u."fkEmpId", u."UserName", u."fkLocationId"
     FROM "dbo.AppUser" u
     WHERE u."fkEmpId" IS NOT NULL`
  );

  return result.rows.map((row) => {
    const locationId = row.fkLocationId != null ? Number(row.fkLocationId) : null;
    const fixed = locationId ? getFixedOfficeByLocationId(locationId) : null;
    if (!fixed) {
      return {
        fkEmpId: row.fkEmpId,
        UserName: row.UserName,
        fkLocationId: row.fkLocationId,
        LocationID: null,
        LocationName: null,
        Latitude: null,
        Longitude: null,
        AllowedRadius: null,
        Address: null,
      };
    }
    return {
      fkEmpId: row.fkEmpId,
      UserName: row.UserName,
      fkLocationId: row.fkLocationId,
      LocationID: fixed.locationId,
      LocationName: fixed.name,
      Latitude: fixed.latitude,
      Longitude: fixed.longitude,
      AllowedRadius: fixed.allowed_radius,
      Address: fixed.address,
    };
  });
};

module.exports = {
  ensureLiveLocationTable,
  insertLocation,
  getLatestByAllEmployees,
  getLatestByEmployee,
  getTrail,
  getTrailPlayback,
  getLatestLiveByOffice,
  getLatestLiveByOfficeLatest,
  getEmployeesByOffice,
  getEmployeeOfficeMap,
};
