const { query } = require("../config/db");

const Attendance = {
  // Get recent 50 attendance records
  getRecentAttendance: async () => {
    const result = await query(
      `SELECT * FROM "Attendance" ORDER BY "PunchDatetime" DESC LIMIT 50`
    );
    return result.rows;
  },

  // Get attendance for a specific employee by EmpCode
  getByEmpCode: async (empCode) => {
    const result = await query(
      `SELECT "EmpCode", "EmpName", "Punch", "PunchDatetime",
              "Latitude", "Longitude", "Address", "Device"
       FROM "Attendance"
       WHERE "EmpCode" = $1
       ORDER BY "PunchDatetime" DESC
       LIMIT 100`,
      [empCode.toString()]
    );
    return result.rows;
  },

  // Create attendance record
  create: async (data) => {
    const { empCode, status, empName, latitude, longitude, address } = data;

    console.log(`Inserting Attendance: EmpCode=${empCode}, Punch=${status}`);

    await query(
      `INSERT INTO "Attendance" (
        "PayCode", "EmpCode", "EmpName", "AtDate", "PunchTime",
        "PunchDatetime", "Device", "Punch", "Manual", "Status",
        "Latitude", "Longitude", "Address"
      ) VALUES (
        $1, $1, $2,
        CURRENT_DATE::text,
        TO_CHAR(NOW(), 'HH24:MI:SS'),
        NOW(),
        'ReactNative', $3, 'N', 1, $4, $5, $6
      )`,
      [empCode.toString(), empName, status, latitude, longitude, address]
    );
  },

  // Check if a specific punch exists for today
  checkExisting: async (empCode, status) => {
    const result = await query(
      `SELECT 1 FROM "Attendance"
       WHERE "EmpCode" = $1
         AND "Punch" = $2
         AND "AtDate" = CURRENT_DATE::text`,
      [empCode.toString(), status]
    );
    return result.rows.length > 0;
  },

  // Get the last punch for today
  getLastPunchToday: async (empCode) => {
    const result = await query(
      `SELECT "Punch", "PunchDatetime", "Address"
       FROM "Attendance"
       WHERE "EmpCode" = $1
         AND "AtDate" = CURRENT_DATE::text
       ORDER BY "PunchDatetime" DESC
       LIMIT 1`,
      [empCode.toString()]
    );
    return result.rows[0];
  },

  // Fetch all authorized attendance locations
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
         FROM "AttendanceLocations"
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

  // Fetch a specific attendance location by ID
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
       FROM "AttendanceLocations"
       WHERE "LocationID" = $1 AND "IsActive" = true`,
      [parsedId]
    );
    return result.rows[0];
  },
};

module.exports = Attendance;
