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

const getLiveGpsBufferMeters = () => {
  const n = Number(process.env.GPS_LIVE_DEFAULT_BUFFER_METERS || "50");
  return Number.isFinite(n) && n >= 0 ? n : 50;
};

const computeOfficeStatus = (latitude, longitude, office, options = {}) => {
  if (!office || latitude == null || longitude == null) {
    return {
      distanceFromOfficeMeters: null,
      rawDistanceFromOfficeMeters: null,
      effectiveDistanceFromOfficeMeters: null,
      isInsideOfficeRadius: null,
      officeRadiusMeters: office?.AllowedRadius ?? office?.allowedRadius ?? null,
      geofenceStatus: "unknown",
    };
  }

  const officeLat = Number(office.Latitude ?? office.latitude);
  const officeLng = Number(office.Longitude ?? office.longitude);
  const radius = Number(office.AllowedRadius ?? office.allowedRadius ?? office.allowed_radius ?? 25);

  if (!Number.isFinite(officeLat) || !Number.isFinite(officeLng)) {
    return {
      distanceFromOfficeMeters: null,
      rawDistanceFromOfficeMeters: null,
      effectiveDistanceFromOfficeMeters: null,
      isInsideOfficeRadius: null,
      officeRadiusMeters: Number.isFinite(radius) ? radius : null,
      geofenceStatus: "unknown",
    };
  }

  const rawDistanceFromOfficeMeters = Math.round(
    calculateDistance(latitude, longitude, officeLat, officeLng)
  );

  const accuracyMeters =
    options.accuracyMeters != null && Number.isFinite(Number(options.accuracyMeters))
      ? Number(options.accuracyMeters)
      : null;

  const accuracyBufferMeters =
    options.accuracyBufferMeters != null && Number.isFinite(Number(options.accuracyBufferMeters))
      ? Number(options.accuracyBufferMeters)
      : accuracyMeters != null
        ? accuracyMeters
        : options.applyLiveGpsBuffer
          ? getLiveGpsBufferMeters()
          : 0;

  const effectiveDistanceFromOfficeMeters = Math.max(
    0,
    rawDistanceFromOfficeMeters - Math.round(accuracyBufferMeters)
  );
  const isInsideOfficeRadius = effectiveDistanceFromOfficeMeters <= radius;

  return {
    distanceFromOfficeMeters: effectiveDistanceFromOfficeMeters,
    rawDistanceFromOfficeMeters,
    effectiveDistanceFromOfficeMeters,
    accuracyBufferMeters: Math.round(accuracyBufferMeters),
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
  getLiveGpsBufferMeters,
};
