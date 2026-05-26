const { query } = require("../config/db");
const { createGpsAttendanceLogsTableSql } = require("../config/dialect");

let tableReady = false;

const ensureGpsAttendanceLogsTable = async () => {
  if (tableReady) return;

  await query(createGpsAttendanceLogsTableSql());
  await query(`
    CREATE INDEX IF NOT EXISTS ix_gps_attendance_employee_id
      ON gps_attendance_logs (employee_id, recorded_at DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS ix_gps_attendance_date
      ON gps_attendance_logs (attendance_date DESC)
  `);

  tableReady = true;
};

const getAttendanceDate = (date = new Date()) =>
  date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const createLiveTrackingRecord = async (record) => {
  await ensureGpsAttendanceLogsTable();

  const result = await query(
    `INSERT INTO gps_attendance_logs (
       employee_id, attendance_type, attendance_date, recorded_at,
       employee_latitude, employee_longitude,
       office_latitude, office_longitude,
       distance_meters, allowed_radius_meters, attendance_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      record.employeeId.toString(),
      record.attendanceType || "LIVE_TRACKING",
      record.attendanceDate,
      record.timestamp || new Date(),
      record.employeeLatitude,
      record.employeeLongitude,
      record.officeLatitude,
      record.officeLongitude,
      record.distanceMeters,
      record.allowedRadiusMeters,
      record.attendanceStatus,
    ]
  );
  return mapAttendanceRow(result.rows[0]);
};

const createAttendanceRecord = async (record) => {
  await ensureGpsAttendanceLogsTable();

  const result = await query(
    `INSERT INTO gps_attendance_logs (
       employee_id, attendance_type, attendance_date, recorded_at,
       employee_latitude, employee_longitude, employee_address,
       office_latitude, office_longitude,
       distance_meters, allowed_radius_meters, attendance_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      record.employeeId,
      record.attendanceType,
      record.attendanceDate,
      record.timestamp,
      record.employeeLatitude,
      record.employeeLongitude,
      record.employeeAddress,
      record.officeLatitude,
      record.officeLongitude,
      record.distanceMeters,
      record.allowedRadiusMeters,
      record.attendanceStatus,
    ]
  );
  return mapAttendanceRow(result.rows[0]);
};

const findAttendanceByEmployee = async (employeeId, limit = 50) => {
  await ensureGpsAttendanceLogsTable();

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const result = await query(
    `SELECT id, employee_id, attendance_type, attendance_date, recorded_at,
            employee_latitude, employee_longitude, employee_address,
            office_latitude, office_longitude,
            distance_meters, allowed_radius_meters, attendance_status
     FROM gps_attendance_logs
     WHERE employee_id = $1
     ORDER BY recorded_at DESC
     LIMIT $2`,
    [employeeId, safeLimit]
  );
  return result.rows.map(mapAttendanceRow);
};

const findAttendanceForDate = async (employeeId, attendanceType, attendanceDate) => {
  await ensureGpsAttendanceLogsTable();

  const result = await query(
    `SELECT * FROM gps_attendance_logs
     WHERE employee_id = $1
       AND attendance_type = $2
       AND attendance_date = $3
       AND attendance_status = 'approved'
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [employeeId, attendanceType, attendanceDate]
  );
  return result.rows[0] ? mapAttendanceRow(result.rows[0]) : null;
};

const mapAttendanceRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    attendanceType: row.attendance_type,
    attendanceDate: row.attendance_date,
    timestamp: row.recorded_at,
    employeeLatitude: Number(row.employee_latitude),
    employeeLongitude: Number(row.employee_longitude),
    employeeAddress: row.employee_address,
    officeLatitude: Number(row.office_latitude),
    officeLongitude: Number(row.office_longitude),
    distanceMeters: Number(row.distance_meters),
    allowedRadiusMeters: Number(row.allowed_radius_meters),
    attendanceStatus: row.attendance_status,
  };
};

module.exports = {
  ensureGpsAttendanceLogsTable,
  createAttendanceRecord,
  createLiveTrackingRecord,
  findAttendanceByEmployee,
  findAttendanceForDate,
  getAttendanceDate,
};
