const jwt = require("jsonwebtoken");
const { sql } = require("../../config/db");

const ACCESS_EXPIRES = process.env.ADMIN_JWT_EXPIRES || "2h";
const REFRESH_EXPIRES = process.env.ADMIN_REFRESH_EXPIRES || "7d";
const JWT_SECRET = process.env.JWT_SECRET || "attendance_secret_key_2024";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "attendance_refresh_secret_key_2024";

let tableReady = false;

const ensureAdminSessionsTable = async () => {
  if (tableReady) return;

  await new sql.Request().query(`
    IF OBJECT_ID(N'dbo.AdminSessions', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AdminSessions (
        SessionID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AdminUserId NVARCHAR(50) NOT NULL,
        RefreshToken NVARCHAR(500) NOT NULL,
        DeviceInfo NVARCHAR(500) NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminSessions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        ExpiresAt DATETIME2 NOT NULL
      );
      CREATE INDEX IX_AdminSessions_AdminUserId ON dbo.AdminSessions (AdminUserId);
      CREATE UNIQUE INDEX UX_AdminSessions_RefreshToken ON dbo.AdminSessions (RefreshToken);
    END
  `);

  tableReady = true;
};

const buildAccessToken = (admin, sessionId) => {
  return jwt.sign(
    {
      id: admin.pkUserId,
      username: admin.UserName,
      role: "admin",
      sid: sessionId,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
};

const buildRefreshToken = (admin, sessionId) => {
  return jwt.sign(
    {
      id: admin.pkUserId,
      username: admin.UserName,
      role: "admin",
      sid: sessionId,
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES }
  );
};

const createSession = async (admin, deviceInfo = null) => {
  await ensureAdminSessionsTable();

  const placeholder = await new sql.Request()
    .input("adminUserId", sql.NVarChar, admin.pkUserId)
    .input("deviceInfo", sql.NVarChar, deviceInfo)
    .input("expiresAt", sql.DateTime2, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
    .query(`
      INSERT INTO dbo.AdminSessions (AdminUserId, RefreshToken, DeviceInfo, ExpiresAt)
      OUTPUT INSERTED.SessionID
      VALUES (@adminUserId, 'pending', @deviceInfo, @expiresAt)
    `);

  const sessionId = placeholder.recordset[0].SessionID;
  const refreshToken = buildRefreshToken(admin, sessionId);
  const accessToken = buildAccessToken(admin, sessionId);

  await new sql.Request()
    .input("sessionId", sql.Int, sessionId)
    .input("refreshToken", sql.NVarChar, refreshToken)
    .query(`
      UPDATE dbo.AdminSessions
      SET RefreshToken = @refreshToken
      WHERE SessionID = @sessionId
    `);

  return {
    sessionId,
    accessToken,
    refreshToken,
    expiresIn: ACCESS_EXPIRES,
  };
};

const findSessionByRefreshToken = async (refreshToken) => {
  await ensureAdminSessionsTable();

  const result = await new sql.Request()
    .input("refreshToken", sql.NVarChar, refreshToken)
    .query(`
      SELECT SessionID, AdminUserId, RefreshToken, DeviceInfo, CreatedAt, ExpiresAt
      FROM dbo.AdminSessions
      WHERE RefreshToken = @refreshToken
        AND ExpiresAt > SYSUTCDATETIME()
    `);

  return result.recordset[0] || null;
};

const findSessionById = async (sessionId) => {
  await ensureAdminSessionsTable();

  const result = await new sql.Request()
    .input("sessionId", sql.Int, sessionId)
    .query(`
      SELECT SessionID, AdminUserId, RefreshToken, DeviceInfo, CreatedAt, ExpiresAt
      FROM dbo.AdminSessions
      WHERE SessionID = @sessionId
        AND ExpiresAt > SYSUTCDATETIME()
    `);

  return result.recordset[0] || null;
};

const deleteSessionByRefreshToken = async (refreshToken) => {
  await ensureAdminSessionsTable();

  await new sql.Request()
    .input("refreshToken", sql.NVarChar, refreshToken)
    .query(`DELETE FROM dbo.AdminSessions WHERE RefreshToken = @refreshToken`);
};

const deleteSessionById = async (sessionId) => {
  await ensureAdminSessionsTable();

  await new sql.Request()
    .input("sessionId", sql.Int, sessionId)
    .query(`DELETE FROM dbo.AdminSessions WHERE SessionID = @sessionId`);
};

const deleteAllSessionsForAdmin = async (adminUserId) => {
  await ensureAdminSessionsTable();

  await new sql.Request()
    .input("adminUserId", sql.NVarChar, adminUserId)
    .query(`DELETE FROM dbo.AdminSessions WHERE AdminUserId = @adminUserId`);
};

const refreshSession = async (refreshToken) => {
  const session = await findSessionByRefreshToken(refreshToken);
  if (!session) {
    const error = new Error("Session expired or invalid. Please sign in again.");
    error.statusCode = 403;
    throw error;
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch {
    await deleteSessionByRefreshToken(refreshToken);
    const error = new Error("Session expired or invalid. Please sign in again.");
    error.statusCode = 403;
    throw error;
  }

  if (decoded.sid && Number(decoded.sid) !== session.SessionID) {
    await deleteSessionByRefreshToken(refreshToken);
    const error = new Error("Session expired or invalid. Please sign in again.");
    error.statusCode = 403;
    throw error;
  }

  const adminResult = await new sql.Request()
    .input("adminUserId", sql.NVarChar, session.AdminUserId)
    .query(`
      SELECT TOP 1 pkUserId, UserName, fkECId, SysDefined
      FROM dbo.AppUser
      WHERE pkUserId = @adminUserId
        AND SysDefined = 1
    `);

  const admin = adminResult.recordset[0];
  if (!admin) {
    await deleteSessionByRefreshToken(refreshToken);
    const error = new Error("Admin account is no longer active.");
    error.statusCode = 403;
    throw error;
  }

  await deleteSessionById(session.SessionID);

  return createSession(admin, session.DeviceInfo);
};

const listActiveSessions = async (adminUserId) => {
  await ensureAdminSessionsTable();

  const result = await new sql.Request()
    .input("adminUserId", sql.NVarChar, adminUserId)
    .query(`
      SELECT SessionID, DeviceInfo, CreatedAt, ExpiresAt
      FROM dbo.AdminSessions
      WHERE AdminUserId = @adminUserId
        AND ExpiresAt > SYSUTCDATETIME()
      ORDER BY CreatedAt DESC
    `);

  return result.recordset;
};

module.exports = {
  ensureAdminSessionsTable,
  createSession,
  findSessionByRefreshToken,
  findSessionById,
  deleteSessionByRefreshToken,
  deleteSessionById,
  deleteAllSessionsForAdmin,
  refreshSession,
  listActiveSessions,
  buildAccessToken,
};
