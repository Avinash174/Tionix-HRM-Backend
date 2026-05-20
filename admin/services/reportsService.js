const { sql } = require("../../config/db");
const { toDateString, parseDate } = require("../utils/dateUtils");
const officesService = require("./officesService");

const getAttendanceReport = async (query = {}) => {
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

const getProductivityReport = async (query = {}) => {
  const startDate = query.startDate ? toDateString(parseDate(query.startDate)) : toDateString();
  const endDate = query.endDate ? toDateString(parseDate(query.endDate)) : startDate;

  const result = await new sql.Request()
    .input("startDate", sql.VarChar, startDate)
    .input("endDate", sql.VarChar, endDate)
    .query(`
      SELECT EmpCode, AtDate,
             MIN(PunchDatetime) AS firstPunch,
             MAX(PunchDatetime) AS lastPunch
      FROM Attendance
      WHERE AtDate BETWEEN @startDate AND @endDate
      GROUP BY EmpCode, AtDate
      ORDER BY AtDate DESC
    `);

  const productivity = result.recordset.map((row) => {
    const start = row.firstPunch ? new Date(row.firstPunch) : null;
    const end = row.lastPunch ? new Date(row.lastPunch) : null;
    const hours = start && end ? (end - start) / (1000 * 60 * 60) : 0;
    return {
      empCode: row.EmpCode,
      date: row.AtDate,
      firstPunch: row.firstPunch,
      lastPunch: row.lastPunch,
      workHours: Number(hours.toFixed(2)),
    };
  });

  return {
    range: { startDate, endDate },
    productivity,
  };
};

const getOfficeReport = async () => {
  const offices = await officesService.buildOfficeAnalytics();
  return { offices };
};

module.exports = {
  getAttendanceReport,
  getProductivityReport,
  getOfficeReport,
};
