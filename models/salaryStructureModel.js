const { sql } = require("../config/db");

const SALARY_STRUCTURE_TABLE = "SalStructure";
const SALARY_CTC_TABLE = "SalCTC";

const mapStructureRow = (row) => ({
  salaryStructureId: row.pkSSId,
  empId: row.fkEmpId,
  empCode: row.EmpCode ?? null,
  employeeName: row.Employee ?? null,
  effectiveFrom: row.SalStart,
  basic: row.Basic != null ? Number(row.Basic) : null,
  allowance: row.Allowance != null ? Number(row.Allowance) : null,
  travelling: row.Travelling != null ? Number(row.Travelling) : null,
  housing: row.Housing != null ? Number(row.Housing) : null,
  daily: row.Daily != null ? Number(row.Daily) : null,
  incentive: row.Incentive != null ? Number(row.Incentive) : null,
  education: row.Education != null ? Number(row.Education) : null,
  medical: row.Medical != null ? Number(row.Medical) : null,
  other: row.Other != null ? Number(row.Other) : null,
  grossSalary: row.SalGross != null ? Number(row.SalGross) : null,
  calPF: row.CalPF ?? null,
  calESIC: row.CalESIC ?? null,
  calTDS: row.CalTDS ?? null,
  calPT: row.CalPT ?? null,
  lastStatus: row.LastStatus ?? null,
  updatedAt: row.DateTimestamp ?? null,
  remarks: row.Remarks ?? null,
});

const mapCtcRow = (row) =>
  row
    ? {
        ctcId: row.pkCTCId,
        empId: row.fkEmpId,
        ctc: row.CTC != null ? Number(row.CTC) : null,
        startDate: row.StartDate ?? null,
        validTill: row.ValidTill ?? null,
        lastStatus: row.LastStatus ?? null,
        updatedAt: row.DateTimestamp ?? null,
      }
    : null;

const getLatestOfficeLocationByEmpId = async (fkEmpId) => {
  if (fkEmpId == null || fkEmpId === "") return null;

  const empIdNum = Number(fkEmpId);
  if (!Number.isFinite(empIdNum)) return null;

  const result = await new sql.Request()
    .input("empId", sql.Numeric, empIdNum)
    .query(`
      SELECT TOP 1
        s.pkSSId,
        s.fkEmpId,
        s.Latitude,
        s.Longitude,
        s.SalStart,
        e.Employee,
        e.EmpCode
      FROM dbo.${SALARY_STRUCTURE_TABLE} s
      LEFT JOIN dbo.SalEmployee e ON e.pkEmpId = s.fkEmpId
      WHERE s.fkEmpId = @empId
      ORDER BY s.SalStart DESC, s.DateTimestamp DESC
    `);

  return result.recordset[0] || null;
};

const getLatestByEmpId = async (fkEmpId) => {
  if (fkEmpId == null || fkEmpId === "") return null;

  const empIdNum = Number(fkEmpId);
  if (!Number.isFinite(empIdNum)) return null;

  const result = await new sql.Request()
    .input("empId", sql.Numeric, empIdNum)
    .query(`
      SELECT TOP 1
        s.pkSSId, s.fkEmpId, s.SalStart, s.Basic, s.Allowance, s.Travelling,
        s.Housing, s.Daily, s.Incentive, s.Education, s.Medical, s.Other,
        s.SalGross, s.CalPF, s.CalESIC, s.CalTDS, s.CalPT,
        s.LastStatus, s.DateTimestamp, s.Remarks,
        e.Employee, e.EmpCode
      FROM dbo.${SALARY_STRUCTURE_TABLE} s
      LEFT JOIN dbo.SalEmployee e ON e.pkEmpId = s.fkEmpId
      WHERE s.fkEmpId = @empId
      ORDER BY s.SalStart DESC, s.DateTimestamp DESC
    `);

  return result.recordset[0] ? mapStructureRow(result.recordset[0]) : null;
};

const getLatestCtcByEmpId = async (fkEmpId) => {
  if (fkEmpId == null || fkEmpId === "") return null;

  const empIdNum = Number(fkEmpId);
  if (!Number.isFinite(empIdNum)) return null;

  const result = await new sql.Request()
    .input("empId", sql.Numeric, empIdNum)
    .query(`
      SELECT TOP 1
        pkCTCId, fkEmpId, CTC, StartDate, ValidTill, LastStatus, DateTimestamp
      FROM dbo.${SALARY_CTC_TABLE}
      WHERE fkEmpId = @empId
      ORDER BY StartDate DESC, DateTimestamp DESC
    `);

  return mapCtcRow(result.recordset[0] || null);
};

const getLatestSalarySnapshot = async (fkEmpId) => {
  const [salaryStructure, ctc] = await Promise.all([
    getLatestByEmpId(fkEmpId),
    getLatestCtcByEmpId(fkEmpId),
  ]);

  return {
    exists: !!salaryStructure,
    sourceTable: SALARY_STRUCTURE_TABLE,
    salaryStructure,
    ctc,
    hasCtc: !!ctc,
    ctcSourceTable: ctc ? SALARY_CTC_TABLE : null,
  };
};

module.exports = {
  getLatestOfficeLocationByEmpId,
  getLatestByEmpId,
  getLatestCtcByEmpId,
  getLatestSalarySnapshot,
};
