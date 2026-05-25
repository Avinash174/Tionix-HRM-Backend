const { calculateDistance } = require("./locationUtils");

const MAX_SPEED_MS = parseFloat(process.env.MAX_GPS_SPEED_MS || "55"); // ~198 km/h
const MAX_ACCURACY_METERS = parseFloat(process.env.MAX_GPS_ACCURACY_METERS || "150");
const TELEPORT_MIN_DISTANCE_M = parseFloat(process.env.GPS_TELEPORT_MIN_METERS || "500");
const TELEPORT_MAX_SECONDS = parseFloat(process.env.GPS_TELEPORT_MAX_SECONDS || "30");

const analyzeGpsPoint = (payload = {}, previousPoint = null) => {
  const flags = [];
  let riskScore = 0;

  if (payload.is_mock === true || payload.isMock === true || payload.mock_location === true) {
    flags.push("MOCK_LOCATION_FLAG");
    riskScore += 50;
  }

  if (payload.provider === "mock" || payload.locationProvider === "mock") {
    flags.push("MOCK_PROVIDER");
    riskScore += 40;
  }

  const accuracy = payload.accuracy != null ? Number(payload.accuracy) : null;
  if (accuracy != null && accuracy > MAX_ACCURACY_METERS) {
    flags.push("LOW_ACCURACY");
    riskScore += 15;
  }

  const speed = payload.speed != null ? Number(payload.speed) : null;
  if (speed != null && speed > MAX_SPEED_MS) {
    flags.push("IMPOSSIBLE_SPEED");
    riskScore += 35;
  }

  if (previousPoint && payload.latitude != null && payload.longitude != null) {
    const prevLat = Number(previousPoint.latitude);
    const prevLng = Number(previousPoint.longitude);
    const curLat = Number(payload.latitude);
    const curLng = Number(payload.longitude);

    if (
      Number.isFinite(prevLat) &&
      Number.isFinite(prevLng) &&
      Number.isFinite(curLat) &&
      Number.isFinite(curLng)
    ) {
      const prevTime = new Date(previousPoint.recorded_at).getTime();
      const nowTime = Date.now();
      const elapsedSec = Math.max((nowTime - prevTime) / 1000, 1);

      const distance = calculateDistance(prevLat, prevLng, curLat, curLng);

      const impliedSpeed = distance / elapsedSec;
      if (
        distance >= TELEPORT_MIN_DISTANCE_M &&
        elapsedSec <= TELEPORT_MAX_SECONDS
      ) {
        flags.push("TELEPORT_DETECTED");
        riskScore += 45;
      } else if (impliedSpeed > MAX_SPEED_MS) {
        flags.push("IMPOSSIBLE_TRAVEL");
        riskScore += 30;
      }
    }
  }

  const isSuspicious = riskScore >= 30;

  return {
    isSuspicious,
    riskScore: Math.min(riskScore, 100),
    flags,
    status: isSuspicious ? "suspicious" : "trusted",
  };
};

module.exports = {
  analyzeGpsPoint,
};
