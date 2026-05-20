const { sql } = require("../../config/db");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { toDateString, getMonthRange } = require("../utils/dateUtils");

const listEmployees = async (query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const search = query.search ? `%${query.search}%` : null;

  const result = await new sql.Request()
    .input("search", sql.VarChar, search)
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT pkUserId, UserName, fkEmpId, Email, Phone, AttendanceMode, GeofencePoint
      FROM dbo.AppUser
      WHERE fkEmpId IS NOT NULL
        AND (@search IS NULL OR UserName LIKE @search OR CAST(fkEmpId AS VARCHAR(20)) LIKE @search)
      ORDER BY UserName
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  const totalResult = await new sql.Request()
    .input("search", sql.VarChar, search)
    .query(`
      SELECT COUNT(*) AS total
      FROM dbo.AppUser
      WHERE fkEmpId IS NOT NULL
        AND (@search IS NULL OR UserName LIKE @search OR CAST(fkEmpId AS VARCHAR(20)) LIKE @search)
    `);

  const total = Number(totalResult.recordset[0]?.total || 0);

  return {
    data: result.recordset,
    meta: buildPaginationMeta(page, limit, total),
  };
};

const resolveEmployee = async (id) => {
  if (!id) return null;
  const numericId = Number(id);
  if (Number.isFinite(numericId)) {
    const res = await new sql.Request()
      .input("empId", sql.Numeric, numericId)
      .query(`
        SELECT pkUserId, UserName, fkEmpId, Email, Phone, AttendanceMode, GeofencePoint
        FROM dbo.AppUser
        WHERE fkEmpId = @empId
      `);
    return res.recordset[0];
  }

  const res = await new sql.Request()
    .input("pkUserId", sql.VarChar, id)
    .query(`
      SELECT pkUserId, UserName, fkEmpId, Email, Phone, AttendanceMode, GeofencePoint
      FROM dbo.AppUser
      WHERE pkUserId = @pkUserId
    `);
  return res.recordset[0];
};

const updateEmployee = async (id, patch = {}) => {
  const employee = await resolveEmployee(id);
  if (!employee) return null;

  const nextUserName = patch.userName ?? patch.username ?? employee.UserName;
  const nextEmail = patch.email ?? employee.Email;
  const nextPhone = patch.phone ?? employee.Phone;

  await new sql.Request()
    .input("pkUserId", sql.VarChar, employee.pkUserId)
    .input("userName", sql.VarChar, nextUserName)
    .input("email", sql.VarChar, nextEmail)
    .input("phone", sql.VarChar, nextPhone)
    .query(`
      UPDATE dbo.AppUser
      SET UserName = @userName, Email = @email, Phone = @phone
      WHERE pkUserId = @pkUserId
    `);

  return resolveEmployee(employee.pkUserId);
};

const deleteEmployee = async (id) => {
  const employee = await resolveEmployee(id);
  if (!employee) return null;

  await new sql.Request()
    .input("pkUserId", sql.VarChar, employee.pkUserId)
    .query("DELETE FROM dbo.AppUser WHERE pkUserId = @pkUserId");

  return employee;
};

const getAttendanceSummary = async (empCode) => {
  if (!empCode) return null;
  const { start, end } = getMonthRange();
  const result = await new sql.Request()
    .input("empCode", sql.VarChar, empCode.toString())
    .input("startDate", sql.VarChar, toDateString(start))
    .input("endDate", sql.VarChar, toDateString(end))
    .query(`
      SELECT
        COUNT(CASE WHEN Punch = 'Check IN' THEN 1 END) AS checkIns,
        COUNT(CASE WHEN Punch = 'Check OUT' THEN 1 END) AS checkOuts,
        MAX(PunchDatetime) AS lastPunchAt
      FROM Attendance
      WHERE EmpCode = @empCode
        AND AtDate BETWEEN @startDate AND @endDate
    `);
  return result.recordset[0];
};

const getActivityLogs = async (empCode) => {
  if (!empCode) return [];
  const result = await new sql.Request()
    .input("empCode", sql.VarChar, empCode.toString())
    .query(`
      SELECT TOP 20 Punch, PunchDatetime, Address, Device
      FROM Attendance
      WHERE EmpCode = @empCode
      ORDER BY PunchDatetime DESC
    `);
  return result.recordset;
};

module.exports = {
  listEmployees,
  resolveEmployee,
  updateEmployee,
  deleteEmployee,
  getAttendanceSummary,
  getActivityLogs,
};
