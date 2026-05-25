const { sql } = require("../config/db");

const insertEmployeeLocation = async ({ fkEmpId, latitude, longitude, atDate = new Date() }) => {
  const result = await new sql.Request()
    .input("fkEmpId", sql.Numeric, Number(fkEmpId))
    .input("atDate", sql.DateTime, atDate)
    .input("latitude", sql.Numeric, latitude)
    .input("longitude", sql.Numeric, longitude)
    .query(`
      INSERT INTO dbo.EmpGeoLocation (fkEmpId, AtDate, Latitude, Longitude)
      OUTPUT INSERTED.*
      VALUES (@fkEmpId, @atDate, @latitude, @longitude)
    `);

  return result.recordset[0] || null;
};

module.exports = {
  insertEmployeeLocation,
};
