const { sql } = require("../config/db");

const User = {
  findByCredentials: async (username, password) => {
    const trimmedUser = (username || "").trim();
    const trimmedPass = (password || "").trim();

    const result = await new sql.Request()
      .input("username", sql.NVarChar, trimmedUser)
      .input("password", sql.NVarChar, trimmedPass)
      .query(`
        SELECT TOP 1 * FROM dbo.AppUser
        WHERE LTRIM(RTRIM(UserName)) = @username
          AND LTRIM(RTRIM(Password)) = @password
          AND fkEmpId IS NOT NULL
      `);
    return result.recordset[0];
  },

  // Unified login: employees (fkEmpId) + admins (SysDefined or fkECId)
  findByLoginCredentials: async (username, password) => {
    const trimmedUser = (username || "").trim();
    const trimmedPass = (password || "").trim();

    const result = await new sql.Request()
      .input("username", sql.NVarChar, trimmedUser)
      .input("password", sql.NVarChar, trimmedPass)
      .query(`
        SELECT TOP 1 *
        FROM dbo.AppUser
        WHERE LTRIM(RTRIM(UserName)) = @username
          AND LTRIM(RTRIM(Password)) = @password
          AND (
            fkEmpId IS NOT NULL
            OR SysDefined = 1
            OR (fkECId = 1 AND fkEmpId IS NULL)
          )
      `);
    const user = result.recordset[0];
    if (!user) return null;

    const isAdmin =
      user.SysDefined === true ||
      user.SysDefined === 1 ||
      user.SysDefined === "1" ||
      (Number(user.fkECId) === 1 && user.fkEmpId == null);

    return {
      user,
      role: isAdmin ? "admin" : "user",
    };
  },

  findSessionByRefreshToken: async (refreshToken) => {
    const result = await new sql.Request()
      .input('refreshToken', sql.VarChar, refreshToken)
      .query('SELECT * FROM UserSessions WHERE RefreshToken = @refreshToken');
    return result.recordset[0];
  },

  createSession: async (userId, refreshToken) => {
    await new sql.Request()
      .input('userId', sql.VarChar, userId)
      .input('refreshToken', sql.VarChar, refreshToken)
      .query(`
        INSERT INTO UserSessions (UserID, RefreshToken, ExpiresAt)
        VALUES (@userId, @refreshToken, DATEADD(day, 7, GETDATE()))
      `);
  },

  deleteSession: async (refreshToken) => {
    await new sql.Request()
      .input('refreshToken', sql.VarChar, refreshToken)
      .query('DELETE FROM UserSessions WHERE RefreshToken = @refreshToken');
  },

  findByPkUserId: async (pkUserId) => {
    const result = await new sql.Request()
      .input('pkUserId', sql.VarChar, pkUserId)
      .query(`
        SELECT pkUserId, UserName, fkEmpId, AttendanceMode, GeofencePoint
        FROM dbo.AppUser
        WHERE pkUserId = @pkUserId
      `);
    return result.recordset[0];
  },

  findByPkUserIdCore: async (pkUserId) => {
    const result = await new sql.Request()
      .input('pkUserId', sql.VarChar, pkUserId)
      .query(`
        SELECT TOP 1 pkUserId, UserName, fkEmpId, AttendanceMode, GeofencePoint
        FROM dbo.AppUser
        WHERE pkUserId = @pkUserId
      `);
    return result.recordset[0];
  },

  updateProfile: async (pkUserId, patch) => {
    const row = await new sql.Request()
      .input('pkUserId', sql.VarChar, pkUserId)
      .query(`
        SELECT pkUserId, UserName, Email, Phone
        FROM dbo.AppUser
        WHERE pkUserId = @pkUserId
      `);
    const u = row.recordset[0];
    if (!u) return null;

    const nextUserName = patch.userName !== undefined ? patch.userName : patch.username !== undefined ? patch.username : u.UserName;
    const nextEmail = patch.email !== undefined ? patch.email : u.Email;
    const nextPhone = patch.phone !== undefined ? patch.phone : u.Phone;

    await new sql.Request()
      .input('pkUserId', sql.VarChar, pkUserId)
      .input('userName', sql.VarChar, nextUserName)
      .input('email', sql.VarChar, nextEmail)
      .input('phone', sql.VarChar, nextPhone)
      .query(`
        UPDATE dbo.AppUser
        SET UserName = @userName, Email = @email, Phone = @phone
        WHERE pkUserId = @pkUserId
      `);
    return User.findByPkUserId(pkUserId);
  },

  updateProfileByEmpId: async (empId, patch) => {
    // Safe numeric check to avoid conversion error
    if (isNaN(empId)) return null;

    const row = await new sql.Request()
      .input('empId', sql.Numeric, parseFloat(empId))
      .query('SELECT pkUserId, UserName, Email, Phone, fkEmpId FROM dbo.AppUser WHERE fkEmpId = @empId');
    
    const u = row.recordset[0];
    if (!u) return null;

    const nextUserName = patch.userName !== undefined ? patch.userName : patch.username !== undefined ? patch.username : u.UserName;
    const nextEmail = patch.email !== undefined ? patch.email : u.Email;
    const nextPhone = patch.phone !== undefined ? patch.phone : u.Phone;

    await new sql.Request()
      .input('empId', sql.Numeric, parseFloat(empId))
      .input('userName', sql.VarChar, nextUserName)
      .input('email', sql.VarChar, nextEmail)
      .input('phone', sql.VarChar, nextPhone)
      .query('UPDATE dbo.AppUser SET UserName = @userName, Email = @email, Phone = @phone WHERE fkEmpId = @empId');

    return User.findByEmpId(empId);
  },

  updateProfileImage: async (pkUserId, imagePath) => {
    await new sql.Request()
      .input('pkUserId', sql.VarChar, pkUserId)
      .input('imagePath', sql.VarChar, imagePath)
      .query(`
        UPDATE dbo.AppUser
        SET ProfileImage = @imagePath
        WHERE pkUserId = @pkUserId
      `);
    return User.findByPkUserId(pkUserId);
  },

  findByEmpId: async (empId) => {
    // Safe numeric check to avoid conversion error
    if (isNaN(empId)) return null;

    const result = await new sql.Request()
      .input('empId', sql.Numeric, parseFloat(empId))
      .query('SELECT pkUserId, UserName, fkEmpId, AttendanceMode, GeofencePoint, Email, Phone, ProfileImage FROM dbo.AppUser WHERE fkEmpId = @empId');
    
    return result.recordset[0];
  },
};

module.exports = User;
