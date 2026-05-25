const { query } = require("../config/db");

const User = {
  findByCredentials: async (username, password) => {
    const trimmedUser = (username || "").trim();
    const trimmedPass = (password || "").trim();

    const result = await query(
      `SELECT * FROM "AppUser"
       WHERE TRIM("UserName") = $1
         AND TRIM("Password") = $2
         AND "fkEmpId" IS NOT NULL
       LIMIT 1`,
      [trimmedUser, trimmedPass]
    );
    return result.rows[0];
  },

  findByLoginCredentials: async (username, password) => {
    const trimmedUser = (username || "").trim();
    const trimmedPass = (password || "").trim();

    const result = await query(
      `SELECT * FROM "AppUser"
       WHERE TRIM("UserName") = $1
         AND TRIM("Password") = $2
         AND (
           "fkEmpId" IS NOT NULL
           OR "SysDefined" = true
           OR ("fkECId" = 1 AND "fkEmpId" IS NULL)
         )
       LIMIT 1`,
      [trimmedUser, trimmedPass]
    );
    const user = result.rows[0];
    if (!user) return null;

    const isAdmin =
      user.SysDefined === true ||
      user.SysDefined === 1 ||
      (Number(user.fkECId) === 1 && user.fkEmpId == null);

    return { user, role: isAdmin ? "admin" : "user" };
  },

  findSessionByRefreshToken: async (refreshToken) => {
    const result = await query(
      `SELECT * FROM "UserSessions" WHERE "RefreshToken" = $1`,
      [refreshToken]
    );
    return result.rows[0];
  },

  createSession: async (userId, refreshToken) => {
    await query(
      `INSERT INTO "UserSessions" ("UserID", "RefreshToken", "ExpiresAt")
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [userId, refreshToken]
    );
  },

  deleteSession: async (refreshToken) => {
    await query(
      `DELETE FROM "UserSessions" WHERE "RefreshToken" = $1`,
      [refreshToken]
    );
  },

  findByPkUserId: async (pkUserId) => {
    const result = await query(
      `SELECT "pkUserId", "UserName", "fkEmpId", "fkLocationId", "AttendanceMode", "GeofencePoint"
       FROM "AppUser"
       WHERE "pkUserId" = $1`,
      [pkUserId]
    );
    return result.rows[0];
  },

  findByPkUserIdCore: async (pkUserId) => {
    const result = await query(
      `SELECT "pkUserId", "UserName", "fkEmpId", "AttendanceMode", "GeofencePoint"
       FROM "AppUser"
       WHERE "pkUserId" = $1
       LIMIT 1`,
      [pkUserId]
    );
    return result.rows[0];
  },

  updateProfile: async (pkUserId, patch) => {
    const row = await query(
      `SELECT "pkUserId", "UserName", "Email", "Phone" FROM "AppUser" WHERE "pkUserId" = $1`,
      [pkUserId]
    );
    const u = row.rows[0];
    if (!u) return null;

    const nextUserName = patch.userName ?? patch.username ?? u.UserName;
    const nextEmail = patch.email ?? u.Email;
    const nextPhone = patch.phone ?? u.Phone;

    await query(
      `UPDATE "AppUser" SET "UserName" = $1, "Email" = $2, "Phone" = $3 WHERE "pkUserId" = $4`,
      [nextUserName, nextEmail, nextPhone, pkUserId]
    );
    return User.findByPkUserId(pkUserId);
  },

  updateProfileByEmpId: async (empId, patch) => {
    if (isNaN(empId)) return null;

    const row = await query(
      `SELECT "pkUserId", "UserName", "Email", "Phone", "fkEmpId" FROM "AppUser" WHERE "fkEmpId" = $1`,
      [parseFloat(empId)]
    );
    const u = row.rows[0];
    if (!u) return null;

    const nextUserName = patch.userName ?? patch.username ?? u.UserName;
    const nextEmail = patch.email ?? u.Email;
    const nextPhone = patch.phone ?? u.Phone;

    await query(
      `UPDATE "AppUser" SET "UserName" = $1, "Email" = $2, "Phone" = $3 WHERE "fkEmpId" = $4`,
      [nextUserName, nextEmail, nextPhone, parseFloat(empId)]
    );
    return User.findByEmpId(empId);
  },

  updateProfileImage: async (pkUserId, imagePath) => {
    await query(
      `UPDATE "AppUser" SET "ProfileImage" = $1 WHERE "pkUserId" = $2`,
      [imagePath, pkUserId]
    );
    return User.findByPkUserId(pkUserId);
  },

  findByEmpId: async (empId) => {
    if (isNaN(empId)) return null;

    const result = await query(
      `SELECT "pkUserId", "UserName", "fkEmpId", "fkLocationId", "AttendanceMode",
              "GeofencePoint", "Email", "Phone", "ProfileImage"
       FROM "AppUser"
       WHERE "fkEmpId" = $1`,
      [parseFloat(empId)]
    );
    return result.rows[0];
  },
};

module.exports = User;
