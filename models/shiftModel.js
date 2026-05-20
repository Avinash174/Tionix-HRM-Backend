const { sql } = require("../config/db");

/**
 * Active employee timing: SalEmpTiming (per employee) first, then SalShiftTiming via SalEmployee.fkSTId.
 */
const getActiveTimingForEmployee = async (fkEmpId) => {
  if (fkEmpId == null || fkEmpId === "") return null;

  const empIdNum = Number(fkEmpId);
  if (!Number.isFinite(empIdNum)) return null;

  const empTiming = await new sql.Request()
    .input("empId", sql.Numeric, empIdNum)
    .query(`
      SELECT TOP 1
        et.pkWTId,
        et.fkEmpId,
        et.Shift AS shiftName,
        et.SWork,
        et.EWork,
        et.SBreak,
        et.EBreak,
        et.TWork,
        et.TBreak,
        et.fkSTId,
        et.Type AS timingType,
        et.TSD,
        et.TED,
        'SalEmpTiming' AS source
      FROM dbo.SalEmpTiming et
      WHERE et.fkEmpId = @empId
        AND et.TSD <= CAST(GETDATE() AS DATE)
        AND (et.TED IS NULL OR et.TED >= CAST(GETDATE() AS DATE))
      ORDER BY et.TSD DESC
    `);

  if (empTiming.recordset[0]) {
    return normalizeTimingRow(empTiming.recordset[0]);
  }

  const shiftFromEmployee = await new sql.Request()
    .input("empId", sql.Numeric, empIdNum)
    .query(`
      SELECT TOP 1
        e.pkEmpId AS fkEmpId,
        e.fkSTId,
        e.EmpCode,
        e.Employee AS employeeName,
        st.Shift AS shiftName,
        st.SWork,
        st.EWork,
        st.SBreak,
        st.EBreak,
        st.TWork,
        st.TBreak,
        'SalShiftTiming' AS source
      FROM dbo.SalEmployee e
      LEFT JOIN dbo.SalShiftTiming st ON st.pkSTId = e.fkSTId
      WHERE e.pkEmpId = @empId
    `);

  const row = shiftFromEmployee.recordset[0];
  if (!row || !row.SWork || !row.EWork) {
    return null;
  }

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

  const result = await new sql.Request()
    .input("empId", sql.Numeric, empIdNum)
    .query(`
      SELECT TOP 1 pkEmpId, EmpCode, Employee, fkSTId, fkDepId, fkDegId
      FROM dbo.SalEmployee
      WHERE pkEmpId = @empId
    `);

  return result.recordset[0] || null;
};

module.exports = {
  getActiveTimingForEmployee,
  getEmployeeSummary,
};
