const { query } = require("../../config/db");
const { toDateString, parseDate } = require("../utils/dateUtils");
const officesService = require("./officesService");

const getAttendanceReport = async (q = {}) => {
  const startDate = q.startDate ? toDateString(parseDate(q.startDate)) : toDateString();
  const endDate = q.endDate ? toDateString(parseDate(q.endDate)) : startDate;

  const result = await query(
    `SELECT "AtDate", COUNT(DISTINCT "EmpCode") AS "presentCount"
     FROM "Attendance"
     WHERE "AtDate" BETWEEN $1 AND $2 AND "Punch" = 'Check IN'
     GROUP BY "AtDate"
     ORDER BY "AtDate"`,
    [startDate, endDate]
  );

  return { range: { startDate, endDate }, daily: result.rows };
};

const getProductivityReport = async (q = {}) => {
  const startDate = q.startDate ? toDateString(parseDate(q.startDate)) : toDateString();
  const endDate = q.endDate ? toDateString(parseDate(q.endDate)) : startDate;

  const result = await query(
    `SELECT "EmpCode", "AtDate",
            MIN("PunchDatetime") AS "firstPunch",
            MAX("PunchDatetime") AS "lastPunch"
     FROM "Attendance"
     WHERE "AtDate" BETWEEN $1 AND $2
     GROUP BY "EmpCode", "AtDate"
     ORDER BY "AtDate" DESC`,
    [startDate, endDate]
  );

  const productivity = result.rows.map((row) => {
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

  return { range: { startDate, endDate }, productivity };
};

const getOfficeReport = async () => {
  const offices = await officesService.buildOfficeAnalytics();
  return { offices };
};

module.exports = { getAttendanceReport, getProductivityReport, getOfficeReport };
