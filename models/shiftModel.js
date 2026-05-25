const { query } = require("../config/db");

const getActiveTimingForEmployee = async (fkEmpId) => {
  if (fkEmpId == null || fkEmpId === "") return null;
  const empIdNum = Number(fkEmpId);
  if (!Number.isFinite(empIdNum)) return null;

  const empTiming = await query(
    `SELECT
       et."pkWTId", et."fkEmpId",
       et."Shift" AS "shiftName",
       et."SWork", et."EWork", et."SBreak", et."EBreak",
       et."TWork", et."TBreak", et."fkSTId",
       et."Type" AS "timingType",
       et."TSD", et."TED",
       'SalEmpTiming' AS source
     FROM "SalEmpTiming" et
     WHERE et."fkEmpId" = $1
       AND et."TSD" <= CURRENT_DATE
       AND (et."TED" IS NULL OR et."TED" >= CURRENT_DATE)
     ORDER BY et."TSD" DESC
     LIMIT 1`,
    [empIdNum]
  );

  if (empTiming.rows[0]) {
    return normalizeTimingRow(empTiming.rows[0]);
  }

  const shiftFromEmployee = await query(
    `SELECT
       e."pkEmpId" AS "fkEmpId", e."fkSTId", e."EmpCode",
       e."Employee" AS "employeeName",
       st."Shift" AS "shiftName",
       st."SWork", st."EWork", st."SBreak", st."EBreak",
       st."TWork", st."TBreak",
       'SalShiftTiming' AS source
     FROM "SalEmployee" e
     LEFT JOIN "SalShiftTiming" st ON st."pkSTId" = e."fkSTId"
     WHERE e."pkEmpId" = $1
     LIMIT 1`,
    [empIdNum]
  );

  const row = shiftFromEmployee.rows[0];
  if (!row || !row.SWork || !row.EWork) return null;

  return normalizeTimingRow(row);
};

const normalizeTimingRow = (row) => ({
  fkEmpId: row.fkEmpId,
  fkSTId: row.fkSTId,
  empCode: row.EmpCode || null,
  employeeName: row.employeeName || null,
  shiftName: row.shiftName || "Default",
  startWork: row.SWork,
  endWork: row.EWork,
  startBreak: row.SBreak,
  endBreak: row.EBreak,
  workHours: row.TWork,
  breakMinutes: row.TBreak,
  timingType: row.timingType || null,
  source: row.source,
});

const getEmployeeSummary = async (fkEmpId) => {
  const empIdNum = Number(fkEmpId);
  if (!Number.isFinite(empIdNum)) return null;

  const result = await query(
    `SELECT "pkEmpId", "EmpCode", "Employee", "fkSTId", "fkDepId", "fkDegId"
     FROM "SalEmployee"
     WHERE "pkEmpId" = $1
     LIMIT 1`,
    [empIdNum]
  );
  return result.rows[0] || null;
};

module.exports = {
  getActiveTimingForEmployee,
  getEmployeeSummary,
};
