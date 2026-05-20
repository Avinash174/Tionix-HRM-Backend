const { sql } = require("../../config/db");
const adminSessionService = require("./adminSessionService");

const loginAdmin = async (username, password, deviceInfo = null) => {
  const trimmedUser = (username || "").trim();
  const trimmedPass = (password || "").trim();

  const result = await new sql.Request()
    .input("username", sql.NVarChar, trimmedUser)
    .input("password", sql.NVarChar, trimmedPass)
    .query(`
      SELECT TOP 1 pkUserId, UserName, fkECId, SysDefined, fkEmpId
      FROM dbo.AppUser
      WHERE LTRIM(RTRIM(UserName)) = @username
        AND LTRIM(RTRIM(Password)) = @password
        AND SysDefined = 1
    `);

  const admin = result.recordset[0];
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
  const result = await new sql.Request()
    .input("adminId", sql.VarChar, adminId)
    .query(`
      SELECT pkUserId, UserName, fkECId, LastStatus
      FROM dbo.AppUser
      WHERE pkUserId = @adminId
    `);
  return result.recordset[0];
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
