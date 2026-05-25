const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const adminAuthService = require("../admin/services/authService");

const login = async (req, res) => {
  try {
    const username = (req.body.username || req.body.UserName || "").trim();
    const password = (req.body.password || req.body.Password || "").trim();
    const { device_info } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and Password are required",
      });
    }

    console.log(`Login attempt for user: ${username} (Device: ${device_info || 'Unknown'})`);

    // Employees (fkEmpId) + admins (SysDefined) — admin panel often uses POST /api/login
    const loginResult = await User.findByLoginCredentials(username, password);

    if (loginResult) {
      const { user, role } = loginResult;
      const userId = user.pkUserId ?? user.AppUserID;

      if (role === "admin") {
        const session = await adminAuthService.loginAdmin(
          username,
          password,
          device_info || null
        );

        console.log(`Login successful: ${user.UserName} (admin, session ${session.sessionId})`);

        return res.json({
          success: true,
          token: session.token,
          refreshToken: session.refreshToken,
          sessionId: session.sessionId,
          expiresIn: session.expiresIn,
          role: "admin",
          user,
          admin: {
            id: userId,
            username: user.UserName,
          },
        });
      }

      const tokenPayload = { id: userId, username: user.UserName, role: "user" };

      const token = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET || "attendance_secret_key_2024",
        { expiresIn: "1h" }
      );

      const refreshToken = jwt.sign(
        tokenPayload,
        process.env.JWT_REFRESH_SECRET || "attendance_refresh_secret_key_2024",
        { expiresIn: "7d" }
      );

      console.log(`Login successful: ${user.UserName} (employee)`);

      res.json({
        success: true,
        token,
        refreshToken,
        role,
        user,
      });
    } else {
      console.log(`Login failed for user: ${username}`);
      res.status(401).json({
        success: false,
        message: "Login Failed, Please try again",
      });
    }
  } catch (err) {
    const message =
      err.message ||
      err.detail ||
      (err.code ? `Database error (${err.code})` : "Login failed");
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      message,
      code: err.code || undefined,
    });
  }
};

const refreshToken = async (req, res) => {
  const { refreshToken: refreshTokenValue } = req.body || {};
  if (!refreshTokenValue) {
    return res.status(400).json({ success: false, message: "Refresh Token is required in the request body" });
  }

  try {
    let decoded;
    try {
      decoded = jwt.verify(
        refreshTokenValue,
        process.env.JWT_REFRESH_SECRET || "attendance_refresh_secret_key_2024"
      );
    } catch {
      return res.status(403).json({ success: false, message: "Token Expired" });
    }

    if (decoded.role === "admin") {
      const session = await adminAuthService.refreshAdminSession(refreshTokenValue);
      return res.json({
        success: true,
        token: session.accessToken,
        refreshToken: session.refreshToken,
        sessionId: session.sessionId,
        expiresIn: session.expiresIn,
        role: "admin",
      });
    }

    const newToken = jwt.sign(
      { id: decoded.id, username: decoded.username, role: decoded.role || "user" },
      process.env.JWT_SECRET || "attendance_secret_key_2024",
      { expiresIn: "1h" }
    );

    res.json({ success: true, token: newToken, role: decoded.role || "user" });
  } catch (err) {
    res.status(err.statusCode || 403).json({
      success: false,
      message: err.message || "Token Expired",
    });
  }
};

const logout = async (req, res) => {
  try {
    const { refreshToken: refreshTokenValue } = req.body || {};

    if (refreshTokenValue) {
      try {
        const decoded = jwt.verify(
          refreshTokenValue,
          process.env.JWT_REFRESH_SECRET || "attendance_refresh_secret_key_2024"
        );
        if (decoded.role === "admin") {
          await adminAuthService.logoutAdmin(refreshTokenValue, decoded.sid);
          console.log(`Admin logout successful: ${decoded.username}`);
          return res.json({ success: true, message: "Logged out successfully" });
        }
      } catch {
        // fall through for employee logout
      }
    }

    if (req.user?.role === "admin") {
      await adminAuthService.logoutAdmin(refreshTokenValue, req.user.sid);
    }

    console.log(`Logout successful for user: ${req.user?.username || "unknown"}`);
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || "Token refresh failed",
      code: err.code,
    });
  }
};

module.exports = {
  login,
  refreshToken,
  logout
};
