/**
 * Normalize mobile GPS readings — fix swapped lat/lng, validate range, smooth noisy points.
 */

const roundCoord = (value) => Math.round(Number(value) * 1e7) / 1e7;

const parseCoordinateValue = (value) => {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().replace(/,/g, ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const parseAccuracyMeters = (value) => {
  const num = parseCoordinateValue(value);
  if (num == null || num < 0) return null;
  return num;
};

const isValidLatLng = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

const isIndiaLat = (v) => v >= 6 && v <= 37;
const isIndiaLng = (v) => v >= 68 && v <= 97;

/** Auto-fix common mobile bug: latitude and longitude swapped. */
const fixSwappedCoordinates = (lat, lng) => {
  const corrections = [];

  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    corrections.push("SWAPPED_LAT_LNG");
    return { latitude: lng, longitude: lat, corrections };
  }

  if (isIndiaLng(lat) && isIndiaLat(lng) && !(isIndiaLat(lat) && isIndiaLng(lng))) {
    corrections.push("SWAPPED_LAT_LNG_INDIA");
    return { latitude: lng, longitude: lat, corrections };
  }

  return { latitude: lat, longitude: lng, corrections };
};

const getMaxAcceptableAccuracy = () => {
  const n = Number(process.env.GPS_MAX_ACCEPTABLE_ACCURACY_METERS || "100");
  return Number.isFinite(n) && n > 0 ? n : 100;
};

const getRejectAccuracy = () => {
  const n = Number(process.env.GPS_REJECT_ACCURACY_METERS || "200");
  return Number.isFinite(n) && n > 0 ? n : 200;
};

const getGoodAccuracy = () => {
  const n = Number(process.env.GPS_GOOD_ACCURACY_METERS || "25");
  return Number.isFinite(n) && n > 0 ? n : 25;
};

/**
 * Blend with previous point when accuracy is moderate (reduces map jitter).
 */
const smoothWithPrevious = (latitude, longitude, accuracyMeters, previousPoint) => {
  if (!previousPoint) {
    return { latitude, longitude, smoothed: false };
  }

  const prevLat = Number(previousPoint.latitude);
  const prevLng = Number(previousPoint.longitude);
  if (!Number.isFinite(prevLat) || !Number.isFinite(prevLng)) {
    return { latitude, longitude, smoothed: false };
  }

  const good = getGoodAccuracy();
  const acc = accuracyMeters ?? 999;

  if (acc <= good) {
    return { latitude, longitude, smoothed: false };
  }

  const maxAcc = getMaxAcceptableAccuracy();
  let alpha = 0.7;
  if (acc > good && acc <= maxAcc) alpha = 0.55;
  else if (acc > maxAcc) alpha = 0.3;

  return {
    latitude: roundCoord(prevLat * (1 - alpha) + latitude * alpha),
    longitude: roundCoord(prevLng * (1 - alpha) + longitude * alpha),
    smoothed: true,
  };
};

/**
 * @returns {{
 *   latitude: number,
 *   longitude: number,
 *   accuracyMeters: number|null,
 *   corrections: string[],
 *   smoothed: boolean,
 *   rejected: boolean,
 *   rejectReason?: string,
 *   rejectCode?: string
 * }}
 */
const normalizeGpsReading = (
  { latitude, longitude, accuracy },
  previousPoint = null,
  options = {}
) => {
  const { allowLowAccuracy = false } = options;
  let lat = parseCoordinateValue(latitude);
  let lng = parseCoordinateValue(longitude);
  const accuracyMeters = parseAccuracyMeters(accuracy);
  const corrections = [];

  if (lat == null || lng == null) {
    return {
      latitude: null,
      longitude: null,
      accuracyMeters,
      corrections,
      smoothed: false,
      rejected: true,
      rejectReason: "Valid latitude and longitude are required",
      rejectCode: "INVALID_COORDINATES",
    };
  }

  const fixed = fixSwappedCoordinates(lat, lng);
  lat = fixed.latitude;
  lng = fixed.longitude;
  corrections.push(...fixed.corrections);

  if (!isValidLatLng(lat, lng)) {
    return {
      latitude: lat,
      longitude: lng,
      accuracyMeters,
      corrections,
      smoothed: false,
      rejected: true,
      rejectReason: "GPS coordinates are out of valid range",
      rejectCode: "INVALID_COORDINATES",
    };
  }

  if (
    !allowLowAccuracy &&
    accuracyMeters != null &&
    accuracyMeters > getRejectAccuracy()
  ) {
    return {
      latitude: roundCoord(lat),
      longitude: roundCoord(lng),
      accuracyMeters,
      corrections,
      smoothed: false,
      rejected: true,
      rejectReason: `GPS accuracy too low (${Math.round(accuracyMeters)}m). Wait for GPS lock — need under ${getRejectAccuracy()}m.`,
      rejectCode: "GPS_ACCURACY_TOO_LOW",
    };
  }

  lat = roundCoord(lat);
  lng = roundCoord(lng);

  const smoothed = smoothWithPrevious(lat, lng, accuracyMeters, previousPoint);
  if (smoothed.smoothed) corrections.push("SMOOTHED_WITH_PREVIOUS");

  return {
    latitude: smoothed.latitude,
    longitude: smoothed.longitude,
    accuracyMeters,
    corrections,
    smoothed: smoothed.smoothed,
    rejected: false,
  };
};

const getGpsAccuracyConfig = () => ({
  goodAccuracyMeters: getGoodAccuracy(),
  maxAcceptableAccuracyMeters: getMaxAcceptableAccuracy(),
  rejectAboveAccuracyMeters: getRejectAccuracy(),
  requireAccuracy: process.env.GPS_REQUIRE_ACCURACY !== "false",
});

module.exports = {
  parseCoordinateValue,
  parseAccuracyMeters,
  normalizeGpsReading,
  fixSwappedCoordinates,
  getGpsAccuracyConfig,
  getGoodAccuracy,
  getMaxAcceptableAccuracy,
  getRejectAccuracy,
};
