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
      const address = res[0].formattedAddress || res[0].streetName + ', ' + res[0].city + ', ' + res[0].state + ', ' + res[0].zipcode + ', ' + res[0].country;
      return address;
    }
    return 'Address not found';
  } catch (error) {
    console.error("Error getting address from coordinates:", error);
    return 'Error resolving address';
  }
};

const DEFAULT_OFFICE_RADIUS_METERS = 1000;

const parseCoordinate = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    const error = new Error(`${label} is required and must be a valid number`);
    error.statusCode = 400;
    error.code = "INVALID_COORDINATES";
    throw error;
  }
  return parsed;
};

const getOfficeCoordinates = () => ({
  latitude: parseCoordinate(process.env.OFFICE_LAT || "19.102532", "Office latitude"),
  longitude: parseCoordinate(process.env.OFFICE_LON || "73.008868", "Office longitude"),
});

const getAllowedRadiusMeters = () => {
  const configuredRadius = Number(process.env.ATTENDANCE_RADIUS_METERS);
  if (Number.isFinite(configuredRadius) && configuredRadius > 0) {
    return configuredRadius;
  }
  return DEFAULT_OFFICE_RADIUS_METERS;
};

const calculateDistanceMeters = (employeeLatitude, employeeLongitude, officeCoordinates) =>
  getDistance(
    { latitude: employeeLatitude, longitude: employeeLongitude },
    { latitude: officeCoordinates.latitude, longitude: officeCoordinates.longitude }
  );

const evaluateGpsAttendance = async (latitude, longitude) => {
  const employeeLatitude = parseCoordinate(latitude, "Latitude");
  const employeeLongitude = parseCoordinate(longitude, "Longitude");
  const office = getOfficeCoordinates();
  const allowedRadiusMeters = getAllowedRadiusMeters();
  const distanceMeters = calculateDistanceMeters(employeeLatitude, employeeLongitude, office);
  const isWithinRange = distanceMeters <= allowedRadiusMeters;
  const employeeAddress = await getAddressesFromCoordinates(employeeLatitude, employeeLongitude);

  return {
    employeeLatitude,
    employeeLongitude,
    employeeAddress,
    officeLatitude: office.latitude,
    officeLongitude: office.longitude,
    distanceMeters,
    allowedRadiusMeters,
    attendanceStatus: isWithinRange ? "approved" : "rejected",
    isWithinRange,
  };
};

module.exports = {
  DEFAULT_OFFICE_RADIUS_METERS,
  evaluateGpsAttendance,
  getAllowedRadiusMeters,
  getOfficeCoordinates,
};
