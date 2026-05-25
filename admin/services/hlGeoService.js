const { query } = require("../../config/db");

const TABLE_NAME = `"OfficeGeoFence"`;

const ensureOfficeGeoFenceTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS "OfficeGeoFence" (
      "pkGeoId"      SERIAL PRIMARY KEY,
      "fkHLId"       INT           NOT NULL,
      "OfficeName"   VARCHAR(100)  NULL,
      "Latitude"     DECIMAL(10,7) NOT NULL,
      "Longitude"    DECIMAL(10,7) NOT NULL,
      "RadiusMeters" INT           NOT NULL DEFAULT 50,
      "IsActive"     BOOLEAN       NOT NULL DEFAULT true,
      "CreatedAt"    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS ix_office_geofence ON "OfficeGeoFence" ("fkHLId", "IsActive")
  `);
};

const listHLGeolocations = async (fkHLId = null) => {
  await ensureOfficeGeoFenceTable();

  let text = `
    SELECT "pkGeoId", "OfficeName", "fkHLId", "Latitude", "Longitude",
           "RadiusMeters", "IsActive", "CreatedAt"
    FROM ${TABLE_NAME}
    WHERE "IsActive" = true
  `;
  const params = [];

  if (fkHLId !== null && fkHLId !== undefined) {
    params.push(fkHLId);
    text += ` AND "fkHLId" = $${params.length}`;
  }

  text += ` ORDER BY "pkGeoId" DESC`;

  const result = await query(text, params);
  return result.rows.map((row) => ({ ...row, officeName: row.OfficeName || null }));
};

const getHLGeolocationById = async (pkGeoId) => {
  await ensureOfficeGeoFenceTable();
  const result = await query(
    `SELECT "pkGeoId", "OfficeName", "fkHLId", "Latitude", "Longitude",
            "RadiusMeters", "IsActive", "CreatedAt"
     FROM ${TABLE_NAME}
     WHERE "pkGeoId" = $1`,
    [pkGeoId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, officeName: row.OfficeName || null };
};

const createHLGeolocation = async ({ fkHLId, OfficeName, Latitude, Longitude, RadiusMeters = 50 }) => {
  await ensureOfficeGeoFenceTable();
  const result = await query(
    `INSERT INTO ${TABLE_NAME} ("fkHLId", "OfficeName", "Latitude", "Longitude", "RadiusMeters", "IsActive")
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING *`,
    [fkHLId, OfficeName || null, Latitude, Longitude, RadiusMeters]
  );
  const inserted = result.rows[0];
  return inserted ? { ...inserted, officeName: inserted.OfficeName || null } : null;
};

const updateHLGeolocation = async (pkGeoId, { OfficeName, Latitude, Longitude, RadiusMeters, IsActive }) => {
  await ensureOfficeGeoFenceTable();

  const fields = [];
  const params = [pkGeoId]; // $1

  if (OfficeName !== undefined) { params.push(OfficeName); fields.push(`"OfficeName" = $${params.length}`); }
  if (Latitude !== undefined) { params.push(Latitude); fields.push(`"Latitude" = $${params.length}`); }
  if (Longitude !== undefined) { params.push(Longitude); fields.push(`"Longitude" = $${params.length}`); }
  if (RadiusMeters !== undefined) { params.push(RadiusMeters); fields.push(`"RadiusMeters" = $${params.length}`); }
  if (IsActive !== undefined) { params.push(!!IsActive); fields.push(`"IsActive" = $${params.length}`); }

  if (fields.length === 0) throw new Error("No fields to update");

  const result = await query(
    `UPDATE ${TABLE_NAME} SET ${fields.join(", ")} WHERE "pkGeoId" = $1 RETURNING *`,
    params
  );
  const updated = result.rows[0];
  return updated ? { ...updated, officeName: updated.OfficeName || null } : null;
};

const deleteHLGeolocation = async (pkGeoId) => {
  await ensureOfficeGeoFenceTable();
  await query(`UPDATE ${TABLE_NAME} SET "IsActive" = false WHERE "pkGeoId" = $1`, [pkGeoId]);
  return { success: true };
};

module.exports = {
  listHLGeolocations,
  getHLGeolocationById,
  createHLGeolocation,
  updateHLGeolocation,
  deleteHLGeolocation,
};
