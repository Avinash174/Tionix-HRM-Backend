const { sql } = require("../../config/db");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { toDateString, parseDate } = require("../utils/dateUtils");

const listAttendance = async (query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const empCode = query.empCode ? query.empCode.toString() : null;
  const startDate = query.startDate ? toDateString(parseDate(query.startDate)) : null;
  const endDate = query.endDate ? toDateString(parseDate(query.endDate)) : null;
  const punch = query.punch || null;

  const result = await new sql.Request()
    .input("empCode", sql.VarChar, empCode)
    .input("startDate", sql.VarChar, startDate)
    .input("endDate", sql.VarChar, endDate)
    .input("punch", sql.VarChar, punch)
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT EmpCode, EmpName, Punch, PunchDatetime, Latitude, Longitude, Address, Device, AtDate
      FROM Attendance
      WHERE (@empCode IS NULL OR EmpCode = @empCode)
        AND (@punch IS NULL OR Punch = @punch)
        AND (@startDate IS NULL OR AtDate >= @startDate)
        AND (@endDate IS NULL OR AtDate <= @endDate)
      ORDER BY PunchDatetime DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  const totalResult = await new sql.Request()
    .input("empCode", sql.VarChar, empCode)
    .input("startDate", sql.VarChar, startDate)
    .input("endDate", sql.VarChar, endDate)
    .input("punch", sql.VarChar, punch)
    .query(`
      SELECT COUNT(*) AS total
      FROM Attendance
      WHERE (@empCode IS NULL OR EmpCode = @empCode)
        AND (@punch IS NULL OR Punch = @punch)
        AND (@startDate IS NULL OR AtDate >= @startDate)
        AND (@endDate IS NULL OR AtDate <= @endDate)
    `);

  const total = Number(totalResult.recordset[0]?.total || 0);

  return {
    data: result.recordset,
    meta: buildPaginationMeta(page, limit, total),
  };
};

const getHistory = async (query = {}) => {
  const empCode = query.empCode ? query.empCode.toString() : null;
  const startDate = query.startDate ? toDateString(parseDate(query.startDate)) : null;
  const endDate = query.endDate ? toDateString(parseDate(query.endDate)) : null;

  const result = await new sql.Request()
    .input("empCode", sql.VarChar, empCode)
    .input("startDate", sql.VarChar, startDate)
    .input("endDate", sql.VarChar, endDate)
    .query(`
      SELECT EmpCode, AtDate,
        MIN(CASE WHEN Punch = 'Check IN' THEN PunchDatetime END) AS firstCheckIn,
        MAX(CASE WHEN Punch = 'Check OUT' THEN PunchDatetime END) AS lastCheckOut,
        COUNT(*) AS totalPunches
      FROM Attendance
      WHERE (@empCode IS NULL OR EmpCode = @empCode)
        AND (@startDate IS NULL OR AtDate >= @startDate)
        AND (@endDate IS NULL OR AtDate <= @endDate)
      GROUP BY EmpCode, AtDate
      ORDER BY AtDate DESC
    `);

  return result.recordset;
};

const getReports = async (query = {}) => {
  const startDate = query.startDate ? toDateString(parseDate(query.startDate)) : toDateString();
  const endDate = query.endDate ? toDateString(parseDate(query.endDate)) : startDate;

  const result = await new sql.Request()
    .input("startDate", sql.VarChar, startDate)
    .input("endDate", sql.VarChar, endDate)
    .query(`
      SELECT AtDate, COUNT(DISTINCT EmpCode) AS presentCount
      FROM Attendance
      WHERE AtDate BETWEEN @startDate AND @endDate
        AND Punch = 'Check IN'
      GROUP BY AtDate
      ORDER BY AtDate
    `);

  return {
    range: { startDate, endDate },
    daily: result.recordset,
  };
};

module.exports = {
  listAttendance,
  getHistory,
  getReports,
};
