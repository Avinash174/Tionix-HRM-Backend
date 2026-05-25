const { sql } = require("../../config/db");
const { toDateString } = require("../utils/dateUtils");

const { getFixedOfficeListForAdmin, getDefaultRadiusMeters } = require("../../config/officeGeofences");

const getDefaultOfficeRadiusMeters = () => getDefaultRadiusMeters();

const fetchOffices = async () => getFixedOfficeListForAdmin();

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

const createOffice = async ({
  officeName,
  latitude,
  longitude,
  allowedRadius = getDefaultOfficeRadiusMeters(),
  locationType = "OFFICE",
  address = null,
}) => {
  const result = await new sql.Request()
    .input('officeName', sql.NVarChar, officeName)
    .input('latitude', sql.Decimal(10, 7), latitude)
    .input('longitude', sql.Decimal(10, 7), longitude)
    .input('allowedRadius', sql.Decimal(10, 2), allowedRadius)
    .input('locationType', sql.NVarChar, locationType)
    .input('address', sql.NVarChar, address)
    .query(`
      INSERT INTO dbo.AttendanceLocations (LocationName, Latitude, Longitude, AllowedRadius, LocationType, Address)
      OUTPUT INSERTED.LocationID as officeId, INSERTED.LocationName as officeName,
             INSERTED.Latitude as latitude, INSERTED.Longitude as longitude,
             INSERTED.AllowedRadius as allowedRadius, INSERTED.LocationType as officeType,
             INSERTED.Address as address
      VALUES (@officeName, @latitude, @longitude, @allowedRadius, @locationType, @address)
    `);
  return result.recordset[0];
};

const updateOffice = async (officeId, { officeName, latitude, longitude, allowedRadius, locationType, address }) => {
  const request = new sql.Request().input('officeId', sql.Int, officeId);

  const sets = [];
  if (officeName != null) { request.input('officeName', sql.NVarChar, officeName); sets.push('LocationName = @officeName'); }
  if (latitude != null) { request.input('latitude', sql.Decimal(10, 7), latitude); sets.push('Latitude = @latitude'); }
  if (longitude != null) { request.input('longitude', sql.Decimal(10, 7), longitude); sets.push('Longitude = @longitude'); }
  if (allowedRadius != null) { request.input('allowedRadius', sql.Decimal(10, 2), allowedRadius); sets.push('AllowedRadius = @allowedRadius'); }
  if (locationType != null) { request.input('locationType', sql.NVarChar, locationType); sets.push('LocationType = @locationType'); }
  if (address != null) { request.input('address', sql.NVarChar, address); sets.push('Address = @address'); }

  if (sets.length === 0) return null;

  const result = await request.query(`
    UPDATE dbo.AttendanceLocations
    SET ${sets.join(', ')}
    OUTPUT INSERTED.LocationID as officeId, INSERTED.LocationName as officeName,
           INSERTED.Latitude as latitude, INSERTED.Longitude as longitude,
           INSERTED.AllowedRadius as allowedRadius, INSERTED.LocationType as officeType,
           INSERTED.Address as address
    WHERE LocationID = @officeId
  `);
  return result.recordset[0] || null;
};

const deleteOffice = async (officeId) => {
  const result = await new sql.Request()
    .input('officeId', sql.Int, officeId)
    .query(`
      UPDATE dbo.AttendanceLocations SET IsActive = 0 WHERE LocationID = @officeId
    `);
  return result.rowsAffected[0] > 0;
};

module.exports = {
  buildOfficeAnalytics,
  getOfficeById,
  createOffice,
  updateOffice,
  deleteOffice,
  getDefaultOfficeRadiusMeters,
};
