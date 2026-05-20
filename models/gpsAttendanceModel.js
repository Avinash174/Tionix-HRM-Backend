const { sql } = require("../config/db");

const getAttendanceDate = (date = new Date()) =>
  date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const createAttendanceRecord = async (record) => {
  const result = await new sql.Request()
    .input('employeeId', sql.VarChar, record.employeeId)
    .input('attendanceType', sql.VarChar, record.attendanceType)
    .input('attendanceDate', sql.Date, record.attendanceDate)
    .input('recordedAt', sql.DateTime2, record.timestamp)
    .input('employeeLatitude', sql.Numeric, record.employeeLatitude)
    .input('employeeLongitude', sql.Numeric, record.employeeLongitude)
    .input('employeeAddress', sql.VarChar, record.employeeAddress)
    .input('officeLatitude', sql.Numeric, record.officeLatitude)
    .input('officeLongitude', sql.Numeric, record.officeLongitude)
    .input('distanceMeters', sql.Numeric, record.distanceMeters)
    .input('allowedRadiusMeters', sql.Numeric, record.allowedRadiusMeters)
    .input('attendanceStatus', sql.VarChar, record.attendanceStatus)
    .query(`
      INSERT INTO dbo.gps_attendance_logs (
        employee_id,
        attendance_type,
        attendance_date,
        recorded_at,
        employee_latitude,
        employee_longitude,
        employee_address,
        office_latitude,
        office_longitude,
        distance_meters,
        allowed_radius_meters,
        attendance_status
      )
      OUTPUT INSERTED.*
      VALUES (
        @employeeId,
        @attendanceType,
        @attendanceDate,
        @recordedAt,
        @employeeLatitude,
        @employeeLongitude,
        @employeeAddress,
        @officeLatitude,
        @officeLongitude,
        @distanceMeters,
        @allowedRadiusMeters,
        @attendanceStatus
      )
    `);

  return mapAttendanceRow(result.recordset[0]);
};

const findAttendanceByEmployee = async (employeeId, limit = 50) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const result = await new sql.Request()
    .input('employeeId', sql.VarChar, employeeId)
    .query(`
      SELECT TOP (${safeLimit})
        id,
        employee_id,
        attendance_type,
        attendance_date,
        recorded_at,
        employee_latitude,
        employee_longitude,
        employee_address,
        office_latitude,
        office_longitude,
        distance_meters,
        allowed_radius_meters,
        attendance_status
      FROM dbo.gps_attendance_logs
      WHERE employee_id = @employeeId
      ORDER BY recorded_at DESC
    `);

  return result.recordset.map(mapAttendanceRow);
};

const findAttendanceForDate = async (employeeId, attendanceType, attendanceDate) => {
  const result = await new sql.Request()
    .input('employeeId', sql.VarChar, employeeId)
    .input('attendanceType', sql.VarChar, attendanceType)
    .input('attendanceDate', sql.Date, attendanceDate)
    .query(`
      SELECT TOP 1 *
      FROM dbo.gps_attendance_logs
      WHERE employee_id = @employeeId
        AND attendance_type = @attendanceType
        AND attendance_date = @attendanceDate
        AND attendance_status = 'approved'
      ORDER BY recorded_at DESC
    `);

  return result.recordset[0] ? mapAttendanceRow(result.recordset[0]) : null;
};

const mapAttendanceRow = (row) => {
  if (!row) {
    return null;
  }

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
  createAttendanceRecord,
  findAttendanceByEmployee,
  findAttendanceForDate,
  getAttendanceDate,
};
