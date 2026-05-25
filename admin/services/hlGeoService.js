const { sql } = require("../../config/db");

const TABLE_NAME = "dbo.OfficeGeoFence";

const ensureOfficeGeoFenceTable = async () => {
  await new sql.Request().query(`
    IF OBJECT_ID(N'dbo.OfficeGeoFence', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.OfficeGeoFence (
        pkGeoId INT IDENTITY(1,1) PRIMARY KEY,
        fkHLId INT NOT NULL,
        OfficeName NVARCHAR(100) NULL,
        Latitude DECIMAL(10, 7) NOT NULL,
        Longitude DECIMAL(10, 7) NOT NULL,
        RadiusMeters INT NOT NULL DEFAULT 50,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
      );
      CREATE INDEX IX_OfficeGeoFence_fkHLId ON dbo.OfficeGeoFence (fkHLId, IsActive);
    END
  `);
};

const listHLGeolocations = async (fkHLId = null) => {
  await ensureOfficeGeoFenceTable();
  const request = new sql.Request();
  let query = `
    SELECT 
      pkGeoId,
      OfficeName,
      fkHLId,
      Latitude,
      Longitude,
      RadiusMeters,
      IsActive,
      CreatedAt
    FROM ${TABLE_NAME}
    WHERE IsActive = 1
  `;

  if (fkHLId !== null && fkHLId !== undefined) {
    query += ` AND fkHLId = @fkHLId`;
    request.input("fkHLId", sql.Int, fkHLId);
  }

  query += ` ORDER BY pkGeoId DESC`;

  const result = await request.query(query);
  return result.recordset.map((row) => ({
    ...row,
    officeName: row.OfficeName || null,
  }));
};

const getHLGeolocationById = async (pkGeoId) => {
  await ensureOfficeGeoFenceTable();
  const result = await new sql.Request()
    .input("pkGeoId", sql.Int, pkGeoId)
    .query(`
      SELECT 
        pkGeoId,
        OfficeName,
        fkHLId,
        Latitude,
        Longitude,
        RadiusMeters,
        IsActive,
        CreatedAt
      FROM ${TABLE_NAME}
      WHERE pkGeoId = @pkGeoId
    `);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    ...row,
    officeName: row.OfficeName || null,
  };
};

const createHLGeolocation = async ({ fkHLId, OfficeName, Latitude, Longitude, RadiusMeters = 50 }) => {
  await ensureOfficeGeoFenceTable();
  const result = await new sql.Request()
    .input("fkHLId", sql.Int, fkHLId)
    .input("OfficeName", sql.NVarChar(100), OfficeName || null)
    .input("Latitude", sql.Decimal(10, 7), Latitude)
    .input("Longitude", sql.Decimal(10, 7), Longitude)
    .input("RadiusMeters", sql.Int, RadiusMeters)
    .query(`
      INSERT INTO ${TABLE_NAME} (fkHLId, OfficeName, Latitude, Longitude, RadiusMeters, IsActive)
      OUTPUT INSERTED.*
      VALUES (@fkHLId, @OfficeName, @Latitude, @Longitude, @RadiusMeters, 1)
    `);
  const inserted = result.recordset[0];
  return inserted
    ? { ...inserted, officeName: inserted.OfficeName || null }
    : null;
};

const updateHLGeolocation = async (pkGeoId, { OfficeName, Latitude, Longitude, RadiusMeters, IsActive }) => {
  await ensureOfficeGeoFenceTable();
  const request = new sql.Request().input("pkGeoId", sql.Int, pkGeoId);

  const fields = [];
  if (OfficeName !== undefined) {
    request.input("OfficeName", sql.NVarChar(100), OfficeName);
    fields.push("OfficeName = @OfficeName");
  }
  if (Latitude !== undefined) {
    request.input("Latitude", sql.Decimal(10, 7), Latitude);
    fields.push("Latitude = @Latitude");
  }
  if (Longitude !== undefined) {
    request.input("Longitude", sql.Decimal(10, 7), Longitude);
    fields.push("Longitude = @Longitude");
  }
  if (RadiusMeters !== undefined) {
    request.input("RadiusMeters", sql.Int, RadiusMeters);
    fields.push("RadiusMeters = @RadiusMeters");
  }
  if (IsActive !== undefined) {
    request.input("IsActive", sql.Bit, IsActive ? 1 : 0);
    fields.push("IsActive = @IsActive");
  }

  if (fields.length === 0) {
    throw new Error("No fields to update");
  }

  const result = await request.query(`
    UPDATE ${TABLE_NAME}
    SET ${fields.join(", ")}
    OUTPUT INSERTED.*
    WHERE pkGeoId = @pkGeoId
  `);

  const updated = result.recordset[0];
  return updated
    ? { ...updated, officeName: updated.OfficeName || null }
    : null;
};

const deleteHLGeolocation = async (pkGeoId) => {
  await ensureOfficeGeoFenceTable();
  await new sql.Request()
    .input("pkGeoId", sql.Int, pkGeoId)
    .query(`
      UPDATE ${TABLE_NAME}
      SET IsActive = 0
      WHERE pkGeoId = @pkGeoId
    `);
  return { success: true };
};

module.exports = {
  listHLGeolocations,
  getHLGeolocationById,
  createHLGeolocation,
  updateHLGeolocation,
  deleteHLGeolocation,
};
