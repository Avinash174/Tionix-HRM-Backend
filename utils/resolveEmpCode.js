const { query } = require("../config/db");

const normalizeEmpCode = (value) => {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  return /^\d+$/.test(text) ? text : null;
};

const resolveFinalEmpCode = async (userId) => {
  if (userId == null || userId === "") return null;

  const raw = String(userId).trim();
  let row = null;

  const numericEmpCode = normalizeEmpCode(raw);
  if (numericEmpCode) {
    const result = await query(
      `SELECT "pkUserId", "fkEmpId", "UserName"
       FROM "dbo.AppUser"
       WHERE TRIM("fkEmpId"::text) = $1
       ORDER BY "pkUserId"
       LIMIT 1`,
      [numericEmpCode]
    );
    row = result.rows[0] || null;
    if (row) {
      return {
        empCode: String(row.fkEmpId).trim(),
        empName: row.UserName ?? null,
        pkUserId: row.pkUserId ?? null,
      };
    }
    return { empCode: numericEmpCode, empName: null, pkUserId: null };
  }

  const byPk = await query(
    `SELECT "pkUserId", "fkEmpId", "UserName"
     FROM "dbo.AppUser"
     WHERE "pkUserId" = $1
     LIMIT 1`,
    [raw]
  );
  row = byPk.rows[0] || null;

  if (!row) {
    const byName = await query(
      `SELECT "pkUserId", "fkEmpId", "UserName"
       FROM "dbo.AppUser"
       WHERE LOWER(TRIM("UserName")) = LOWER($1)
       ORDER BY "pkUserId"
       LIMIT 1`,
      [raw]
    );
    row = byName.rows[0] || null;
  }

  if (!row) {
    return { empCode: null, empName: null, pkUserId: null };
  }

  const empCode = row.fkEmpId != null && String(row.fkEmpId).trim() !== ""
    ? String(row.fkEmpId).trim()
    : null;

  return {
    empCode,
    empName: row.UserName ?? null,
    pkUserId: row.pkUserId ?? null,
  };
};

module.exports = { resolveFinalEmpCode, normalizeEmpCode };
