const { sql } = require("../config/db");

const Attendance = {
  // Get recent 50 attendance records
  getRecentAttendance: async () => {
    const result = await new sql.Request().query(`
      SELECT TOP 50 * FROM Attendance ORDER BY PunchDatetime DESC
    `);
    return result.recordset;
  },

  // Get attendance for a specific employee by EmpCode (Standardized History)
  getByEmpCode: async (empCode) => {
    const result = await new sql.Request()
      .input('empCode', sql.VarChar, empCode.toString())
      .query(`
        SELECT TOP 100
          EmpCode,
          EmpName,
          Punch,
          PunchDatetime,
          Latitude,
          Longitude,
          Address,
          Device
        FROM Attendance
        WHERE EmpCode = @empCode
        ORDER BY PunchDatetime DESC
      `);
    return result.recordset;
  },

  // Create attendance record
  create: async (data) => {
    const { empCode, status, empName, latitude, longitude, address } = data;
    
    console.log(`Inserting Attendance: EmpCode=${empCode}, Punch=${status}`);

    // Detailed insert with all required fields
    await new sql.Request()
      .input('empCode', sql.VarChar, empCode.toString())
      .input('empName', sql.VarChar, empName)
      .input('status', sql.VarChar, status)
      .input('latitude', sql.Numeric, latitude)
      .input('longitude', sql.Numeric, longitude)
      .input('address', sql.VarChar, address)
      .query(`
        INSERT INTO Attendance (
          PayCode,
          EmpCode, 
          EmpName, 
          AtDate, 
          PunchTime, 
          PunchDatetime, 
          Device, 
          Punch, 
          Manual, 
          Status, 
          Latitude, 
          Longitude,
          Address
        ) 
        VALUES (
          @empCode, 
          @empCode, 
          @empName, 
          CONVERT(VARCHAR, GETDATE(), 23), 
          CONVERT(VARCHAR, GETDATE(), 108), 
          GETDATE(), 
          'ReactNative', 
          @status, 
          'N', 
          1, 
          @latitude, 
          @longitude,
          @address
        )
      `);
  },
  
  // Check if a specific punch exists for today
  checkExisting: async (empCode, status) => {
    const result = await new sql.Request()
      .input('empCode', sql.VarChar, empCode.toString())
      .input('status', sql.VarChar, status)
      .query(`
        SELECT * FROM Attendance 
        WHERE EmpCode = @empCode 
        AND Punch = @status 
        AND AtDate = CONVERT(VARCHAR, GETDATE(), 23)
      `);
    return result.recordset.length > 0;
  },

  // Get the last punch for today
  getLastPunchToday: async (empCode) => {
    const result = await new sql.Request()
      .input('empCode', sql.VarChar, empCode.toString())
      .query(`
        SELECT TOP 1 Punch, PunchDatetime, Address
        FROM Attendance 
        WHERE EmpCode = @empCode 
        AND AtDate = CONVERT(VARCHAR, GETDATE(), 23)
        ORDER BY PunchDatetime DESC
      `);
    return result.recordset[0];
  },

  // Fetch all authorized attendance locations
  getLocations: async () => {
    try {
      const result = await new sql.Request().query(`
        SELECT 
          LocationID as location_id, 
          LocationName as location_name, 
          Latitude as latitude, 
          Longitude as longitude, 
          Address as address,
          AllowedRadius as allowed_radius,
          LocationType as location_type
        FROM AttendanceLocations
        WHERE IsActive = 1
      `);
      return result.recordset;
    } catch (error) {
      console.error("Error fetching locations:", error);
      // Fallback to environment variable if table is missing or empty
      return [{
        location_id: 'DEFAULT',
        location_name: 'Main Office',
        latitude: parseFloat(process.env.OFFICE_LAT || "19.102532"),
        longitude: parseFloat(process.env.OFFICE_LON || "73.008868"),
        allowed_radius: parseFloat(process.env.GEFENCE_RADIUS || "1000"),
        location_type: 'OFFICE'
      }];
    }
  },

  // Fetch a specific attendance location by ID
  getLocationById: async (locationId) => {
    const result = await new sql.Request()
      .input('locationId', sql.VarChar, locationId)
      .query(`
        SELECT 
          LocationID as location_id, 
          LocationName as location_name, 
          Latitude as latitude, 
          Longitude as longitude, 
          Address as address,
          AllowedRadius as allowed_radius,
          LocationType as location_type
        FROM AttendanceLocations
        WHERE LocationID = @locationId AND IsActive = 1
      `);
    return result.recordset[0];
  }
};

module.exports = Attendance;
