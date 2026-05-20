const { getDistance } = require("geolib");
const NodeGeocoder = require('node-geocoder');

const geocoder = NodeGeocoder({
  provider: 'openstreetmap',
  httpAdapter: 'https',
  formatter: null,
  limit: 1,
  timeout: 5000, // milliseconds
});
const Attendance = require("../models/attendanceModel");
const User = require("../models/userModel");
const ShiftModel = require("../models/shiftModel");
const {
  validatePunchAgainstShift,
  buildShiftStatusPayload,
} = require("../utils/shiftValidation");
const { emitEvent } = require("../sockets");
const marketingService = require("../services/marketingService");
const { MarketingApiError } = require("../utils/marketingAttendance");
const dotenv = require("dotenv");
dotenv.config();

/**
 * Calculates distance between two points in meters using geolib for high accuracy
 */
const calculateDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  return getDistance(
    { latitude: parseFloat(lat1), longitude: parseFloat(lon1) },
    { latitude: parseFloat(lat2), longitude: parseFloat(lon2) }
  );
};

const getAddressesFromCoordinates = async (latitude, longitude) => {
  try {
    const res = await geocoder.reverse({ lat: latitude, lon: longitude });
    if (res && res.length > 0) {
      const address = res[0].formattedAddress || res[0].streetName + ', ' + res[0].city + ', ' + res[0].state + ', ' + res[0].zipcode + ', ' + res[0].country;
      return address;
    }
    return 'Address not found';
  } catch (error) {
    console.error("Error getting address from coordinates:", error);
    return 'Error resolving address';
  }
};

const checkGeoFenceForAttendanceByUserPoint = async (
  employee,
  punchLat,
  punchLng
) => {
  if (!employee) {
    return { ok: false, code: 404, message: "Employee not found" };
  }

  if (!employee.GeofencePoint) {
    return {
      ok: false,
      code: 400,
      message: "Geofence point is not configured for this employee",
    };
  }

  const geoPointId = employee.GeofencePoint;
  const geoLocation = await Attendance.getLocationById(geoPointId);
  
  if (!geoLocation) {
    return { ok: false, code: 404, message: "Linked geofence location not found" };
  }

  const officeLat = Number(geoLocation.latitude);
  const officeLng = Number(geoLocation.longitude);

  if (Number.isNaN(officeLat) || Number.isNaN(officeLng)) {
    return { ok: false, code: 500, message: "Geofence coordinates are invalid on server" };
  }

  const punchLatNum = Number(punchLat);
  const punchLngNum = Number(punchLng);

  if (Number.isNaN(punchLatNum) || Number.isNaN(punchLngNum)) {
    return { ok: false, code: 400, message: "Invalid punch latitude/longitude" };
  }

  const distance = calculateDistanceInMeters(
    punchLatNum,
    punchLngNum,
    officeLat,
    officeLng
  );

  const allowedRadius =
    geoLocation.allowed_radius != null ? Number(geoLocation.allowed_radius) : 1000;

  const outOfRadiusBy = distance - allowedRadius;

  if (distance <= allowedRadius) {
    return { ok: true, distance, allowedRadius, outOfRadiusBy: 0, location_name: geoLocation.location_name };
  }

  return {
    ok: false,
    code: 403,
    message: `Out of location range by ${Math.round(outOfRadiusBy)} meter(s)`,
    distance,
    allowedRadius,
    outOfRadiusBy,
  };
};

const getMarketingUserId = (req) => req.user?.id;

const handleMarketingError = (res, error, fallbackMessage) => {
    if (error instanceof MarketingApiError) {
        return res.status(error.statusCode).json({
            success: false,
            message: error.message,
            code: error.code,
        });
    }

    console.error(error);
    return res.status(500).json({
        success: false,
        message: error.message || fallbackMessage,
    });
};

/**
 * Resolves the nearest valid attendance location for an employee
 * @param {string} userId Employee ID/Code
 * @param {number} employeeLatitude Current GPS Latitude
 * @param {number} employeeLongitude Current GPS Longitude
 * @returns {Object} Valid location details
 */
const resolveAttendanceLocation = async (userId, employeeLatitude, employeeLongitude) => {
    const locations = await Attendance.getLocations();
    
    let nearestLocation = null;
    let minDistance = Infinity;

    for (const loc of locations) {
        const distance = calculateDistanceInMeters(
            parseFloat(employeeLatitude), 
            parseFloat(employeeLongitude), 
            parseFloat(loc.latitude), 
            parseFloat(loc.longitude)
        );

        if (distance < minDistance) {
            minDistance = distance;
            nearestLocation = {
                ...loc,
                distance
            };
        }
    }

    if (!nearestLocation || nearestLocation.distance > nearestLocation.allowed_radius) {
        const distStr = nearestLocation ? `${nearestLocation.distance.toFixed(0)}m` : 'N/A';
        const allowedStr = nearestLocation ? `${nearestLocation.allowed_radius}m` : 'N/A';
        const error = new Error(`Out of location range by ${Math.round(nearestLocation ? nearestLocation.distance - nearestLocation.allowed_radius : 0)} meter(s)`);
        error.statusCode = 403;
        error.details = { distance: distStr, allowed: allowedStr };
        throw error;
    }

        return {
            location_type: nearestLocation.location_type || 'OFFICE',
            location_id: nearestLocation.location_id,
            location_name: nearestLocation.location_name,
            allowed_radius: nearestLocation.allowed_radius,
            distance: nearestLocation.distance,
            matching_rule: "GEOFENCE_STRICT",
            address: await getAddressesFromCoordinates(employeeLatitude, employeeLongitude)
        };
};

const punch_in = async (req, res) => {
    try {
        const { latitude, longitude, remark } = req.body || {};

        const result = await marketingService.punchIn({
            userId: getMarketingUserId(req),
            latitude,
            longitude,
            remark,
            userAgent: req.headers["user-agent"] || null,
            userIp: req.headers["x-forwarded-for"] || req.ip || null,
        });

        return res.status(200).json({
            success: true,
            message: "Punch in successful",
            data: result,
        });
    } catch (error) {
        return handleMarketingError(res, error, "Unable to punch in");
    }
};

const markAttendance = async (req, res) => {
    // DEBUG LOG: This will show in your terminal
    console.log("--------------------------------");
    console.log("PUNCH REQUEST RECEIVED");
    console.log("Body Content:", JSON.stringify(req.body, null, 2));

    // Priority 1: Use the authenticated user's ID from the token
    // Priority 2: Use the empCode from the request body (for backward compatibility or non-auth routes)
    const { 
        empCode, EmpCode, 
        status, Status, 
        punch, 
        latitude, longitude,
        remark
    } = req.body || {};

    let userId = req.user ? req.user.id : (empCode || EmpCode);
    let finalEmpCode = null;
    let empName = req.user ? req.user.username : 'Employee';
    const finalStatus = status || Status || punch;
    
    // Resolve UserId to EmpCode
    if (userId) {
        try {
            const { sql } = require("../config/db");
            let userResult;
            
            // Safe resolution using explicit types to avoid conversion errors
            if (typeof userId === 'string' && userId.startsWith('U')) {
                userResult = await new sql.Request()
                    .input('userId', sql.VarChar, userId)
                    .query('SELECT fkEmpId, UserName FROM dbo.AppUser WHERE pkUserId = @userId');
            } else if (!isNaN(userId) && userId.toString().trim() !== "") {
                userResult = await new sql.Request()
                    .input('userIdNum', sql.Numeric, parseFloat(userId))
                    .query('SELECT fkEmpId, UserName FROM dbo.AppUser WHERE fkEmpId = @userIdNum');
            } else {
                userResult = await new sql.Request()
                    .input('userId', sql.VarChar, userId.toString())
                    .query('SELECT fkEmpId, UserName FROM dbo.AppUser WHERE pkUserId = @userId');
            }

            if (userResult.recordset.length > 0) {
                finalEmpCode = userResult.recordset[0].fkEmpId;
                if (!req.user) {
                    empName = userResult.recordset[0].UserName;
                }
            } else {
                // If not found in AppUser, fallback to the provided ID
                finalEmpCode = userId;
            }
        } catch (err) {
            console.error("Error resolving EmpCode:", err);
            finalEmpCode = userId;
        }
    }
    
    // Smart coordinate detection (handles latitude, Latitude, LATITUDE, etc.)
    const getCoord = (obj, keys) => {
        for (const key of keys) {
            const val = obj[key];
            if (val !== undefined && val !== null && val !== "") return val;
        }
        return null;
    };

    const rawLat = getCoord(req.body, ["latitude", "Latitude", "LAT", "lat"]);
    const rawLon = getCoord(req.body, ["longitude", "Longitude", "LON", "lon"]);

    try {
        if (!finalEmpCode || !finalStatus) {
            console.log("Validation Failed: Missing EmpCode or Status");
            return res.status(400).json({ 
                success: false, 
                message: 'EmpCode and Status are required',
                received: req.body 
            });
        }

        if (rawLat === null || rawLon === null) {
            return res.status(400).json({
                success: false,
                message: "Latitude and Longitude are required"
            });
        }

        console.log(`Processing: ${finalStatus} for Employee: ${finalEmpCode}`);
        
        // Ensure coordinates are numbers for distance calculation
        const numLat = parseFloat(rawLat);
        const numLon = parseFloat(rawLon);

        if (isNaN(numLat) || isNaN(numLon)) {
            return res.status(400).json({
                success: false,
                message: "Latitude and Longitude must be valid numbers"
            });
        }

        // --- Dynamic Location Resolution ---
        const locationData = await resolveAttendanceLocation(finalEmpCode, numLat, numLon);
        
        console.log(`GEOFENCE CHECK: Employee ${finalEmpCode} is ${locationData.distance.toFixed(2)}m from ${locationData.location_name}.`);

        // --- Daily Limit Check (Only for IN/OUT) ---
        if (finalStatus === "Check IN" || finalStatus === "Check OUT") {
            const alreadyExists = await Attendance.checkExisting(finalEmpCode, finalStatus);
            if (alreadyExists) {
                console.log(`REJECTED: Duplicate ${finalStatus} for today.`);
                return res.status(400).json({ 
                    success: false, 
                    message: `You have already recorded ${finalStatus} for today.` 
                });
            }
        }

        if (finalStatus === "Check OUT") {
            const hasCheckIn = await Attendance.checkExisting(finalEmpCode, "Check IN");
            if (!hasCheckIn) {
                return res.status(400).json({
                    success: false,
                    message: "You must Check IN before Check OUT.",
                });
            }
        }

        // --- Shift timing check (SalEmpTiming / SalShiftTiming) ---
        let shiftTiming = null;
        let shiftCheck = null;
        if (finalStatus === "Check IN" || finalStatus === "Check OUT") {
            shiftTiming = await ShiftModel.getActiveTimingForEmployee(finalEmpCode);
            shiftCheck = validatePunchAgainstShift(shiftTiming, finalStatus);

            console.log(
                `SHIFT CHECK: ${finalEmpCode} ${finalStatus} => ${shiftCheck.code} (allowed=${shiftCheck.allowed})`
            );

            if (shiftCheck.blocked) {
                return res.status(403).json({
                    success: false,
                    message: shiftCheck.message,
                    shift: buildShiftStatusPayload(shiftTiming, shiftCheck),
                });
            }
        }

        // Use the logged-in user's name if available
        const empName = req.user ? req.user.username : 'Employee';

        await Attendance.create({ 
            empCode: finalEmpCode, 
            status: finalStatus, 
            empName,
            latitude: numLat, 
            longitude: numLon,
            address: locationData.address
        });

        emitEvent("employee-location-update", {
            empCode: finalEmpCode,
            empName,
            latitude: numLat,
            longitude: numLon,
            address: locationData.address,
            status: finalStatus,
            timestamp: new Date().toISOString(),
        });

        if (finalStatus === "Check IN" || finalStatus === "Resume") {
            emitEvent("employee-online", {
                empCode: finalEmpCode,
                empName,
                status: finalStatus,
            });
            emitEvent("employee-checkin", {
                empCode: finalEmpCode,
                empName,
                status: finalStatus,
            });
        }

        if (finalStatus === "Check OUT") {
            emitEvent("employee-offline", {
                empCode: finalEmpCode,
                empName,
                status: finalStatus,
            });
            emitEvent("employee-checkout", {
                empCode: finalEmpCode,
                empName,
                status: finalStatus,
            });
        }
        
        const successMessage =
            shiftCheck && shiftCheck.code === "LATE"
                ? `${finalStatus} recorded (late). ${locationData.location_name}.`
                : `${finalStatus} successfully at ${locationData.location_name}.`;

        res.status(201).json({ 
            success: true, 
            message: successMessage,
            distance: `${locationData.distance.toFixed(2)}m`,
            data: locationData,
            shift: buildShiftStatusPayload(shiftTiming, shiftCheck),
        });
    } catch (err) {
        console.error("Attendance Error:", err);
        const statusCode = err.statusCode || 500;

        emitEvent("attendance-alert", {
            empCode: finalEmpCode,
            empName,
            status: finalStatus,
            message: err.message,
            timestamp: new Date().toISOString(),
        });

        if (statusCode === 403) {
            emitEvent("geofence-alert", {
                empCode: finalEmpCode,
                empName,
                status: finalStatus,
                message: err.message,
                distance: err.details?.distance,
                allowed: err.details?.allowed,
            });
        }
        res.status(statusCode).json({ 
            success: false, 
            message: err.message,
            distance: err.details?.distance,
            allowed: err.details?.allowed
        });
    }
};

const markGeofenceAttendance = async (req, res) => {
  try {
    const { employeeId, lat, lng } = req.body;

    if (!employeeId) return res.status(400).json({ success: false, message: "employeeId is required" });

    const employee = await User.findByPkUserId(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });

    if (employee.AttendanceMode !== "Geofence") {
      return res.status(403).json({ success: false, message: "Employee is not configured for Geofence attendance." });
    }

    if (lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        message: "Latitude and Longitude are required for Geofence attendance.",
      });
    }

    const geoResult = await checkGeoFenceForAttendanceByUserPoint(employee, lat, lng);

    if (!geoResult.ok) {
      return res.status(geoResult.code || 400).json({
        success: false,
        message: geoResult.message,
        distance: `${geoResult.distance ? geoResult.distance.toFixed(2) : 0}m`,
        allowedRadius: `${geoResult.allowedRadius}m`,
        outOfRadiusBy: `${geoResult.outOfRadiusBy ? geoResult.outOfRadiusBy.toFixed(2) : 0}m`,
      });
    }

    // Reuse core markAttendance logic
    req.body.empCode = employee.fkEmpId;
    if (!req.body.status && !req.body.Status && !req.body.punch) {
        req.body.status = "Check IN"; 
    }

    return markAttendance(req, res);
  } catch (err) {
    console.error("markGeofenceAttendance error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
  }
};

// Dedicated Break API
const startBreak = async (req, res) => {
    req.body = { ...req.body, status: "Break" }; 
    return markAttendance(req, res);
};

// Dedicated Resume API
const resumeWork = async (req, res) => {
    req.body = { ...req.body, status: "Resume" };
    return markAttendance(req, res);
};

// Dedicated Checkout API
const checkout = async (req, res) => {
    req.body = { ...req.body, status: "Check OUT" };
    return markAttendance(req, res);
};

const getRecentAttendance = async (req, res) => {
    try {
        // Use the authenticated user's ID from the token
        const userId = req.user.id;
        let finalEmpCode = userId;

        console.log(`[getRecentAttendance] Resolving userId: ${userId}`);

        // Resolve pkUserId to fkEmpId if necessary
        try {
            const { sql } = require("../config/db");
            let userResult;
            
            if (typeof userId === 'string' && userId.startsWith('U')) {
                userResult = await new sql.Request()
                    .input('userId', sql.VarChar, userId)
                    .query('SELECT fkEmpId FROM dbo.AppUser WHERE pkUserId = @userId');
            } else if (!isNaN(userId) && userId.toString().trim() !== "") {
                userResult = await new sql.Request()
                    .input('userIdNum', sql.Numeric, parseFloat(userId))
                    .query('SELECT fkEmpId FROM dbo.AppUser WHERE fkEmpId = @userIdNum');
            } else {
                userResult = await new sql.Request()
                    .input('userId', sql.VarChar, userId.toString())
                    .query('SELECT fkEmpId FROM dbo.AppUser WHERE pkUserId = @userId');
            }

            if (userResult.recordset.length > 0 && userResult.recordset[0].fkEmpId) {
                finalEmpCode = userResult.recordset[0].fkEmpId;
                console.log(`[getRecentAttendance] Resolved to finalEmpCode: ${finalEmpCode}`);
            }
        } catch (err) {
            console.error("Error resolving EmpCode for history:", err);
        }

        // Reuse the existing getAttendanceByEmpCode logic but for the logged-in user
        req.params.empCode = finalEmpCode;
        return getAttendanceByEmpCode(req, res);
    } catch (err) {
        console.error("[getRecentAttendance] Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Helper to format milliseconds to HH:mm
const formatDuration = (ms) => {
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
};

const getAttendanceByEmpCode = async (req, res) => {
    try {
        let { empCode } = req.params;
        console.log(`[getAttendanceByEmpCode] empCode: ${empCode}`);
        
        // Resolve UserId to EmpCode
        if (empCode) {
            try {
                const { sql } = require("../config/db");
                let userResult;
                
                if (typeof empCode === 'string' && empCode.startsWith('U')) {
                    userResult = await new sql.Request()
                        .input('empCode', sql.VarChar, empCode)
                        .query('SELECT fkEmpId FROM dbo.AppUser WHERE pkUserId = @empCode');
                } else if (!isNaN(empCode) && empCode.toString().trim() !== "") {
                    userResult = await new sql.Request()
                        .input('empCodeNum', sql.Numeric, parseFloat(empCode))
                        .query('SELECT fkEmpId FROM dbo.AppUser WHERE fkEmpId = @empCodeNum');
                } else {
                    userResult = await new sql.Request()
                        .input('empCode', sql.VarChar, empCode.toString())
                        .query('SELECT fkEmpId FROM dbo.AppUser WHERE pkUserId = @empCode');
                }

                if (userResult.recordset.length > 0 && userResult.recordset[0].fkEmpId) {
                    empCode = userResult.recordset[0].fkEmpId;
                    console.log(`[getAttendanceByEmpCode] Resolved to empCode: ${empCode}`);
                }
            } catch (err) {
                console.error("Error resolving EmpCode for history by code:", err);
            }
        }

        console.log(`[getAttendanceByEmpCode] Fetching records for: ${empCode}`);
        const records = await Attendance.getByEmpCode(empCode);
        console.log(`[getAttendanceByEmpCode] Found ${records.length} records`);

        // Group by Date and Calculate Stats
        const dailyData = {};
        
        // Sort records by time ascending for calculation
        const sortedRecords = [...records].sort((a, b) => new Date(a.PunchDatetime) - new Date(b.PunchDatetime));

        sortedRecords.forEach(rec => {
            const dt = new Date(rec.PunchDatetime);
            // Convert to local date string (YYYY-MM-DD)
            const date = dt.toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD format
            
            if (!dailyData[date]) {
                dailyData[date] = { 
                    date, 
                    records: [], 
                    totalWorkMs: 0, 
                    totalBreakMs: 0,
                    lastPunchTime: null,
                    lastStatus: null
                };
            }

            const currentMs = dt.getTime();
            const status = rec.Punch;

            if (dailyData[date].lastPunchTime) {
                const diff = currentMs - dailyData[date].lastPunchTime;
                
                if (dailyData[date].lastStatus === "Check IN" || dailyData[date].lastStatus === "Resume") {
                    dailyData[date].totalWorkMs += diff;
                } else if (dailyData[date].lastStatus === "Break") {
                    dailyData[date].totalBreakMs += diff;
                }
            }

            dailyData[date].lastPunchTime = currentMs;
            dailyData[date].lastStatus = status;
            dailyData[date].records.push(rec);
        });

        // Optional: Calculate LIVE duration for "today" if the last status is active
        const todayStr = new Date().toLocaleDateString('en-CA');
        if (dailyData[todayStr]) {
            const day = dailyData[todayStr];
            if (day.lastStatus === "Check IN" || day.lastStatus === "Resume") {
                const liveDiff = new Date().getTime() - day.lastPunchTime;
                day.totalWorkMs += liveDiff;
            } else if (day.lastStatus === "Break") {
                const liveDiff = new Date().getTime() - day.lastPunchTime;
                day.totalBreakMs += liveDiff;
            }
        }

        // Format final response
        const formattedHistory = Object.values(dailyData).map(day => ({
            date: day.date,
            totalWork: formatDuration(day.totalWorkMs),
            totalBreak: formatDuration(day.totalBreakMs),
            records: day.records.reverse() // Newest first for UI
        })).reverse();

        res.json({
            success: true,
            data: formattedHistory
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getAttendanceConfig = async (req, res) => {
    try {
        const liveLocationService = require("../services/liveLocationService");
        res.json({
            success: true,
            config: {
                latitude: parseFloat(process.env.OFFICE_LAT || "19.0959"),
                longitude: parseFloat(process.env.OFFICE_LON || "73.0205"),
                radius: parseFloat(process.env.GEFENCE_RADIUS || "1000"),
                liveTracking: liveLocationService.getTrackingConfig(),
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const resolveFinalEmpCode = async (userId) => {
    let finalEmpCode = userId;
    const { sql } = require("../config/db");
    let userResult;

    if (typeof userId === "string" && userId.startsWith("U")) {
        userResult = await new sql.Request()
            .input("userId", sql.VarChar, userId)
            .query("SELECT fkEmpId FROM dbo.AppUser WHERE pkUserId = @userId");
    } else if (!isNaN(userId) && userId.toString().trim() !== "") {
        userResult = await new sql.Request()
            .input("userIdNum", sql.Numeric, parseFloat(userId))
            .query("SELECT fkEmpId FROM dbo.AppUser WHERE fkEmpId = @userIdNum");
    } else {
        userResult = await new sql.Request()
            .input("userId", sql.VarChar, userId.toString())
            .query("SELECT fkEmpId FROM dbo.AppUser WHERE pkUserId = @userId");
    }

    if (userResult.recordset.length > 0 && userResult.recordset[0].fkEmpId) {
        finalEmpCode = userResult.recordset[0].fkEmpId;
    }

    return finalEmpCode;
};

const getShiftSchedule = async (req, res) => {
    try {
        const userId = req.user ? req.user.id : req.params.empCode;
        if (!userId) {
            return res.status(400).json({ success: false, message: "Employee identification is required" });
        }

        const finalEmpCode = await resolveFinalEmpCode(userId);
        const shiftTiming = await ShiftModel.getActiveTimingForEmployee(finalEmpCode);
        const employee = await ShiftModel.getEmployeeSummary(finalEmpCode);

        return res.json({
            success: true,
            empCode: finalEmpCode,
            employee,
            shift: buildShiftStatusPayload(shiftTiming),
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

const getCurrentStatus = async (req, res) => {
    try {
        let { empCode } = req.params;
        
        // Priority: If authenticated, use the ID from the token
        let userId = req.user ? req.user.id : empCode;

        if (!userId) {
            return res.status(400).json({ success: false, message: "User identification is required" });
        }

        let finalEmpCode = userId;
        try {
            finalEmpCode = await resolveFinalEmpCode(userId);
        } catch (err) {
            console.error("Error resolving EmpCode for status:", err);
        }

        const lastPunch = await Attendance.getLastPunchToday(finalEmpCode);
        const shiftTiming = await ShiftModel.getActiveTimingForEmployee(finalEmpCode);
        const nextPunch =
            !lastPunch || lastPunch.Punch === "Check OUT" ? "Check IN" : "Check OUT";
        const shiftCheck = validatePunchAgainstShift(shiftTiming, nextPunch);

        res.json({
            success: true,
            status: lastPunch ? lastPunch.Punch : "Not Checked In",
            lastPunchTime: lastPunch ? lastPunch.PunchDatetime : null,
            lastAddress: lastPunch ? lastPunch.Address : null,
            empCode: finalEmpCode,
            nextSuggestedPunch: nextPunch,
            shift: buildShiftStatusPayload(shiftTiming, shiftCheck),
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { 
    markAttendance,
    markGeofenceAttendance,
    punch_in,
    startBreak,
    resumeWork,
    checkout,
    getRecentAttendance, 
    getAttendanceByEmpCode,
    getAttendanceConfig,
    getCurrentStatus,
    getShiftSchedule,
};
