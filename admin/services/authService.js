const { query } = require("../../config/db");
const adminSessionService = require("./adminSessionService");
const { getPhoneDigits } = require("../../utils/loginIdentifier");

const loginMatchClause = `
  (
    LOWER(TRIM("UserName")) = LOWER($1)
    OR LOWER(TRIM(COALESCE("Email", ''))) = LOWER($1)
    OR (
      $3::text IS NOT NULL
      AND (
        regexp_replace(COALESCE("Phone"::text, ''), '[^0-9]', '', 'g') = $3
        OR regexp_replace(COALESCE("Mobile"::text, ''), '[^0-9]', '', 'g') = $3
      )
    )
  )
`;

const loginAdmin = async (loginIdentifier, password, deviceInfo = null) => {
  const identifier = (loginIdentifier || "").trim();
  const trimmedPass = (password || "").trim();
  const phoneDigits = getPhoneDigits(identifier);

  const result = await query(
    `SELECT "pkUserId", "UserName", "fkECId", "SysDefined", "fkEmpId"
     FROM "dbo.AppUser"
     WHERE TRIM("Password") = $2
       AND ${loginMatchClause}
       AND COALESCE("SysDefined"::int, 0) = 1
     LIMIT 1`,
    [identifier, trimmedPass, phoneDigits]
  );

  const admin = result.rows[0];
  if (!admin) {
    const error = new Error("Invalid admin credentials. Only admin accounts can access the admin panel.");
    error.statusCode = 401;
    throw error;
  }

  const session = await adminSessionService.createSession(admin, deviceInfo);

  return {
    admin,
    token: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    expiresIn: session.expiresIn,
  };
};

const getAdminProfile = async (adminId) => {
  const result = await query(
    `SELECT "pkUserId", "UserName", "fkECId", "LastStatus"
     FROM "dbo.AppUser"
     WHERE "pkUserId" = $1`,
    [adminId]
  );
  return result.rows[0];
};

const logoutAdmin = async (refreshToken, sessionId = null) => {
  if (refreshToken) {
    await adminSessionService.deleteSessionByRefreshToken(refreshToken);
    return;
  }
  if (sessionId) {
    await adminSessionService.deleteSessionById(sessionId);
  }
};

const logoutAllAdminSessions = async (adminUserId) => {
  await adminSessionService.deleteAllSessionsForAdmin(adminUserId);
};

const refreshAdminSession = async (refreshToken) => {
  return adminSessionService.refreshSession(refreshToken);
};

const getAdminSessions = async (adminUserId) => {
  return adminSessionService.listActiveSessions(adminUserId);
};

module.exports = {
  loginAdmin,
  getAdminProfile,
  logoutAdmin,
  logoutAllAdminSessions,
  refreshAdminSession,
  getAdminSessions,
};
