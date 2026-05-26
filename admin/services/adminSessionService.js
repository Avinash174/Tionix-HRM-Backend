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
    CREATE TABLE IF NOT EXISTS "dbo.AdminSessions" (
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
      ON "dbo.AdminSessions" ("AdminUserId")
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_sessions_refresh_token
      ON "dbo.AdminSessions" ("RefreshToken")
  `);
  // Legacy Supabase table may lack SERIAL; keep IDs monotonic via a dedicated sequence.
  await query(`CREATE SEQUENCE IF NOT EXISTS admin_sessions_session_id_seq`);
  await query(`
    SELECT setval(
      'admin_sessions_session_id_seq',
      GREATEST(
        COALESCE((SELECT MAX("SessionID"::bigint) FROM "dbo.AdminSessions"), 0),
        COALESCE((SELECT last_value FROM admin_sessions_session_id_seq), 0)
      )
    )
  `);
  await query(
    `DELETE FROM "dbo.AdminSessions"
     WHERE "SessionID" IS NULL
        OR "RefreshToken" = 'pending'
        OR "RefreshToken" LIKE 'pending:%'`
  );

  tableReady = true;
};

const readSessionId = (row) => Number(row?.SessionID ?? row?.sessionid);

const allocateSessionId = async () => {
  const result = await query(
    `SELECT nextval('admin_sessions_session_id_seq') AS "SessionID"`
  );
  return readSessionId(result.rows[0]);
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
  const sessionId = await allocateSessionId();
  const refreshToken = buildRefreshToken(admin, sessionId);
  const accessToken = buildAccessToken(admin, sessionId);

  await query(
    `INSERT INTO "dbo.AdminSessions"
       ("SessionID", "AdminUserId", "RefreshToken", "DeviceInfo", "CreatedAt", "ExpiresAt")
     VALUES ($1, $2, $3, $4, NOW(), $5)`,
    [sessionId, admin.pkUserId, refreshToken, deviceInfo, expiresAt]
  );

  return { sessionId, accessToken, refreshToken, expiresIn: ACCESS_EXPIRES };
};

const findSessionByRefreshToken = async (refreshToken) => {
  await ensureAdminSessionsTable();
  const result = await query(
    `SELECT "SessionID", "AdminUserId", "RefreshToken", "DeviceInfo", "CreatedAt", "ExpiresAt"
     FROM "dbo.AdminSessions"
     WHERE "RefreshToken" = $1 AND "ExpiresAt" > NOW()`,
    [refreshToken]
  );
  return result.rows[0] || null;
};

const findSessionById = async (sessionId) => {
  await ensureAdminSessionsTable();
  const result = await query(
    `SELECT "SessionID", "AdminUserId", "RefreshToken", "DeviceInfo", "CreatedAt", "ExpiresAt"
     FROM "dbo.AdminSessions"
     WHERE "SessionID" = $1 AND "ExpiresAt" > NOW()`,
    [sessionId]
  );
  return result.rows[0] || null;
};

const deleteSessionByRefreshToken = async (refreshToken) => {
  await ensureAdminSessionsTable();
  await query(
    `DELETE FROM "dbo.AdminSessions" WHERE "RefreshToken" = $1`,
    [refreshToken]
  );
};

const deleteSessionById = async (sessionId) => {
  await ensureAdminSessionsTable();
  await query(
    `DELETE FROM "dbo.AdminSessions" WHERE "SessionID" = $1`,
    [sessionId]
  );
};

const deleteAllSessionsForAdmin = async (adminUserId) => {
  await ensureAdminSessionsTable();
  await query(
    `DELETE FROM "dbo.AdminSessions" WHERE "AdminUserId" = $1`,
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

  if (decoded.sid && Number(decoded.sid) !== Number(session.SessionID)) {
    await deleteSessionByRefreshToken(refreshToken);
    const error = new Error("Session expired or invalid. Please sign in again.");
    error.statusCode = 403;
    throw error;
  }

  const adminResult = await query(
    `SELECT "pkUserId", "UserName", "fkECId", "SysDefined"
     FROM "dbo.AppUser"
     WHERE "pkUserId" = $1 AND COALESCE("SysDefined"::int, 0) = 1
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
     FROM "dbo.AdminSessions"
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
