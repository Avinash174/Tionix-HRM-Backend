const { sql } = require("../../config/db");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { toDateString, getMonthRange } = require("../utils/dateUtils");
const salaryStructureModel = require("../../models/salaryStructureModel");

const listEmployees = async (query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const search = query.search ? `%${query.search}%` : null;
  const locationId = query.locationId ? parseInt(query.locationId, 10) : null;

  const result = await new sql.Request()
    .input("search", sql.VarChar, search)
    .input("locationId", sql.Int, locationId)
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT u.pkUserId, u.UserName, u.fkEmpId, u.Email, u.Phone, u.AttendanceMode,
             u.GeofencePoint, u.fkLocationId, l.LocationName AS officeName
      FROM dbo.AppUser u
      LEFT JOIN dbo.AttendanceLocations l ON u.fkLocationId = l.LocationID
      WHERE u.fkEmpId IS NOT NULL
        AND (@search IS NULL OR u.UserName LIKE @search OR CAST(u.fkEmpId AS VARCHAR(20)) LIKE @search)
        AND (@locationId IS NULL OR u.fkLocationId = @locationId)
      ORDER BY u.UserName
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  const totalResult = await new sql.Request()
    .input("search", sql.VarChar, search)
    .input("locationId", sql.Int, locationId)
    .query(`
      SELECT COUNT(*) AS total
      FROM dbo.AppUser u
      WHERE u.fkEmpId IS NOT NULL
        AND (@search IS NULL OR u.UserName LIKE @search OR CAST(u.fkEmpId AS VARCHAR(20)) LIKE @search)
        AND (@locationId IS NULL OR u.fkLocationId = @locationId)
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
        SELECT u.pkUserId, u.UserName, u.fkEmpId, u.Email, u.Phone, u.AttendanceMode,
               u.GeofencePoint, u.fkLocationId, l.LocationName AS officeName
        FROM dbo.AppUser u
        LEFT JOIN dbo.AttendanceLocations l ON u.fkLocationId = l.LocationID
        WHERE u.fkEmpId = @empId
      `);
    return res.recordset[0];
  }

  const res = await new sql.Request()
    .input("pkUserId", sql.VarChar, id)
    .query(`
      SELECT u.pkUserId, u.UserName, u.fkEmpId, u.Email, u.Phone, u.AttendanceMode,
             u.GeofencePoint, u.fkLocationId, l.LocationName AS officeName
      FROM dbo.AppUser u
      LEFT JOIN dbo.AttendanceLocations l ON u.fkLocationId = l.LocationID
      WHERE u.pkUserId = @pkUserId
    `);
  return res.recordset[0];
};

const updateEmployee = async (id, patch = {}) => {
  const employee = await resolveEmployee(id);
  if (!employee) return null;

  const nextUserName = patch.userName ?? patch.username ?? employee.UserName;
  const nextEmail = patch.email ?? employee.Email;
  const nextPhone = patch.phone ?? employee.Phone;

  let nextLocationId = employee.fkLocationId ?? null;
  if (patch.locationId !== undefined || patch.fkLocationId !== undefined) {
    const rawLocationId = patch.locationId ?? patch.fkLocationId;
    if (rawLocationId === null || rawLocationId === "" || rawLocationId === 0) {
      nextLocationId = null;
    } else {
      const parsedLocationId = parseInt(rawLocationId, 10);
      if (!Number.isFinite(parsedLocationId)) {
        const error = new Error("Invalid locationId");
        error.statusCode = 400;
        throw error;
      }

      const officeResult = await new sql.Request()
        .input("locationId", sql.Int, parsedLocationId)
        .query(`
          SELECT LocationID
          FROM dbo.AttendanceLocations
          WHERE LocationID = @locationId AND IsActive = 1
        `);

      if (!officeResult.recordset[0]) {
        const error = new Error("Office not found");
        error.statusCode = 404;
        throw error;
      }

      nextLocationId = parsedLocationId;
    }
  }

  await new sql.Request()
    .input("pkUserId", sql.VarChar, employee.pkUserId)
    .input("userName", sql.VarChar, nextUserName)
    .input("email", sql.VarChar, nextEmail)
    .input("phone", sql.VarChar, nextPhone)
    .input("locationId", sql.Int, nextLocationId)
    .query(`
      UPDATE dbo.AppUser
      SET UserName = @userName,
          Email = @email,
          Phone = @phone,
          fkLocationId = @locationId
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

const getLatestSalaryStructure = async (id) => {
  const employee = await resolveEmployee(id);
  if (!employee) return null;

  const fkEmpId = employee.fkEmpId;
  if (!fkEmpId) {
    const error = new Error("Employee is not linked to SalEmployee");
    error.statusCode = 400;
    throw error;
  }

  const snapshot = await salaryStructureModel.getLatestSalarySnapshot(fkEmpId);

  return {
    employee: {
      pkUserId: employee.pkUserId,
      userName: employee.UserName,
      fkEmpId: employee.fkEmpId,
      officeName: employee.officeName ?? null,
    },
    ...snapshot,
  };
};

module.exports = {
  listEmployees,
  resolveEmployee,
  updateEmployee,
  deleteEmployee,
  getAttendanceSummary,
  getActivityLogs,
  getLatestSalaryStructure,
};
