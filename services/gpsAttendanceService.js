const GpsAttendance = require("../models/gpsAttendanceModel");
const { evaluateGpsAttendance } = require("../utils/gpsValidation");

class GpsAttendanceError extends Error {
  constructor(message, statusCode = 400, code = "GPS_ATTENDANCE_ERROR", details = {}) {
    super(message);
    this.name = "GpsAttendanceError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const normalizeAttendanceType = (value) => {
  const normalized = String(value || "check_in").trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "checkin" || normalized === "punch_in" || normalized === "in") {
    return "check_in";
  }
  if (normalized === "checkout" || normalized === "punch_out" || normalized === "out") {
    return "check_out";
  }
  if (normalized === "check_in" || normalized === "check_out") {
    return normalized;
  }

  throw new GpsAttendanceError(
    "attendanceType must be check_in or check_out",
    400,
    "INVALID_ATTENDANCE_TYPE"
  );
};

const ensureEmployeeId = (employeeId) => {
  if (!employeeId) {
    throw new GpsAttendanceError("Employee session is invalid", 401, "UNAUTHORIZED");
  }
};

const markAttendance = async ({ employeeId, latitude, longitude, attendanceType }) => {
  ensureEmployeeId(employeeId);

  const normalizedType = normalizeAttendanceType(attendanceType);
  const evaluation = evaluateGpsAttendance(latitude, longitude);
  const timestamp = new Date();
  const attendanceDate = GpsAttendance.getAttendanceDate(timestamp);

  const record = {
    employeeId,
    attendanceType: normalizedType,
    attendanceDate,
    timestamp,
    employeeLatitude: evaluation.employeeLatitude,
    employeeLongitude: evaluation.employeeLongitude,
    employeeAddress: evaluation.employeeAddress,
    officeLatitude: evaluation.officeLatitude,
    officeLongitude: evaluation.officeLongitude,
    distanceMeters: evaluation.distanceMeters,
    allowedRadiusMeters: evaluation.allowedRadiusMeters,
    attendanceStatus: evaluation.attendanceStatus,
  };

  if (!evaluation.isWithinRange) {
    await GpsAttendance.createAttendanceRecord(record);
    throw new GpsAttendanceError(
      `Attendance rejected. You are ${evaluation.distanceMeters.toFixed(2)} meters from the office. Allowed radius is ${evaluation.allowedRadiusMeters} meters.`,
      403,
      "OUT_OF_RANGE",
      {
        attendanceStatus: record.attendanceStatus,
        distanceMeters: record.distanceMeters,
        allowedRadiusMeters: record.allowedRadiusMeters,
      }
    );
  }

  const existingRecord = await GpsAttendance.findAttendanceForDate(
    employeeId,
    normalizedType,
    attendanceDate
  );

  if (existingRecord) {
    throw new GpsAttendanceError(
      `You have already marked ${normalizedType.replace("_", " ")} for today.`,
      400,
      "DUPLICATE_ATTENDANCE"
    );
  }

  const savedRecord = await GpsAttendance.createAttendanceRecord(record);

  return {
    attendance: savedRecord,
    validation: {
      distanceMeters: savedRecord.distanceMeters,
      allowedRadiusMeters: savedRecord.allowedRadiusMeters,
      attendanceStatus: savedRecord.attendanceStatus,
    },
  };
};

const getEmployeeAttendance = async (employeeId) => {
  ensureEmployeeId(employeeId);
  return GpsAttendance.findAttendanceByEmployee(employeeId);
};

module.exports = {
  GpsAttendanceError,
  markAttendance,
  getEmployeeAttendance,
};
