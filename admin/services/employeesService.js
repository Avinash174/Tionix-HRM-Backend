const { query } = require("../../config/db");
const { joinUserToLocation, filterUserLocationId } = require("../../config/dialect");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { toDateString, getMonthRange } = require("../utils/dateUtils");
const salaryStructureModel = require("../../models/salaryStructureModel");

const listEmployees = async (q = {}) => {
  const { page, limit, offset } = parsePagination(q);
  const search = q.search ? `%${q.search}%` : null;
  const locationId = q.locationId ? parseInt(q.locationId, 10) : null;

  const result = await query(
    `SELECT u."pkUserId", u."UserName", u."fkEmpId", u."Email", u."Phone",
            u."AttendanceMode", u."GeofencePoint", u."fkLocationId",
            l."LocationName" AS "officeName"
     FROM "dbo.AppUser" u
     LEFT JOIN "dbo.AttendanceLocations" l ON ${joinUserToLocation("u", "l")}
     WHERE u."fkEmpId" IS NOT NULL
       AND ($1::text IS NULL OR u."UserName" ILIKE $1 OR u."fkEmpId"::text ILIKE $1)
       AND ($2::bigint IS NULL OR ${filterUserLocationId("u", 2)})
     ORDER BY u."UserName"
     LIMIT $3 OFFSET $4`,
    [search, locationId, limit, offset]
  );

  const totalResult = await query(
    `SELECT COUNT(*) AS total FROM "dbo.AppUser" u
     WHERE u."fkEmpId" IS NOT NULL
       AND ($1::text IS NULL OR u."UserName" ILIKE $1 OR u."fkEmpId"::text ILIKE $1)
       AND ($2::bigint IS NULL OR ${filterUserLocationId("u", 2)})`,
    [search, locationId]
  );

  const total = Number(totalResult.rows[0]?.total || 0);
  return { data: result.rows, meta: buildPaginationMeta(page, limit, total) };
};

const resolveEmployee = async (id) => {
  if (!id) return null;
  const numericId = Number(id);

  if (Number.isFinite(numericId)) {
    const res = await query(
      `SELECT u."pkUserId", u."UserName", u."fkEmpId", u."Email", u."Phone",
              u."AttendanceMode", u."GeofencePoint", u."fkLocationId",
              l."LocationName" AS "officeName"
       FROM "dbo.AppUser" u
       LEFT JOIN "dbo.AttendanceLocations" l ON ${joinUserToLocation("u", "l")}
       WHERE u."fkEmpId" = $1::text`,
      [String(numericId)]
    );
    return res.rows[0];
  }

  const res = await query(
    `SELECT u."pkUserId", u."UserName", u."fkEmpId", u."Email", u."Phone",
            u."AttendanceMode", u."GeofencePoint", u."fkLocationId",
            l."LocationName" AS "officeName"
     FROM "dbo.AppUser" u
     LEFT JOIN "dbo.AttendanceLocations" l ON ${joinUserToLocation("u", "l")}
     WHERE u."pkUserId" = $1`,
    [id]
  );
  return res.rows[0];
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
      const officeResult = await query(
        `SELECT "LocationID" FROM "dbo.AttendanceLocations" WHERE "LocationID" = $1 AND "IsActive" = true`,
        [parsedLocationId]
      );
      if (!officeResult.rows[0]) {
        const error = new Error("Office not found");
        error.statusCode = 404;
        throw error;
      }
      nextLocationId = String(parsedLocationId);
    }
  }

  await query(
    `UPDATE "dbo.AppUser"
     SET "UserName" = $1, "Email" = $2, "Phone" = $3, "fkLocationId" = $4
     WHERE "pkUserId" = $5`,
    [nextUserName, nextEmail, nextPhone, nextLocationId, employee.pkUserId]
  );

  return resolveEmployee(employee.pkUserId);
};

const deleteEmployee = async (id) => {
  const employee = await resolveEmployee(id);
  if (!employee) return null;
  await query(`DELETE FROM "dbo.AppUser" WHERE "pkUserId" = $1`, [employee.pkUserId]);
  return employee;
};

const getAttendanceSummary = async (empCode) => {
  if (!empCode) return null;
  const { start, end } = getMonthRange();
  const result = await query(
    `SELECT
       COUNT(CASE WHEN "Punch" = 'Check IN' THEN 1 END) AS "checkIns",
       COUNT(CASE WHEN "Punch" = 'Check OUT' THEN 1 END) AS "checkOuts",
       MAX("PunchDatetime") AS "lastPunchAt"
     FROM "dbo.Attendance"
     WHERE "EmpCode" = $1 AND "AtDate" BETWEEN $2 AND $3`,
    [empCode.toString(), toDateString(start), toDateString(end)]
  );
  return result.rows[0];
};

const getActivityLogs = async (empCode) => {
  if (!empCode) return [];
  const result = await query(
    `SELECT "Punch", "PunchDatetime", "Address", "Device"
     FROM "dbo.Attendance"
     WHERE "EmpCode" = $1
     ORDER BY "PunchDatetime" DESC
     LIMIT 20`,
    [empCode.toString()]
  );
  return result.rows;
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
