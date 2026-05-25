const { query } = require("../config/db");

const resolveFinalEmpCode = async (userId) => {
  if (userId == null || userId === "") return null;

  let result;
  if (typeof userId === "string" && userId.startsWith("U")) {
    result = await query(
      `SELECT "fkEmpId", "UserName" FROM "dbo.AppUser" WHERE "pkUserId" = $1`,
      [userId]
    );
  } else if (!isNaN(userId) && userId.toString().trim() !== "") {
    result = await query(
      `SELECT "fkEmpId", "UserName" FROM "dbo.AppUser" WHERE "fkEmpId" = $1`,
      [parseFloat(userId)]
    );
  } else {
    result = await query(
      `SELECT "fkEmpId", "UserName" FROM "dbo.AppUser" WHERE "pkUserId" = $1`,
      [userId.toString()]
    );
  }

  const row = result.rows[0];
  if (!row) return { empCode: userId, empName: null, pkUserId: null };

  return {
    empCode: row.fkEmpId ?? userId,
    empName: row.UserName ?? null,
    pkUserId: typeof userId === "string" && userId.startsWith("U") ? userId : null,
  };
};

module.exports = { resolveFinalEmpCode };
