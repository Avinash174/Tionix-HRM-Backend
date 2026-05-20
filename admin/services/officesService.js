const { sql } = require("../../config/db");
const { toDateString } = require("../utils/dateUtils");

const fetchOffices = async () => {
  try {
    const result = await new sql.Request().query(`
      SELECT LocationID as officeId,
             LocationName as officeName,
             Latitude as latitude,
             Longitude as longitude,
             Address as address,
             AllowedRadius as allowedRadius,
             LocationType as officeType
      FROM AttendanceLocations
      WHERE IsActive = 1
    `);
    return result.recordset;
  } catch (error) {
    return [
      {
        officeId: "DEFAULT",
        officeName: "Main Office",
        latitude: parseFloat(process.env.OFFICE_LAT || "19.102532"),
        longitude: parseFloat(process.env.OFFICE_LON || "73.008868"),
        allowedRadius: parseFloat(process.env.GEFENCE_RADIUS || "1000"),
        officeType: "OFFICE",
      },
    ];
  }
};

const buildOfficeAnalytics = async () => {
  const date = toDateString();
  const totals = await new sql.Request()
    .input("date", sql.VarChar, date)
    .query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.AppUser WHERE fkEmpId IS NOT NULL) AS totalEmployees,
        (SELECT COUNT(DISTINCT EmpCode) FROM Attendance WHERE AtDate = @date AND Punch = 'Check IN') AS presentEmployees
    `);
  const stats = totals.recordset[0] || {};
  const totalEmployees = Number(stats.totalEmployees || 0);
  const presentEmployees = Number(stats.presentEmployees || 0);
  const attendancePercent = totalEmployees
    ? Math.round((presentEmployees / totalEmployees) * 100)
    : 0;

  const offices = await fetchOffices();
  return offices.map((office) => ({
    ...office,
    totalEmployees,
    presentEmployees,
    attendancePercent,
  }));
};

const getOfficeById = async (officeId) => {
  const offices = await buildOfficeAnalytics();
  return offices.find((office) => office.officeId.toString() === officeId.toString());
};

module.exports = {
  buildOfficeAnalytics,
  getOfficeById,
};
