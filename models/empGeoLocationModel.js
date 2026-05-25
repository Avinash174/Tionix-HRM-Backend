const { query } = require("../config/db");

const insertEmployeeLocation = async ({ fkEmpId, latitude, longitude, atDate = new Date() }) => {
  const result = await query(
    `INSERT INTO "dbo.EmpGeoLocation" ("fkEmpId", "AtDate", "Latitude", "Longitude")
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [Number(fkEmpId), atDate, latitude, longitude]
  );
  return result.rows[0] || null;
};

module.exports = {
  insertEmployeeLocation,
};
