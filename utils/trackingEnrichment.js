const { calculateDistance } = require("./locationUtils");
const ShiftModel = require("../models/shiftModel");
const { validatePunchAgainstShift, buildShiftStatusPayload } = require("./shiftValidation");

const computeLastSeen = (recordedAt) => {
  if (!recordedAt) {
    return { lastSeenAt: null, lastSeenSecondsAgo: null, lastSeenLabel: "Never" };
  }

  const lastSeenAt = new Date(recordedAt);
  const lastSeenSecondsAgo = Math.max(
    0,
    Math.floor((Date.now() - lastSeenAt.getTime()) / 1000)
  );

  let lastSeenLabel = "Just now";
  if (lastSeenSecondsAgo >= 3600) {
    lastSeenLabel = `${Math.floor(lastSeenSecondsAgo / 3600)}h ago`;
  } else if (lastSeenSecondsAgo >= 60) {
    lastSeenLabel = `${Math.floor(lastSeenSecondsAgo / 60)}m ago`;
  } else if (lastSeenSecondsAgo > 5) {
    lastSeenLabel = `${lastSeenSecondsAgo}s ago`;
  }

  return { lastSeenAt, lastSeenSecondsAgo, lastSeenLabel };
};

const computeOfficeStatus = (latitude, longitude, office) => {
  if (!office || latitude == null || longitude == null) {
    return {
      distanceFromOfficeMeters: null,
      isInsideOfficeRadius: null,
      officeRadiusMeters: office?.AllowedRadius ?? office?.allowedRadius ?? null,
      geofenceStatus: "unknown",
    };
  }

  const officeLat = Number(office.Latitude ?? office.latitude);
  const officeLng = Number(office.Longitude ?? office.longitude);
  const radius = Number(office.AllowedRadius ?? office.allowedRadius ?? 25);

  if (!Number.isFinite(officeLat) || !Number.isFinite(officeLng)) {
    return {
      distanceFromOfficeMeters: null,
      isInsideOfficeRadius: null,
      officeRadiusMeters: Number.isFinite(radius) ? radius : null,
      geofenceStatus: "unknown",
    };
  }

  const distanceFromOfficeMeters = Math.round(
    calculateDistance(latitude, longitude, officeLat, officeLng)
  );
  const isInsideOfficeRadius = distanceFromOfficeMeters <= radius;

  return {
    distanceFromOfficeMeters,
    isInsideOfficeRadius,
    officeRadiusMeters: radius,
    geofenceStatus: isInsideOfficeRadius ? "inside" : "outside",
  };
};

const getShiftStatusForEmployee = async (empCode, punchType = "Check IN") => {
  try {
    const timing = await ShiftModel.getActiveTimingForEmployee(empCode);
    if (!timing) return null;
    const validation = validatePunchAgainstShift(timing, punchType);
    return buildShiftStatusPayload(timing, validation);
  } catch {
    return null;
  }
};

module.exports = {
  computeLastSeen,
  computeOfficeStatus,
  getShiftStatusForEmployee,
};
