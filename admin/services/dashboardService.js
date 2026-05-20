const { sql } = require("../../config/db");
const { toDateString, getWeekRange, getMonthRange, parseDate } = require("../utils/dateUtils");

const getTotals = async (dateString) => {
  const date = dateString || toDateString();
  const lateAfter = process.env.LATE_AFTER_TIME || "10:00";
  const onlineWindowSeconds = parseInt(process.env.ONLINE_WINDOW_SECONDS || "30", 10);

  const totals = await new sql.Request()
    .input("date", sql.VarChar, date)
    .input("lateAfter", sql.VarChar, lateAfter)
    .input("onlineWindow", sql.Int, onlineWindowSeconds)
    .query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.AppUser WHERE fkEmpId IS NOT NULL) AS totalEmployees,
        (SELECT COUNT(DISTINCT EmpCode) FROM Attendance WHERE AtDate = @date AND Punch = 'Check IN') AS presentEmployees,
        (
          SELECT COUNT(*) FROM (
            SELECT EmpCode, MIN(PunchDatetime) AS firstIn
            FROM Attendance
            WHERE AtDate = @date AND Punch = 'Check IN'
            GROUP BY EmpCode
            HAVING CAST(MIN(PunchDatetime) AS time) > CAST(@lateAfter AS time)
          ) late
        ) AS lateCount,
        (
          SELECT COUNT(*) FROM (
            SELECT EmpCode, Punch, PunchDatetime,
                   ROW_NUMBER() OVER (PARTITION BY EmpCode ORDER BY PunchDatetime DESC) AS rn
            FROM Attendance
            WHERE AtDate = @date
          ) latest
          WHERE latest.rn = 1
            AND latest.Punch <> 'Check OUT'
            AND DATEDIFF(second, latest.PunchDatetime, GETDATE()) <= @onlineWindow
        ) AS onlineEmployees
    `);

  const stats = totals.recordset[0] || {};
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
      {
        officeId: "DEFAULT",
        officeName: "Main Office",
        employeeCount: totalEmployees,
      },
    ],
  };
};

const getAttendanceAnalytics = async (startDate, endDate) => {
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
  return result.recordset;
};

const getAnalytics = async (referenceDate) => {
  const reference = parseDate(referenceDate);
  const weekRange = getWeekRange(reference);
  const monthRange = getMonthRange(reference);

  const weekly = await getAttendanceAnalytics(
    toDateString(weekRange.start),
    toDateString(weekRange.end)
  );
  const monthly = await getAttendanceAnalytics(
    toDateString(monthRange.start),
    toDateString(monthRange.end)
  );

  return {
    week: weekly,
    month: monthly,
  };
};

module.exports = {
  getTotals,
  getAnalytics,
};
