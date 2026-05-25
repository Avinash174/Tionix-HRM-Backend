const liveLocationService = require("../services/liveLocationService");

const pickBody = (body, ...keys) => {
  for (const key of keys) {
    if (body[key] != null && body[key] !== "") return body[key];
  }
  return null;
};

const coerceCoordinate = (value) => {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const parseLiveLocationPayload = (body = {}) => ({
  latitude: coerceCoordinate(
    pickBody(body, "latitude", "lat", "Latitude", "LAT", "employee_latitude")
  ),
  longitude: coerceCoordinate(
    pickBody(body, "longitude", "lng", "lon", "Longitude", "LNG", "employee_longitude")
  ),
  accuracy: pickBody(body, "accuracy", "Accuracy"),
  heading: pickBody(body, "heading", "Heading"),
  speed: pickBody(body, "speed", "Speed"),
  address: pickBody(body, "address", "Address"),
  device_info: pickBody(body, "device_info", "deviceInfo", "DeviceInfo"),
  is_mock: pickBody(body, "is_mock", "isMock"),
  mock_location: pickBody(body, "mock_location", "mockLocation"),
  provider: pickBody(body, "provider", "locationProvider", "LocationProvider"),
});

const postLiveLocation = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const payload = parseLiveLocationPayload(req.body);

    if (payload.latitude == null || payload.longitude == null) {
      return res.status(400).json({
        success: false,
        message:
          "Valid latitude and longitude are required. Send form-data fields: latitude, longitude (numbers only).",
        received: {
          latitude: req.body.latitude ?? req.body.lat ?? null,
          longitude: req.body.longitude ?? req.body.lng ?? req.body.lon ?? null,
        },
      });
    }

    const point = await liveLocationService.recordLocation(userId, payload);

    return res.status(201).json({
      success: true,
      message: "Location recorded",
      location: point,
      tracking: liveLocationService.getTrackingConfig(),
      geofence: {
        officeSource: point.officeSource,
        officeLatitude: point.officeLatitude,
        officeLongitude: point.officeLongitude,
        employeeLatitude: point.latitude,
        employeeLongitude: point.longitude,
        distanceMeters: point.distanceFromOfficeMeters,
        allowedRadiusMeters: point.allowedRadiusMeters,
        isInsideRadius: point.isInsideOfficeRadius,
        trackingValid: point.trackingValid,
        attendanceStatus: point.attendanceStatus,
        geofenceStatus: point.geofenceStatus,
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Failed to record location",
    });
  }
};

const getMyLatestLocation = async (req, res) => {
  try {
    const liveLocationModel = require("../models/liveLocationModel");
    const { resolveFinalEmpCode } = require("../utils/resolveEmpCode");
    const resolved = await resolveFinalEmpCode(req.user?.id);
    const latest = await liveLocationModel.getLatestByEmployee(resolved.empCode);

    if (!latest) {
      return res.json({ success: true, location: null });
    }

    return res.json({
      success: true,
      location: {
        empCode: latest.emp_code,
        latitude: Number(latest.latitude),
        longitude: Number(latest.longitude),
        recordedAt: latest.recorded_at,
        address: latest.address,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getLiveLocationConfig = async (_req, res) => {
  return res.json({
    success: true,
    tracking: liveLocationService.getTrackingConfig(),
  });
};

module.exports = {
  postLiveLocation,
  getMyLatestLocation,
  getLiveLocationConfig,
};
