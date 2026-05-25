const { query } = require("../../config/db");
const { toDateString } = require("../utils/dateUtils");
const { getFixedOfficeListForAdmin, getDefaultRadiusMeters } = require("../../config/officeGeofences");

const getDefaultOfficeRadiusMeters = () => getDefaultRadiusMeters();
const fetchOffices = async () => getFixedOfficeListForAdmin();

const buildOfficeAnalytics = async () => {
  const date = toDateString();
  const totals = await query(
    `SELECT
       (SELECT COUNT(*) FROM "dbo.AppUser" WHERE "fkEmpId" IS NOT NULL) AS "totalEmployees",
       (SELECT COUNT(DISTINCT "EmpCode") FROM "dbo.Attendance" WHERE "AtDate" = $1 AND "Punch" = 'Check IN') AS "presentEmployees"`,
    [date]
  );
  const stats = totals.rows[0] || {};
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
  const result = await query(
    `INSERT INTO "dbo.AttendanceLocations" ("LocationName", "Latitude", "Longitude", "AllowedRadius", "LocationType", "Address")
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING "LocationID" AS "officeId", "LocationName" AS "officeName",
               "Latitude" AS "latitude", "Longitude" AS "longitude",
               "AllowedRadius" AS "allowedRadius", "LocationType" AS "officeType",
               "Address" AS "address"`,
    [officeName, latitude, longitude, allowedRadius, locationType, address]
  );
  return result.rows[0];
};

const updateOffice = async (officeId, { officeName, latitude, longitude, allowedRadius, locationType, address }) => {
  const sets = [];
  const params = [officeId]; // $1 = officeId

  if (officeName != null) { params.push(officeName); sets.push(`"LocationName" = $${params.length}`); }
  if (latitude != null) { params.push(latitude); sets.push(`"Latitude" = $${params.length}`); }
  if (longitude != null) { params.push(longitude); sets.push(`"Longitude" = $${params.length}`); }
  if (allowedRadius != null) { params.push(allowedRadius); sets.push(`"AllowedRadius" = $${params.length}`); }
  if (locationType != null) { params.push(locationType); sets.push(`"LocationType" = $${params.length}`); }
  if (address != null) { params.push(address); sets.push(`"Address" = $${params.length}`); }

  if (sets.length === 0) return null;

  const result = await query(
    `UPDATE "dbo.AttendanceLocations"
     SET ${sets.join(", ")}
     WHERE "LocationID" = $1
     RETURNING "LocationID" AS "officeId", "LocationName" AS "officeName",
               "Latitude" AS "latitude", "Longitude" AS "longitude",
               "AllowedRadius" AS "allowedRadius", "LocationType" AS "officeType",
               "Address" AS "address"`,
    params
  );
  return result.rows[0] || null;
};

const deleteOffice = async (officeId) => {
  const result = await query(
    `UPDATE "dbo.AttendanceLocations" SET "IsActive" = false WHERE "LocationID" = $1`,
    [officeId]
  );
  return result.rowCount > 0;
};

module.exports = {
  buildOfficeAnalytics,
  getOfficeById,
  createOffice,
  updateOffice,
  deleteOffice,
  getDefaultOfficeRadiusMeters,
};
