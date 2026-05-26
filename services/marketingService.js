const { query } = require("../config/db");
const User = require("../models/userModel");
const {
  MarketingApiError,
  ensureMarketingUserId,
  normalizeNumber,
  formatDateForTimezone,
  buildAttendanceDeviceInfo,
  serializeDeviceInfo,
  resolveAttendanceLocation,
} = require("../utils/marketingAttendance");

const getOpenAttendanceLog = async (userId) => {
  const result = await query(
    `SELECT * FROM marketing_attendance_logs
     WHERE user_id = $1 AND punch_out_time IS NULL
     ORDER BY punch_in_time DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
};

const getAttendanceLogByDate = async (userId, attendanceDate) => {
  const result = await query(
    `SELECT * FROM marketing_attendance_logs
     WHERE user_id = $1 AND attendance_date = $2
     ORDER BY punch_in_time DESC LIMIT 1`,
    [userId, attendanceDate]
  );
  return result.rows[0] || null;
};

exports.punchIn = async ({ userId, latitude, longitude, accuracy, remark, userAgent, userIp }) => {
  ensureMarketingUserId(userId);

  const user = await User.findByPkUserIdCore(userId);
  if (!user) {
    throw new MarketingApiError("User account not found. Please login again.", 401, "USER_NOT_FOUND");
  }

  const { normalizeGpsReading } = require("../utils/gpsCoordinates");
  const normalized = normalizeGpsReading({ latitude, longitude, accuracy });
  if (normalized.rejected) {
    throw new MarketingApiError(
      normalized.rejectReason,
      normalized.rejectCode === "GPS_ACCURACY_TOO_LOW" ? 422 : 400,
      normalized.rejectCode
    );
  }

  const parsedLatitude = normalized.latitude;
  const parsedLongitude = normalized.longitude;
  const openAttendance = await getOpenAttendanceLog(userId);

  if (openAttendance) {
    throw new MarketingApiError("You already have an active punch-in", 400, "ACTIVE_PUNCH_EXISTS");
  }

  const attendanceDate = formatDateForTimezone();
  const todayAttendance = await getAttendanceLogByDate(userId, attendanceDate);

  if (todayAttendance) {
    throw new MarketingApiError("Attendance already exists for today", 400, "TODAY_ATTENDANCE_EXISTS");
  }

  const matchedLocation = await resolveAttendanceLocation(userId, parsedLatitude, parsedLongitude);

  const result = await query(
    `INSERT INTO marketing_attendance_logs (
       user_id, attendance_date, punch_in_time, total_work_minutes,
       punch_in_latitude, punch_in_longitude, punch_in_address,
       location_type, location_id, allowed_radius, actual_distance_meters,
       punch_in_status, punch_in_remark, user_ip, user_agent
     ) VALUES ($1, $2, NOW(), 0, $3, $4, $5, $6, $7, $8, $9, 'success', $10, $11, $12)
     RETURNING *`,
    [
      userId, attendanceDate, parsedLatitude, parsedLongitude,
      matchedLocation.address, matchedLocation.location_type,
      matchedLocation.location_id, Number(matchedLocation.allowed_radius),
      Number(matchedLocation.distance), remark || null,
      userIp || null, userAgent || null,
    ]
  );

  const attendance = result.rows[0];

  return {
    attendance,
    matched_location: {
      matching_rule: matchedLocation.matching_rule,
      location_type: matchedLocation.location_type,
      location_id: matchedLocation.location_id,
      location_name: matchedLocation.location_name,
      allowed_radius: Number(matchedLocation.allowed_radius),
      actual_distance_meters: Number(matchedLocation.distance),
      address: matchedLocation.address,
    },
  };
};
