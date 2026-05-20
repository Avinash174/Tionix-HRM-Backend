const { sql } = require("../config/db");

const resolveFinalEmpCode = async (userId) => {
  if (userId == null || userId === "") return null;

  let userResult;

  if (typeof userId === "string" && userId.startsWith("U")) {
    userResult = await new sql.Request()
      .input("userId", sql.VarChar, userId)
      .query("SELECT fkEmpId, UserName FROM dbo.AppUser WHERE pkUserId = @userId");
  } else if (!isNaN(userId) && userId.toString().trim() !== "") {
    userResult = await new sql.Request()
      .input("userIdNum", sql.Numeric, parseFloat(userId))
      .query("SELECT fkEmpId, UserName FROM dbo.AppUser WHERE fkEmpId = @userIdNum");
  } else {
    userResult = await new sql.Request()
      .input("userId", sql.VarChar, userId.toString())
      .query("SELECT fkEmpId, UserName FROM dbo.AppUser WHERE pkUserId = @userId");
  }

  const row = userResult.recordset[0];
  if (!row) {
    return { empCode: userId, empName: null, pkUserId: null };
  }

  return {
    empCode: row.fkEmpId ?? userId,
    empName: row.UserName ?? null,
    pkUserId: typeof userId === "string" && userId.startsWith("U") ? userId : null,
  };
};

module.exports = { resolveFinalEmpCode };
