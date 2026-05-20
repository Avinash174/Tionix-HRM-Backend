const authService = require("../services/authService");

const login = async (req, res, next) => {
  try {
    const username = (req.body.username || req.body.UserName || "").trim();
    const password = (req.body.password || req.body.Password || "").trim();
    const deviceInfo = req.body.device_info || req.body.deviceInfo || null;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    console.log(`Admin login attempt: ${username}`);
    const { admin, token, refreshToken, sessionId, expiresIn } = await authService.loginAdmin(
      username,
      password,
      deviceInfo
    );
    console.log(`Admin login successful: ${admin.UserName} (session ${sessionId})`);

    return res.json({
      success: true,
      token,
      refreshToken,
      expiresIn,
      sessionId,
      role: "admin",
      admin: {
        id: admin.pkUserId,
        username: admin.UserName,
      },
    });
  } catch (err) {
    console.log(`Admin login failed: ${req.body?.username || "unknown"}`);
    return next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const refreshTokenValue = req.body.refreshToken || req.body.refresh_token;
    if (!refreshTokenValue) {
      return res.status(400).json({ success: false, message: "Refresh token is required" });
    }

    const session = await authService.refreshAdminSession(refreshTokenValue);

    return res.json({
      success: true,
      token: session.accessToken,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      expiresIn: session.expiresIn,
      role: "admin",
    });
  } catch (err) {
    return next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshTokenValue = req.body.refreshToken || req.body.refresh_token;
    const sessionId = req.body.sessionId || req.admin?.sid;

    await authService.logoutAdmin(refreshTokenValue, sessionId);

    console.log(`Admin logout: ${req.admin?.username || "unknown"}`);
    return res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    return next(err);
  }
};

const logoutAll = async (req, res, next) => {
  try {
    await authService.logoutAllAdminSessions(req.admin.id);
    return res.json({ success: true, message: "All admin sessions ended" });
  } catch (err) {
    return next(err);
  }
};

const sessions = async (req, res, next) => {
  try {
    const activeSessions = await authService.getAdminSessions(req.admin.id);
    return res.json({ success: true, sessions: activeSessions });
  } catch (err) {
    return next(err);
  }
};

const me = async (req, res, next) => {
  try {
    const admin = await authService.getAdminProfile(req.admin.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    return res.json({
      success: true,
      admin: {
        id: admin.pkUserId,
        username: admin.UserName,
        fkECId: admin.fkECId,
        sessionId: req.admin.sid || null,
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  login,
  refreshToken,
  logout,
  logoutAll,
  sessions,
  me,
};
