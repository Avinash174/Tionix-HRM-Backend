const { getDistance } = require("geolib");
const NodeGeocoder = require('node-geocoder');

const geocoder = NodeGeocoder({
  provider: 'openstreetmap',
  httpAdapter: 'https',
  formatter: null,
  limit: 1,
  timeout: 5000, // milliseconds
});

const getAddressesFromCoordinates = async (latitude, longitude) => {
  try {
    const res = await geocoder.reverse({ lat: latitude, lon: longitude });
    if (res && res.length > 0) {
      // Prioritize common address components, adjust as needed
      const address = res[0].formattedAddress || res[0].streetName + ', ' + res[0].city + ', ' + res[0].state + ', ' + res[0].zipcode + ', ' + res[0].country;
      return address;
    }
    return 'Address not found';
  } catch (error) {
    console.error("Error getting address from coordinates:", error);
    return 'Error resolving address';
  }
};

class MarketingApiError extends Error {
  constructor(message, statusCode = 400, code = "MARKETING_API_ERROR") {
    super(message);
    this.name = "MarketingApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const ensureMarketingUserId = (userId) => {
  if (!userId) {
    throw new MarketingApiError("User account not found. Please login again.", 401, "USER_NOT_FOUND");
  }
};

const normalizeNumber = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new MarketingApiError(`${label} is required`, 400, "INVALID_COORDINATES");
  }
  return parsed;
};

const formatDateForTimezone = (date = new Date()) => {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};

const buildAttendanceDeviceInfo = ({
  incomingDeviceInfo,
  userAgent,
  action,
  locationInfo,
}) => {
  const base =
    incomingDeviceInfo && typeof incomingDeviceInfo === "object"
      ? incomingDeviceInfo
      : {};

  return {
    ...base,
    action,
    user_agent: userAgent || null,
    location: locationInfo
      ? {
          matching_rule: locationInfo.matching_rule,
          location_type: locationInfo.location_type,
          location_id: locationInfo.location_id,
          location_name: locationInfo.location_name,
          allowed_radius: Number(locationInfo.allowed_radius),
          actual_distance_meters: Number(locationInfo.distance),
        }
      : null,
  };
};

const serializeDeviceInfo = (deviceInfo) => JSON.stringify(deviceInfo);

const resolveAttendanceLocation = async (_userId, latitude, longitude) => {
  const officeLat = parseFloat(process.env.OFFICE_LAT || "19.123456");
  const officeLon = parseFloat(process.env.OFFICE_LON || "72.987654");
  const allowedRadius = parseFloat(process.env.GEFENCE_RADIUS || "100");

  const distance = getDistance(
    { latitude, longitude },
    { latitude: officeLat, longitude: officeLon }
  );

  if (distance > allowedRadius) {
    throw new MarketingApiError(
      `Out of range (${distance.toFixed(0)}m). Max allowed: ${allowedRadius}m.`,
      403,
      "OUT_OF_RANGE"
    );
  }

  return {
    matching_rule: "office_geofence",
    location_type: "office",
    location_id: "office",
    location_name: "Office",
    allowed_radius: allowedRadius,
    distance,
    address: await getAddressesFromCoordinates(latitude, longitude),
  };
};

module.exports = {
  MarketingApiError,
  ensureMarketingUserId,
  normalizeNumber,
  formatDateForTimezone,
  resolveAttendanceLocation,
};
