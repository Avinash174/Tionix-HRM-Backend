const getDefaultRadiusMeters = () => {
  const configured = Number(
    process.env.ATTENDANCE_RADIUS_METERS ||
      process.env.GEFENCE_RADIUS ||
      process.env.DEFAULT_OFFICE_RADIUS_METERS
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 25;
};

/**
 * Fixed office geofence coordinates (server-side only).
 * Employee mobile sends GPS; backend compares against these constants.
 *
 * locationId mapping (AppUser.fkLocationId):
 *   1 = Kamdenu
 *   2 = Texto
 *   3 = Koparkhairne
 */
const OFFICE_GEOFENCES = Object.freeze({
  1: {
    locationId: 1,
    key: "KAMDENU",
    name: "Kamdenu Office",
    latitude: 19.096388750705227,
    longitude: 73.01687580932347,
  },
  2: {
    locationId: 2,
    key: "TEXTO",
    name: "Texto Office",
    latitude: 19.111448929845803,
    longitude: 73.0154910366839,
  },
  3: {
    locationId: 3,
    key: "KOPARKHAIRNE",
    name: "Koparkhairne Office",
    latitude: 19.102727966839172,
    longitude: 73.00876110747178,
  },
});

const getFixedOfficeByLocationId = (locationId) => {
  const entry = OFFICE_GEOFENCES[Number(locationId)];
  if (!entry) return null;

  const radius = getDefaultRadiusMeters();
  return {
    locationId: entry.locationId,
    location_id: entry.locationId,
    key: entry.key,
    name: entry.name,
    location_name: entry.name,
    latitude: entry.latitude,
    longitude: entry.longitude,
    radius,
    allowed_radius: radius,
    address: null,
    location_type: "FIXED_GEOFENCE",
    source: "FIXED_CONFIG",
  };
};

const getAllFixedOffices = () =>
  Object.values(OFFICE_GEOFENCES).map((entry) => getFixedOfficeByLocationId(entry.locationId));

const getFixedOfficeListForAdmin = () =>
  getAllFixedOffices().map((office) => ({
    officeId: office.locationId,
    LocationID: office.locationId,
    officeName: office.name,
    name: office.name,
    latitude: office.latitude,
    longitude: office.longitude,
    allowedRadius: office.radius,
    radiusMeters: office.radius,
    address: null,
    officeType: "OFFICE",
    source: "FIXED_CONFIG",
  }));

module.exports = {
  OFFICE_GEOFENCES,
  getDefaultRadiusMeters,
  getFixedOfficeByLocationId,
  getAllFixedOffices,
  getFixedOfficeListForAdmin,
};
