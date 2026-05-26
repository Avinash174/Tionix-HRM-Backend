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
const liveLocationModel = require("../models/liveLocationModel");
const liveLocationService = require("../services/liveLocationService");
const {
  validatePunchAgainstShift,
  buildShiftStatusPayload,
} = require("../utils/shiftValidation");
const { emitEvent } = require("../sockets");
const marketingService = require("../services/marketingService");
const { MarketingApiError } = require("../utils/marketingAttendance");
const { errorResponse } = require("../utils/apiError");
const {
  formatOfficeForEmployee,
  getAssignedOfficeForUser,
  getAssignedOfficeForEmpId,
  resolveAttendanceLocationForEmployee,
  validatePunchAgainstOffice,
} = require("../utils/employeeOffice");
const { resolveFinalEmpCode: resolveEmployeeIdentity, normalizeEmpCode } = require("../utils/resolveEmpCode");
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

  let { office } = await getAssignedOfficeForEmpId(employee.fkEmpId);
  if (!office) {
    const { getAllFixedOffices } = require("../config/officeGeofences");
    const { calculateDistance } = require("../utils/locationUtils");
    const offices = getAllFixedOffices();
    let closestOffice = null;
    let minDistance = Infinity;

    for (const off of offices) {
      const distance = calculateDistance(
        parseFloat(punchLat),
        parseFloat(punchLng),
        off.latitude,
        off.longitude
      );
      if (distance <= off.allowed_radius) {
        office = off;
        break;
      }
      if (distance < minDistance) {
        minDistance = distance;
        closestOffice = off;
      }
    }

    if (!office && closestOffice) {
      office = closestOffice;
    }
  }

  if (!office) {
    return {
      ok: false,
      code: 404,
      message:
        "Office not assigned to employee. Set AppUser.fkLocationId (1=Kamdenu, 2=Texto, 3=Koparkhairne).",
    };
  }

  return validatePunchAgainstOffice(office, punchLat, punchLng);
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

const resolveAttendanceLocation = async (
  userId,
  employeeLatitude,
  employeeLongitude,
  options = {}
) =>
  resolveAttendanceLocationForEmployee(
    userId,
    employeeLatitude,
    employeeLongitude,
    getAddressesFromCoordinates,
    options
  );

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
    let empName = req.user ? req.user.username : "Employee";
    const finalStatus = status || Status || punch;

    if (req.user?.role === "admin") {
        return res.status(403).json({
            success: false,
            message: "This API is for employees only. Login with an employee account (e.g. Banti), not ADMIN.",
            code: "EMPLOYEE_NOT_FOUND",
            hint: "Use POST /api/login with employee username/password, then punch in.",
        });
    }

    // Resolve UserId to EmpCode
    if (userId) {
        try {
            const resolved = await resolveEmployeeIdentity(userId);
            finalEmpCode = resolved?.empCode ?? null;
            if (resolved?.empName) empName = resolved.empName;
        } catch (err) {
            console.error("Error resolving EmpCode:", err);
        }
    }

    const bodyEmpCode = normalizeEmpCode(empCode || EmpCode);
    if ((!finalEmpCode || !Number.isFinite(Number(finalEmpCode))) && bodyEmpCode) {
        finalEmpCode = bodyEmpCode;
    }

    if (!finalEmpCode || !Number.isFinite(Number(finalEmpCode))) {
        return res.status(403).json({
            success: false,
            message: "Employee ID not found for attendance geofence",
            error: "Employee ID not found for attendance geofence",
            code: "EMPLOYEE_NOT_FOUND",
            hint: "Login with an employee account linked to SalEmployee (fkEmpId). ADMIN accounts cannot punch in.",
            userId: userId || null,
        });
    }

    finalEmpCode = String(finalEmpCode).trim();
    
    // Smart coordinate detection (handles latitude, Latitude, LATITUDE, etc.)
    const getCoord = (obj, keys) => {
        for (const key of keys) {
            const val = obj[key];
            if (val !== undefined && val !== null && val !== "") return val;
        }
        return null;
    };

    const rawLat = getCoord(req.body, ["latitude", "Latitude", "LAT", "lat", "employee_latitude"]);
    const rawLon = getCoord(req.body, ["longitude", "Longitude", "LON", "lon", "employee_longitude"]);

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
        const locationData = await resolveAttendanceLocation(finalEmpCode, numLat, numLon, {
            skipGeofence: finalStatus === "Check OUT",
        });
        
        if (locationData.distance != null) {
            console.log(`GEOFENCE CHECK: Employee ${finalEmpCode} is ${locationData.distance.toFixed(2)}m from ${locationData.location_name}. enforced=${locationData.geofenceEnforced}`);
        } else {
            console.log(`GEOFENCE CHECK: Employee ${finalEmpCode} Check OUT — radius not enforced.`);
        }

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
            ...errorResponse(err, "Attendance request failed"),
            distance: err.details?.distance,
            allowed: err.details?.allowed,
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
            const resolved = await resolveEmployeeIdentity(userId);
            if (resolved && resolved.empCode != null) {
                finalEmpCode = resolved.empCode;
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
                const resolved = await resolveEmployeeIdentity(empCode);
                if (resolved && resolved.empCode != null) {
                    empCode = resolved.empCode;
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
        const { getDefaultAttendanceRadius } = require("../utils/employeeOffice");

        let assignedOffice = null;
        let assignmentSource = null;

        if (req.user?.id) {
            const assignment = await getAssignedOfficeForUser(req.user.id);
            assignedOffice = formatOfficeForEmployee(assignment.office);
            assignmentSource = assignment.assignmentSource;
        }

        res.json({
            success: true,
            config: {
                locationId: assignedOffice?.locationId ?? null,
                officeName: assignedOffice?.name ?? null,
                radius: assignedOffice?.radius ?? getDefaultAttendanceRadius(),
                assignedOffice,
                assignmentSource,
                officeSource: "FIXED_CONFIG",
                geofenceValidation: "server_side",
                note: "Send only employee_latitude and employee_longitude. Office coordinates are fixed on server.",
                liveTracking: liveLocationService.getTrackingConfig(),
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const resolveFinalEmpCode = async (userId) => {
    const resolved = await resolveEmployeeIdentity(userId);
    return resolved?.empCode ?? userId;
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
        const { empCode: paramEmpCode } = req.params;
        const userId = req.user?.id || paramEmpCode;

        if (!userId) {
            return res.status(400).json({ success: false, message: "User identification is required" });
        }

        const resolved = await resolveEmployeeIdentity(userId);
        const finalEmpCode = resolved?.empCode;

        if (!finalEmpCode || !Number.isFinite(Number(finalEmpCode))) {
            return res.status(403).json({
                success: false,
                message: "This API is for employees only. ADMIN account has no employee record.",
                hint: "Login with employee account (e.g. Banti) via POST /api/login, not ADMIN.",
                userId,
                empCode: null,
            });
        }

        const empCodeStr = finalEmpCode.toString();

        const lastPunch = await Attendance.getLastPunchToday(empCodeStr);
        const shiftTiming = await ShiftModel.getActiveTimingForEmployee(finalEmpCode);
        const nextPunch =
            !lastPunch || lastPunch.Punch === "Check OUT" ? "Check IN" : "Check OUT";
        const shiftCheck = validatePunchAgainstShift(shiftTiming, nextPunch);

        const latestLive = await liveLocationModel.getLatestByEmployee(empCodeStr);
        const isOnline = liveLocationService.isLocationOnline(latestLive?.recorded_at);

        const liveLocation = latestLive
            ? {
                latitude: Number(latestLive.latitude),
                longitude: Number(latestLive.longitude),
                address: latestLive.address,
                recordedAt: latestLive.recorded_at,
                accuracyMeters: latestLive.accuracy_meters,
                heading: latestLive.heading,
                speed: latestLive.speed,
                isOnline,
              }
            : null;

        const assignment = await getAssignedOfficeForEmpId(finalEmpCode);
        const office = formatOfficeForEmployee(assignment.office);

        res.json({
            success: true,
            status: lastPunch ? lastPunch.Punch : "Not Checked In",
            lastPunchTime: lastPunch ? lastPunch.PunchDatetime : null,
            lastAddress: lastPunch ? lastPunch.Address : null,
            empCode: empCodeStr,
            empName: resolved.empName || null,
            nextSuggestedPunch: nextPunch,
            shift: buildShiftStatusPayload(shiftTiming, shiftCheck),
            office,
            assignmentSource: assignment.assignmentSource,
            liveLocation,
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
