const { getDistance } = require("geolib");

/**
 * Calculates distance between two points in meters using geolib for high accuracy
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const isInvalid = (val) => val === null || val === undefined || !Number.isFinite(Number(val));
    
    if (isInvalid(lat1) || isInvalid(lon1) || isInvalid(lat2) || isInvalid(lon2)) {
        throw new Error("Invalid latitude or longitude coordinates provided.");
    }

    return getDistance(
        { latitude: parseFloat(lat1), longitude: parseFloat(lon1) },
        { latitude: parseFloat(lat2), longitude: parseFloat(lon2) }
    );
};

/**
 * Resolves the nearest valid attendance location from the database
 * @param {string} userId Employee ID
 * @param {number} empLat Employee Latitude
 * @param {number} empLon Employee Longitude
 * @param {Array} locations Array of location objects from DB
 * @returns {Object} Nearest location details and distance
 */
const resolveAttendanceLocation = (userId, empLat, empLon, locations) => {
    const isInvalid = (val) => val === null || val === undefined || !Number.isFinite(Number(val));
    
    if (isInvalid(empLat) || isInvalid(empLon)) {
        throw new Error("Invalid latitude or longitude received from device.");
    }

    let nearestLocation = null;
    let minDistance = Infinity;

    for (const loc of locations) {
        const distance = calculateDistance(
            parseFloat(empLat), 
            parseFloat(empLon), 
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
        const error = new Error("Outside allowed attendance radius");
        error.details = { distance: distStr, allowed: allowedStr };
        throw error;
    }

    return {
        location_type: nearestLocation.location_type || 'OFFICE',
        location_id: nearestLocation.location_id,
        location_name: nearestLocation.location_name,
        allowed_radius: nearestLocation.allowed_radius,
        distance: nearestLocation.distance,
        matching_rule: "GEOFENCE_STRICT"
    };
};

module.exports = {
    calculateDistance,
    resolveAttendanceLocation
};
