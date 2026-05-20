const jwt = require("jsonwebtoken");
const { sql } = require("../../config/db");
const adminSessionService = require("../services/adminSessionService");

const adminAuth = async (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "attendance_secret_key_2024");

    if (decoded.sid) {
      const session = await adminSessionService.findSessionById(decoded.sid);
      if (!session || session.AdminUserId !== decoded.id) {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please sign in again.",
        });
      }
    }

    if (decoded.role === "admin") {
      req.admin = decoded;
      return next();
    }

    const adminRow = await new sql.Request()
      .input("pkUserId", sql.VarChar, decoded.id)
      .query(`
        SELECT pkUserId, UserName, fkECId, SysDefined
        FROM dbo.AppUser
        WHERE pkUserId = @pkUserId
          AND SysDefined = 1
      `);

    if (!adminRow.recordset[0]) {
      return res.status(403).json({ success: false, message: "Admin access denied" });
    }

    req.admin = {
      ...decoded,
      role: "admin",
    };

    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Token is not valid" });
  }
};

module.exports = adminAuth;
