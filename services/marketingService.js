const { sql } = require("../config/db");
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
  const result = await new sql.Request()
    .input('userId', sql.VarChar, userId)
    .query(`
      SELECT TOP 1 *
      FROM marketing_attendance_logs
      WHERE user_id = @userId
        AND punch_out_time IS NULL
      ORDER BY punch_in_time DESC
    `);
  return result.recordset[0] || null;
};

const getAttendanceLogByDate = async (userId, attendanceDate) => {
  const result = await new sql.Request()
    .input('userId', sql.VarChar, userId)
    .input('attendanceDate', sql.Date, attendanceDate)
    .query(`
      SELECT TOP 1 *
      FROM marketing_attendance_logs
      WHERE user_id = @userId
        AND attendance_date = @attendanceDate
      ORDER BY punch_in_time DESC
    `);
  return result.recordset[0] || null;
};

exports.punchIn = async ({
  userId,
  latitude,
  longitude,
  remark,
  userAgent,
  userIp,
}) => {
  ensureMarketingUserId(userId);

  const user = await User.findByPkUserIdCore(userId);
  if (!user) {
    throw new MarketingApiError("User account not found. Please login again.", 401, "USER_NOT_FOUND");
  }

  const parsedLatitude = normalizeNumber(latitude, "Latitude");
  const parsedLongitude = normalizeNumber(longitude, "Longitude");
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

  const result = await new sql.Request()
    .input('userId', sql.VarChar, userId)
    .input('attendanceDate', sql.Date, attendanceDate)
    .input('latitude', sql.Numeric, parsedLatitude)
    .input('longitude', sql.Numeric, parsedLongitude)
    .input('address', sql.VarChar, matchedLocation.address)
    .input('locationType', sql.VarChar, matchedLocation.location_type)
    .input('locationId', sql.VarChar, matchedLocation.location_id)
    .input('allowedRadius', sql.Numeric, Number(matchedLocation.allowed_radius))
    .input('actualDistance', sql.Numeric, Number(matchedLocation.distance))
    .input('remark', sql.VarChar, remark || null)
    .input('userIp', sql.VarChar, userIp || null)
    .input('userAgent', sql.VarChar, userAgent || null)
    .query(`
      INSERT INTO marketing_attendance_logs (
        user_id,
        attendance_date,
        punch_in_time,
        total_work_minutes,
        punch_in_latitude,
        punch_in_longitude,
        punch_in_address,
        location_type,
        location_id,
        allowed_radius,
        actual_distance_meters,
        punch_in_status,
        punch_in_remark,
        user_ip,
        user_agent
      )
      OUTPUT INSERTED.*
      VALUES (
        @userId,
        @attendanceDate,
        SYSUTCDATETIME(),
        0,
        @latitude,
        @longitude,
        @address,
        @locationType,
        @locationId,
        @allowedRadius,
        @actualDistance,
        'success',
        @remark,
        @userIp,
        @userAgent
      )
    `);

  const attendance = result.recordset[0];

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
