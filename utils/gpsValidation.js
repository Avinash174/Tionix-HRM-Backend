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

const getOfficeCoordinates = () => {
  if (!process.env.OFFICE_LAT || !process.env.OFFICE_LON) {
    const error = new Error(
      "OFFICE_LAT and OFFICE_LON environment variables are required. Please configure real office coordinates."
    );
    error.statusCode = 500;
    error.code = "MISSING_OFFICE_COORDINATES";
    throw error;
  }
  return {
    latitude: parseCoordinate(process.env.OFFICE_LAT, "Office latitude"),
    longitude: parseCoordinate(process.env.OFFICE_LON, "Office longitude"),
  };
};

const getAllowedRadiusMeters = () => {
  const configuredRadius = Number(
    process.env.ATTENDANCE_RADIUS_METERS || process.env.GEFENCE_RADIUS
  );
  if (Number.isFinite(configuredRadius) && configuredRadius > 0) {
    return configuredRadius;
  }
  const error = new Error(
    "ATTENDANCE_RADIUS_METERS or GEFENCE_RADIUS environment variable is required."
  );
  error.statusCode = 500;
  error.code = "MISSING_RADIUS_CONFIG";
  throw error;
};

const calculateDistanceMeters = (employeeLatitude, employeeLongitude, officeCoordinates) =>
  getDistance(
    { latitude: employeeLatitude, longitude: employeeLongitude },
    { latitude: officeCoordinates.latitude, longitude: officeCoordinates.longitude }
  );

const evaluateGpsAttendance = async (latitude, longitude, allowedRadiusMeters = null) => {
  const employeeLatitude = parseCoordinate(latitude, "Latitude");
  const employeeLongitude = parseCoordinate(longitude, "Longitude");
  const office = getOfficeCoordinates();
  const radiusMeters =
    allowedRadiusMeters != null && Number.isFinite(Number(allowedRadiusMeters))
      ? Number(allowedRadiusMeters)
      : getAllowedRadiusMeters();
  const distanceMeters = calculateDistanceMeters(employeeLatitude, employeeLongitude, office);
  const isWithinRange = distanceMeters <= radiusMeters;
  const employeeAddress = await getAddressesFromCoordinates(employeeLatitude, employeeLongitude);

  return {
    employeeLatitude,
    employeeLongitude,
    employeeAddress,
    officeLatitude: office.latitude,
    officeLongitude: office.longitude,
    distanceMeters,
    allowedRadiusMeters: radiusMeters,
    attendanceStatus: isWithinRange ? "approved" : "rejected",
    isWithinRange,
  };
};

module.exports = {
  evaluateGpsAttendance,
  getAllowedRadiusMeters,
  getOfficeCoordinates,
};
