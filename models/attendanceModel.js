const { query } = require("../config/db");
const { atDateInsert, punchTimeInsert, atDateToday } = require("../config/dialect");

const Attendance = {
  getRecentAttendance: async () => {
    const result = await query(
      `SELECT * FROM "dbo.Attendance" ORDER BY "PunchDatetime" DESC LIMIT 50`
    );
    return result.rows;
  },

  getByEmpCode: async (empCode) => {
    const result = await query(
      `SELECT "EmpCode", "EmpName", "Punch", "PunchDatetime",
              "Latitude", "Longitude", "Address", "Device"
       FROM "dbo.Attendance"
       WHERE "EmpCode" = $1
       ORDER BY "PunchDatetime" DESC
       LIMIT 100`,
      [empCode.toString()]
    );
    return result.rows;
  },

  create: async (data) => {
    const { empCode, status, empName, latitude, longitude, address } = data;

    console.log(`Inserting Attendance: EmpCode=${empCode}, Punch=${status}`);

    await query(
      `INSERT INTO "dbo.Attendance" (
        "PayCode", "EmpCode", "EmpName", "AtDate", "PunchTime",
        "PunchDatetime", "Device", "Punch", "Manual", "Status",
        "Latitude", "Longitude", "Address"
      ) VALUES (
        $1, $1, $2,
        ${atDateInsert()},
        ${punchTimeInsert()},
        NOW(),
        'ReactNative', $3, 'N', 1, $4, $5, $6
      )`,
      [empCode.toString(), empName, status, latitude, longitude, address]
    );
  },

  checkExisting: async (empCode, status) => {
    const result = await query(
      `SELECT 1 FROM "dbo.Attendance"
       WHERE "EmpCode" = $1
         AND "Punch" = $2
         AND ${atDateToday()}`,
      [empCode.toString(), status]
    );
    return result.rows.length > 0;
  },

  getLastPunchToday: async (empCode) => {
    const result = await query(
      `SELECT "Punch", "PunchDatetime", "Address"
       FROM "dbo.Attendance"
       WHERE "EmpCode" = $1
         AND ${atDateToday()}
       ORDER BY "PunchDatetime" DESC
       LIMIT 1`,
      [empCode.toString()]
    );
    return result.rows[0];
  },

  getLocations: async () => {
    try {
      const result = await query(
        `SELECT
          "LocationID"   AS location_id,
          "LocationName" AS location_name,
          "Latitude"     AS latitude,
          "Longitude"    AS longitude,
          "Address"      AS address,
          "AllowedRadius" AS allowed_radius,
          "LocationType"  AS location_type
         FROM "dbo.AttendanceLocations"
         WHERE "IsActive" = true`
      );
      return result.rows;
    } catch (error) {
      console.error("Error fetching locations:", error);
      throw new Error(
        "AttendanceLocations table is unavailable. Configure offices in the database."
      );
    }
  },

  getLocationById: async (locationId) => {
    const parsedId = parseInt(locationId, 10);
    if (!Number.isFinite(parsedId)) return null;

    const result = await query(
      `SELECT
        "LocationID"    AS location_id,
        "LocationName"  AS location_name,
        "Latitude"      AS latitude,
        "Longitude"     AS longitude,
        "Address"       AS address,
        "AllowedRadius" AS allowed_radius,
        "LocationType"  AS location_type
       FROM "dbo.AttendanceLocations"
       WHERE "LocationID" = $1 AND "IsActive" = true`,
      [parsedId]
    );
    return result.rows[0];
  },
};

module.exports = Attendance;
