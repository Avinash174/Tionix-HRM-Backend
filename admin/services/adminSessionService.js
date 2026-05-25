const jwt = require("jsonwebtoken");
const { query } = require("../../config/db");

const ACCESS_EXPIRES = process.env.ADMIN_JWT_EXPIRES || "2h";
const REFRESH_EXPIRES = process.env.ADMIN_REFRESH_EXPIRES || "7d";
const JWT_SECRET = process.env.JWT_SECRET || "attendance_secret_key_2024";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "attendance_refresh_secret_key_2024";

let tableReady = false;

const ensureAdminSessionsTable = async () => {
  if (tableReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS "AdminSessions" (
      "SessionID"    SERIAL PRIMARY KEY,
      "AdminUserId"  VARCHAR(50)  NOT NULL,
      "RefreshToken" VARCHAR(500) NOT NULL,
      "DeviceInfo"   VARCHAR(500) NULL,
      "CreatedAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      "ExpiresAt"    TIMESTAMPTZ  NOT NULL
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS ix_admin_sessions_user_id
      ON "AdminSessions" ("AdminUserId")
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_sessions_refresh_token
      ON "AdminSessions" ("RefreshToken")
  `);

  tableReady = true;
};

const buildAccessToken = (admin, sessionId) =>
  jwt.sign(
    { id: admin.pkUserId, username: admin.UserName, role: "admin", sid: sessionId },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );

const buildRefreshToken = (admin, sessionId) =>
  jwt.sign(
    { id: admin.pkUserId, username: admin.UserName, role: "admin", sid: sessionId },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES }
  );

const createSession = async (admin, deviceInfo = null) => {
  await ensureAdminSessionsTable();

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Insert placeholder, get session ID
  const placeholder = await query(
    `INSERT INTO "AdminSessions" ("AdminUserId", "RefreshToken", "DeviceInfo", "ExpiresAt")
     VALUES ($1, 'pending', $2, $3)
     RETURNING "SessionID"`,
    [admin.pkUserId, deviceInfo, expiresAt]
  );

  const sessionId = placeholder.rows[0].SessionID;
  const refreshToken = buildRefreshToken(admin, sessionId);
  const accessToken = buildAccessToken(admin, sessionId);

  await query(
    `UPDATE "AdminSessions" SET "RefreshToken" = $1 WHERE "SessionID" = $2`,
    [refreshToken, sessionId]
  );

  return { sessionId, accessToken, refreshToken, expiresIn: ACCESS_EXPIRES };
};

const findSessionByRefreshToken = async (refreshToken) => {
  await ensureAdminSessionsTable();
  const result = await query(
    `SELECT "SessionID", "AdminUserId", "RefreshToken", "DeviceInfo", "CreatedAt", "ExpiresAt"
     FROM "AdminSessions"
     WHERE "RefreshToken" = $1 AND "ExpiresAt" > NOW()`,
    [refreshToken]
  );
  return result.rows[0] || null;
};

const findSessionById = async (sessionId) => {
  await ensureAdminSessionsTable();
  const result = await query(
    `SELECT "SessionID", "AdminUserId", "RefreshToken", "DeviceInfo", "CreatedAt", "ExpiresAt"
     FROM "AdminSessions"
     WHERE "SessionID" = $1 AND "ExpiresAt" > NOW()`,
    [sessionId]
  );
  return result.rows[0] || null;
};

const deleteSessionByRefreshToken = async (refreshToken) => {
  await ensureAdminSessionsTable();
  await query(
    `DELETE FROM "AdminSessions" WHERE "RefreshToken" = $1`,
    [refreshToken]
  );
};

const deleteSessionById = async (sessionId) => {
  await ensureAdminSessionsTable();
  await query(
    `DELETE FROM "AdminSessions" WHERE "SessionID" = $1`,
    [sessionId]
  );
};

const deleteAllSessionsForAdmin = async (adminUserId) => {
  await ensureAdminSessionsTable();
  await query(
    `DELETE FROM "AdminSessions" WHERE "AdminUserId" = $1`,
    [adminUserId]
  );
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

  const adminResult = await query(
    `SELECT "pkUserId", "UserName", "fkECId", "SysDefined"
     FROM "AppUser"
     WHERE "pkUserId" = $1 AND "SysDefined" = true
     LIMIT 1`,
    [session.AdminUserId]
  );

  const admin = adminResult.rows[0];
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
  const result = await query(
    `SELECT "SessionID", "DeviceInfo", "CreatedAt", "ExpiresAt"
     FROM "AdminSessions"
     WHERE "AdminUserId" = $1 AND "ExpiresAt" > NOW()
     ORDER BY "CreatedAt" DESC`,
    [adminUserId]
  );
  return result.rows;
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
