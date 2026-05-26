const { query } = require("../config/db");

let schemaReady = false;

const ensureEmpGeoLocationSchema = async () => {
  if (schemaReady) return;

  const cols = await query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'dbo.EmpGeoLocation'
       AND column_name IN ('Latitude', 'Longitude')`
  );

  const needsDecimal = cols.rows.some(
    (row) => row.data_type === "bigint" || row.data_type === "integer"
  );

  if (needsDecimal) {
    await query(`
      ALTER TABLE "dbo.EmpGeoLocation"
        ALTER COLUMN "Latitude" TYPE DECIMAL(10,7)
          USING CASE
            WHEN "Latitude" IS NULL THEN NULL
            WHEN abs("Latitude"::numeric) > 180 THEN ("Latitude"::numeric / 1000000.0)
            ELSE "Latitude"::numeric
          END,
        ALTER COLUMN "Longitude" TYPE DECIMAL(10,7)
          USING CASE
            WHEN "Longitude" IS NULL THEN NULL
            WHEN abs("Longitude"::numeric) > 180 THEN ("Longitude"::numeric / 1000000.0)
            ELSE "Longitude"::numeric
          END
    `);
  }

  schemaReady = true;
};

const insertEmployeeLocation = async ({ fkEmpId, latitude, longitude, atDate = new Date() }) => {
  await ensureEmpGeoLocationSchema();

  const empId = Number(fkEmpId);
  if (!Number.isFinite(empId)) {
    const error = new Error("Invalid employee id for EmpGeoLocation");
    error.statusCode = 400;
    throw error;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const error = new Error("Valid latitude and longitude are required for EmpGeoLocation");
    error.statusCode = 400;
    throw error;
  }

  const result = await query(
    `INSERT INTO "dbo.EmpGeoLocation" ("fkEmpId", "AtDate", "Latitude", "Longitude")
     VALUES ($1, $2, $3::decimal, $4::decimal)
     RETURNING *`,
    [empId, atDate, lat, lng]
  );
  return result.rows[0] || null;
};

module.exports = {
  ensureEmpGeoLocationSchema,
  insertEmployeeLocation,
};
