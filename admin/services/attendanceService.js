const { query } = require("../../config/db");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { toDateString, parseDate } = require("../utils/dateUtils");

const listAttendance = async (q = {}) => {
  const { page, limit, offset } = parsePagination(q);
  const empCode = q.empCode ? q.empCode.toString() : null;
  const startDate = q.startDate ? toDateString(parseDate(q.startDate)) : null;
  const endDate = q.endDate ? toDateString(parseDate(q.endDate)) : null;
  const punch = q.punch || null;

  const result = await query(
    `SELECT "EmpCode", "EmpName", "Punch", "PunchDatetime", "Latitude", "Longitude", "Address", "Device", "AtDate"
     FROM "Attendance"
     WHERE ($1::text IS NULL OR "EmpCode" = $1)
       AND ($2::text IS NULL OR "Punch" = $2)
       AND ($3::text IS NULL OR "AtDate" >= $3)
       AND ($4::text IS NULL OR "AtDate" <= $4)
     ORDER BY "PunchDatetime" DESC
     LIMIT $5 OFFSET $6`,
    [empCode, punch, startDate, endDate, limit, offset]
  );

  const totalResult = await query(
    `SELECT COUNT(*) AS total FROM "Attendance"
     WHERE ($1::text IS NULL OR "EmpCode" = $1)
       AND ($2::text IS NULL OR "Punch" = $2)
       AND ($3::text IS NULL OR "AtDate" >= $3)
       AND ($4::text IS NULL OR "AtDate" <= $4)`,
    [empCode, punch, startDate, endDate]
  );

  const total = Number(totalResult.rows[0]?.total || 0);

  return {
    data: result.rows,
    meta: buildPaginationMeta(page, limit, total),
  };
};

const getHistory = async (q = {}) => {
  const empCode = q.empCode ? q.empCode.toString() : null;
  const startDate = q.startDate ? toDateString(parseDate(q.startDate)) : null;
  const endDate = q.endDate ? toDateString(parseDate(q.endDate)) : null;

  const result = await query(
    `SELECT "EmpCode", "AtDate",
       MIN(CASE WHEN "Punch" = 'Check IN' THEN "PunchDatetime" END) AS "firstCheckIn",
       MAX(CASE WHEN "Punch" = 'Check OUT' THEN "PunchDatetime" END) AS "lastCheckOut",
       COUNT(*) AS "totalPunches"
     FROM "Attendance"
     WHERE ($1::text IS NULL OR "EmpCode" = $1)
       AND ($2::text IS NULL OR "AtDate" >= $2)
       AND ($3::text IS NULL OR "AtDate" <= $3)
     GROUP BY "EmpCode", "AtDate"
     ORDER BY "AtDate" DESC`,
    [empCode, startDate, endDate]
  );

  return result.rows;
};

const getReports = async (q = {}) => {
  const startDate = q.startDate ? toDateString(parseDate(q.startDate)) : toDateString();
  const endDate = q.endDate ? toDateString(parseDate(q.endDate)) : startDate;

  const result = await query(
    `SELECT "AtDate", COUNT(DISTINCT "EmpCode") AS "presentCount"
     FROM "Attendance"
     WHERE "AtDate" BETWEEN $1 AND $2
       AND "Punch" = 'Check IN'
     GROUP BY "AtDate"
     ORDER BY "AtDate"`,
    [startDate, endDate]
  );

  return { range: { startDate, endDate }, daily: result.rows };
};

module.exports = { listAttendance, getHistory, getReports };
