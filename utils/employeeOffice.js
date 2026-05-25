const { query } = require("../config/db");
const {
  getFixedOfficeByLocationId,
  getDefaultRadiusMeters,
} = require("../config/officeGeofences");
const { calculateDistance } = require("./locationUtils");

const getDefaultAttendanceRadius = () => getDefaultRadiusMeters();

const formatOfficeForMobile = (office) =>
  office
    ? {
        locationId: office.locationId,
        name: office.name,
        latitude: office.latitude,
        longitude: office.longitude,
        radius: office.radius,
        address: office.address,
      }
    : null;

/** Employee API — office name/id only; no coordinates sent to mobile. */
const formatOfficeForEmployee = (office) =>
  office
    ? {
        locationId: office.locationId,
        name: office.name,
        radius: office.radius,
      }
    : null;

const fetchAppUserByPk = async (pkUserId) => {
  const result = await query(
    `SELECT "pkUserId", "UserName", "fkEmpId", "fkLocationId", "GeofencePoint", "AttendanceMode"
     FROM "AppUser" WHERE "pkUserId" = $1`,
    [pkUserId]
  );
  return result.rows[0] || null;
};

const fetchAppUserByEmpId = async (fkEmpId) => {
  const result = await query(
    `SELECT "pkUserId", "UserName", "fkEmpId", "fkLocationId", "GeofencePoint", "AttendanceMode"
     FROM "AppUser" WHERE "fkEmpId" = $1 ORDER BY "pkUserId" LIMIT 1`,
    [Number(fkEmpId)]
  );
  return result.rows[0] || null;
};

const getFixedOfficeForAppUser = (appUser) => {
  if (!appUser?.fkLocationId) {
    return { office: null, source: null };
  }

  const office = getFixedOfficeByLocationId(appUser.fkLocationId);
  return {
    office,
    source: office ? "FIXED_CONFIG" : null,
  };
};

const getFixedOfficeForEmpId = async (fkEmpId) => {
  const appUser = await fetchAppUserByEmpId(fkEmpId);
  const { office, source } = getFixedOfficeForAppUser(appUser);
  return { appUser, office, assignmentSource: source };
};

const resolveFkEmpIdFromUserId = async (userId) => {
  if (typeof userId === "string" && userId.startsWith("U")) {
    const appUser = await fetchAppUserByPk(userId);
    return appUser?.fkEmpId ?? null;
  }

  if (Number.isFinite(Number(userId))) {
    return Number(userId);
  }

  const appUser = await fetchAppUserByPk(userId?.toString());
  return appUser?.fkEmpId ?? null;
};

const getAssignedOfficeForUser = async (pkUserId) => {
  const appUser = await fetchAppUserByPk(pkUserId);
  if (!appUser?.fkEmpId) {
    return { appUser, office: null, assignmentSource: null };
  }

  const { office, source } = getFixedOfficeForAppUser(appUser);
  return { appUser, office, assignmentSource: source };
};

const getAssignedOfficeForEmpId = async (fkEmpId) => {
  return getFixedOfficeForEmpId(fkEmpId);
};

const buildLocationResult = async (
  office,
  employeeLatitude,
  employeeLongitude,
  matchingRule,
  getAddress,
  options = {}
) => {
  const distance = calculateDistance(
    parseFloat(employeeLatitude),
    parseFloat(employeeLongitude),
    office.latitude,
    office.longitude
  );

  const withinRadius = distance <= office.allowed_radius;

  if (!options.skipGeofence && !withinRadius) {
    const error = new Error(
      `Out of location range by ${Math.round(distance - office.allowed_radius)} meter(s)`
    );
    error.statusCode = 403;
    error.details = {
      distance: `${distance.toFixed(0)}m`,
      allowed: `${office.allowed_radius}m`,
    };
    throw error;
  }

  return {
    location_type: office.location_type || "OFFICE",
    location_id: office.location_id,
    location_name: office.location_name,
    allowed_radius: office.allowed_radius,
    distance,
    withinRadius,
    geofenceEnforced: !options.skipGeofence,
    matching_rule: matchingRule,
    office: formatOfficeForEmployee(office),
    address: getAddress
      ? await getAddress(employeeLatitude, employeeLongitude)
      : null,
  };
};

const buildCheckoutLocationResult = async (
  employeeLatitude,
  employeeLongitude,
  getAddress,
  office = null
) => {
  const distance =
    office != null
      ? calculateDistance(
          parseFloat(employeeLatitude),
          parseFloat(employeeLongitude),
          office.latitude,
          office.longitude
        )
      : null;

  return {
    location_type: office?.location_type || "ANYWHERE",
    location_id: office?.location_id ?? null,
    location_name: office?.location_name ?? "Anywhere",
    allowed_radius: office?.allowed_radius ?? null,
    distance,
    withinRadius: null,
    geofenceEnforced: false,
    matching_rule: "CHECKOUT_ANYWHERE",
    office: office ? formatOfficeForEmployee(office) : null,
    address: getAddress
      ? await getAddress(employeeLatitude, employeeLongitude)
      : null,
  };
};

const resolveAttendanceLocationForEmployee = async (
  userId,
  employeeLatitude,
  employeeLongitude,
  getAddress,
  options = {}
) => {
  const fkEmpId = await resolveFkEmpIdFromUserId(userId);

  if (!fkEmpId) {
    const error = new Error("Employee ID not found for attendance geofence");
    error.statusCode = 400;
    error.code = "EMPLOYEE_NOT_FOUND";
    throw error;
  }

  const { office } = await getFixedOfficeForEmpId(fkEmpId);
  let resolvedOffice = office;
  let matchingRule = "FIXED_OFFICE_GEOFENCE";

  if (!resolvedOffice) {
    const { getAllFixedOffices } = require("../config/officeGeofences");
    const offices = getAllFixedOffices();
    let closestOffice = null;
    let minDistance = Infinity;

    for (const off of offices) {
      const distance = calculateDistance(
        parseFloat(employeeLatitude),
        parseFloat(employeeLongitude),
        off.latitude,
        off.longitude
      );
      if (distance <= off.allowed_radius) {
        resolvedOffice = off;
        matchingRule = "DYNAMIC_CLOSEST_OFFICE_GEOFENCE";
        break;
      }
      if (distance < minDistance) {
        minDistance = distance;
        closestOffice = off;
      }
    }

    if (!resolvedOffice && closestOffice) {
      resolvedOffice = closestOffice;
      matchingRule = "DYNAMIC_CLOSEST_OFFICE_GEOFENCE_FALLBACK";
    }
  }

  if (options.skipGeofence) {
    return buildCheckoutLocationResult(
      employeeLatitude,
      employeeLongitude,
      getAddress,
      resolvedOffice
    );
  }

  if (!resolvedOffice) {
    const error = new Error(
      "Office not assigned to employee. Set AppUser.fkLocationId (1=Kamdenu, 2=Texto, 3=Koparkhairne)."
    );
    error.statusCode = 404;
    error.code = "MISSING_OFFICE_ASSIGNMENT";
    throw error;
  }

  return buildLocationResult(
    resolvedOffice,
    employeeLatitude,
    employeeLongitude,
    matchingRule,
    getAddress,
    options
  );
};

const validatePunchAgainstOffice = (office, punchLat, punchLng) => {
  const punchLatNum = Number(punchLat);
  const punchLngNum = Number(punchLng);

  if (!Number.isFinite(punchLatNum) || !Number.isFinite(punchLngNum)) {
    return { ok: false, code: 400, message: "Invalid punch latitude/longitude" };
  }

  if (!office) {
    return {
      ok: false,
      code: 404,
      message:
        "Office not assigned to employee. Set AppUser.fkLocationId (1=Kamdenu, 2=Texto, 3=Koparkhairne).",
    };
  }

  const distance = calculateDistance(
    punchLatNum,
    punchLngNum,
    office.latitude,
    office.longitude
  );
  const allowedRadius = Number(office.allowed_radius);
  const outOfRadiusBy = distance - allowedRadius;

  if (distance <= allowedRadius) {
    return {
      ok: true,
      distance,
      allowedRadius,
      outOfRadiusBy: 0,
      location_name: office.location_name,
      office: formatOfficeForEmployee(office),
    };
  }

  return {
    ok: false,
    code: 403,
    message: `Out of location range by ${Math.round(outOfRadiusBy)} meter(s)`,
    distance,
    allowedRadius,
    outOfRadiusBy,
    office: formatOfficeForEmployee(office),
  };
};

module.exports = {
  formatOfficeForMobile,
  formatOfficeForEmployee,
  getDefaultAttendanceRadius,
  getFixedOfficeForEmpId,
  getAssignedOfficeForUser,
  getAssignedOfficeForEmpId,
  resolveAttendanceLocationForEmployee,
  validatePunchAgainstOffice,
};
