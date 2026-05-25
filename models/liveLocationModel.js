const { sql } = require("../config/db");

let tableReady = false;

const ensureLiveLocationTable = async () => {
  if (tableReady) return;

  await new sql.Request().query(`
    IF OBJECT_ID(N'dbo.employee_live_locations', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.employee_live_locations (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        emp_code NVARCHAR(50) NOT NULL,
        emp_name NVARCHAR(100) NULL,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        accuracy_meters DECIMAL(10, 2) NULL,
        heading DECIMAL(10, 2) NULL,
        speed DECIMAL(10, 2) NULL,
        address NVARCHAR(500) NULL,
        device_info NVARCHAR(500) NULL,
        is_suspicious BIT NULL DEFAULT 0,
        gps_risk_score INT NULL,
        gps_flags NVARCHAR(500) NULL,
        recorded_at DATETIME2 NOT NULL CONSTRAINT DF_employee_live_locations_recorded_at DEFAULT (SYSUTCDATETIME())
      );
      CREATE INDEX IX_employee_live_locations_emp_code ON dbo.employee_live_locations (emp_code, recorded_at DESC);
      CREATE INDEX IX_employee_live_locations_recorded_at ON dbo.employee_live_locations (recorded_at DESC);
    END
    ELSE
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.employee_live_locations') AND name = N'is_suspicious')
        ALTER TABLE dbo.employee_live_locations ADD is_suspicious BIT NULL DEFAULT 0;
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.employee_live_locations') AND name = N'gps_risk_score')
        ALTER TABLE dbo.employee_live_locations ADD gps_risk_score INT NULL;
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.employee_live_locations') AND name = N'gps_flags')
        ALTER TABLE dbo.employee_live_locations ADD gps_flags NVARCHAR(500) NULL;
    END
  `);

  tableReady = true;
};

const insertLocation = async (record) => {
  await ensureLiveLocationTable();

  const result = await new sql.Request()
    .input("empCode", sql.NVarChar, record.empCode.toString())
    .input("empName", sql.NVarChar, record.empName)
    .input("latitude", sql.Decimal(10, 7), record.latitude)
    .input("longitude", sql.Decimal(10, 7), record.longitude)
    .input("accuracyMeters", sql.Decimal(10, 2), record.accuracyMeters)
    .input("heading", sql.Decimal(10, 2), record.heading)
    .input("speed", sql.Decimal(10, 2), record.speed)
    .input("address", sql.NVarChar, record.address)
    .input("deviceInfo", sql.NVarChar, record.deviceInfo)
    .input("isSuspicious", sql.Bit, record.isSuspicious ? 1 : 0)
    .input("gpsRiskScore", sql.Int, record.gpsRiskScore ?? null)
    .input("gpsFlags", sql.NVarChar, record.gpsFlags ?? null)
    .query(`
      INSERT INTO dbo.employee_live_locations (
        emp_code, emp_name, latitude, longitude,
        accuracy_meters, heading, speed, address, device_info,
        is_suspicious, gps_risk_score, gps_flags
      )
      OUTPUT INSERTED.id, INSERTED.recorded_at
      VALUES (
        @empCode, @empName, @latitude, @longitude,
        @accuracyMeters, @heading, @speed, @address, @deviceInfo,
        @isSuspicious, @gpsRiskScore, @gpsFlags
      )
    `);

  return result.recordset[0];
};

const getLatestByAllEmployees = async (staleSeconds = 45) => {
  await ensureLiveLocationTable();

  const result = await new sql.Request()
    .input("staleSeconds", sql.Int, staleSeconds)
    .query(`
      SELECT
        l.emp_code,
        l.emp_name,
        l.latitude,
        l.longitude,
        l.accuracy_meters,
        l.heading,
        l.speed,
        l.address,
        l.recorded_at,
        CASE
          WHEN l.recorded_at >= DATEADD(SECOND, -@staleSeconds, SYSUTCDATETIME()) THEN 'online'
          ELSE 'offline'
        END AS live_status
      FROM (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY emp_code ORDER BY recorded_at DESC) AS rn
        FROM dbo.employee_live_locations
      ) l
      WHERE l.rn = 1
      ORDER BY l.recorded_at DESC
    `);

  return result.recordset;
};

const getLatestByEmployee = async (empCode) => {
  await ensureLiveLocationTable();

  const result = await new sql.Request()
    .input("empCode", sql.NVarChar, empCode.toString())
    .query(`
      SELECT TOP 1
        id, emp_code, emp_name, latitude, longitude,
        accuracy_meters, heading, speed, address, device_info, recorded_at
      FROM dbo.employee_live_locations
      WHERE emp_code = @empCode
      ORDER BY recorded_at DESC
    `);

  return result.recordset[0] || null;
};

const getTrail = async (empCode, { limit = 100, sinceSeconds = null } = {}) => {
  await ensureLiveLocationTable();

  const request = new sql.Request()
    .input("empCode", sql.NVarChar, empCode.toString())
    .input("limit", sql.Int, limit);

  let sinceClause = "";
  if (sinceSeconds != null && Number.isFinite(Number(sinceSeconds))) {
    request.input("sinceSeconds", sql.Int, Number(sinceSeconds));
    sinceClause = "AND recorded_at >= DATEADD(SECOND, -@sinceSeconds, SYSUTCDATETIME())";
  }

  const result = await request.query(`
    SELECT TOP (@limit)
      id, emp_code, emp_name, latitude, longitude,
      accuracy_meters, heading, speed, address, device_info, recorded_at
    FROM dbo.employee_live_locations
    WHERE emp_code = @empCode
    ${sinceClause}
    ORDER BY recorded_at DESC
  `);

  return result.recordset;
};

const getTrailPlayback = async (empCode, { sinceSeconds = 86400, limit = 1000 } = {}) => {
  await ensureLiveLocationTable();

  const result = await new sql.Request()
    .input("empCode", sql.NVarChar, empCode.toString())
    .input("sinceSeconds", sql.Int, sinceSeconds)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT TOP (@limit)
        id, emp_code, emp_name, latitude, longitude,
        accuracy_meters, heading, speed, address, device_info,
        is_suspicious, gps_risk_score, gps_flags, recorded_at
      FROM dbo.employee_live_locations
      WHERE emp_code = @empCode
        AND recorded_at >= DATEADD(SECOND, -@sinceSeconds, SYSUTCDATETIME())
      ORDER BY recorded_at ASC
    `);

  return result.recordset;
};

const getLatestLiveByOffice = async (locationId, staleSeconds = 45) => {
  await ensureLiveLocationTable();

  const result = await new sql.Request()
    .input("locationId", sql.Int, locationId)
    .input("staleSeconds", sql.Int, staleSeconds)
    .query(`
      SELECT
        l.emp_code,
        l.emp_name,
        l.latitude,
        l.longitude,
        l.accuracy_meters,
        l.heading,
        l.speed,
        l.address,
        l.recorded_at,
        l.is_suspicious,
        l.gps_risk_score,
        l.gps_flags,
        CASE
          WHEN l.recorded_at >= DATEADD(SECOND, -@staleSeconds, SYSUTCDATETIME()) THEN 'online'
          ELSE 'offline'
        END AS live_status
      FROM (
        SELECT el.*,
               ROW_NUMBER() OVER (PARTITION BY el.emp_code ORDER BY el.recorded_at DESC) AS rn
        FROM dbo.employee_live_locations el
        INNER JOIN dbo.AppUser u ON CAST(u.fkEmpId AS NVARCHAR(50)) = el.emp_code
        WHERE u.fkLocationId = @locationId
          AND u.fkEmpId IS NOT NULL
          AND CAST(el.recorded_at AS DATE) = CAST(GETDATE() AS DATE)
      ) l
      WHERE l.rn = 1
      ORDER BY l.recorded_at DESC
    `);

  return result.recordset;
};

const getLatestLiveByOfficeLatest = async (locationId, staleSeconds = 45) => {
  await ensureLiveLocationTable();

  const result = await new sql.Request()
    .input("locationId", sql.Int, locationId)
    .input("staleSeconds", sql.Int, staleSeconds)
    .query(`
      SELECT
        l.emp_code,
        l.emp_name,
        l.latitude,
        l.longitude,
        l.accuracy_meters,
        l.heading,
        l.speed,
        l.address,
        l.recorded_at,
        l.is_suspicious,
        l.gps_risk_score,
        l.gps_flags,
        CASE
          WHEN l.recorded_at >= DATEADD(SECOND, -@staleSeconds, GETDATE()) THEN 'online'
          ELSE 'offline'
        END AS live_status,
        CASE
          WHEN CAST(l.recorded_at AS DATE) = CAST(GETDATE() AS DATE) THEN 1
          ELSE 0
        END AS is_today
      FROM (
        SELECT el.*,
               ROW_NUMBER() OVER (PARTITION BY el.emp_code ORDER BY el.recorded_at DESC) AS rn
        FROM dbo.employee_live_locations el
        INNER JOIN dbo.AppUser u ON CAST(u.fkEmpId AS NVARCHAR(50)) = el.emp_code
        WHERE u.fkLocationId = @locationId
          AND u.fkEmpId IS NOT NULL
      ) l
      WHERE l.rn = 1
      ORDER BY l.recorded_at DESC
    `);

  return result.recordset;
};

const getEmployeesByOffice = async (locationId) => {
  const result = await new sql.Request()
    .input("locationId", sql.Int, locationId)
    .query(`
      SELECT fkEmpId, UserName, fkLocationId
      FROM dbo.AppUser
      WHERE fkLocationId = @locationId
        AND fkEmpId IS NOT NULL
    `);
  return result.recordset;
};

const getEmployeeOfficeMap = async () => {
  const result = await new sql.Request().query(`
    SELECT
      u.fkEmpId,
      u.UserName,
      u.fkLocationId,
      l.LocationID,
      l.LocationName,
      l.Latitude,
      l.Longitude,
      l.AllowedRadius,
      l.Address
    FROM dbo.AppUser u
    LEFT JOIN dbo.AttendanceLocations l ON u.fkLocationId = l.LocationID
    WHERE u.fkEmpId IS NOT NULL
  `);
  return result.recordset;
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
