const { query } = require("../../config/db");
const { toDateString, getWeekRange, getMonthRange, parseDate } = require("../utils/dateUtils");

const getTotals = async (dateString) => {
  const date = dateString || toDateString();
  const lateAfter = process.env.LATE_AFTER_TIME || "10:00";
  const onlineWindowSeconds = parseInt(process.env.ONLINE_WINDOW_SECONDS || "30", 10);

  const totals = await query(
    `SELECT
       (SELECT COUNT(*) FROM "dbo.AppUser" WHERE "fkEmpId" IS NOT NULL) AS "totalEmployees",
       (SELECT COUNT(DISTINCT "EmpCode") FROM "dbo.Attendance" WHERE "AtDate" = $1 AND "Punch" = 'Check IN') AS "presentEmployees",
       (
         SELECT COUNT(*) FROM (
           SELECT "EmpCode", MIN("PunchDatetime") AS firstIn
           FROM "dbo.Attendance"
           WHERE "AtDate" = $1 AND "Punch" = 'Check IN'
           GROUP BY "EmpCode"
           HAVING MIN("PunchDatetime")::time > $2::time
         ) late
       ) AS "lateCount",
       (
         SELECT COUNT(*) FROM (
           SELECT DISTINCT ON ("EmpCode") "EmpCode", "Punch", "PunchDatetime"
           FROM "dbo.Attendance"
           WHERE "AtDate" = $1
           ORDER BY "EmpCode", "PunchDatetime" DESC
         ) latest
         WHERE latest."Punch" <> 'Check OUT'
           AND EXTRACT(EPOCH FROM (NOW() - latest."PunchDatetime")) <= $3
       ) AS "onlineEmployees"`,
    [date, lateAfter, onlineWindowSeconds]
  );

  const stats = totals.rows[0] || {};
  const totalEmployees = Number(stats.totalEmployees || 0);
  const presentEmployees = Number(stats.presentEmployees || 0);

  return {
    date,
    totalEmployees,
    presentEmployees,
    absentEmployees: Math.max(totalEmployees - presentEmployees, 0),
    onlineEmployees: Number(stats.onlineEmployees || 0),
    lateEmployees: Number(stats.lateCount || 0),
    officeWiseCount: [
      { officeId: "DEFAULT", officeName: "Main Office", employeeCount: totalEmployees },
    ],
  };
};

const getAttendanceAnalytics = async (startDate, endDate) => {
  const result = await query(
    `SELECT "AtDate", COUNT(DISTINCT "EmpCode") AS "presentCount"
     FROM "dbo.Attendance"
     WHERE "AtDate" BETWEEN $1 AND $2 AND "Punch" = 'Check IN'
     GROUP BY "AtDate"
     ORDER BY "AtDate"`,
    [startDate, endDate]
  );
  return result.rows;
};

const getAnalytics = async (referenceDate) => {
  const reference = parseDate(referenceDate);
  const weekRange = getWeekRange(reference);
  const monthRange = getMonthRange(reference);

  const [weekly, monthly] = await Promise.all([
    getAttendanceAnalytics(toDateString(weekRange.start), toDateString(weekRange.end)),
    getAttendanceAnalytics(toDateString(monthRange.start), toDateString(monthRange.end)),
  ]);

  return { week: weekly, month: monthly };
};

module.exports = { getTotals, getAnalytics };
