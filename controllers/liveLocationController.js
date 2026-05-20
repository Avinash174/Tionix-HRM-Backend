const liveLocationService = require("../services/liveLocationService");

const postLiveLocation = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const point = await liveLocationService.recordLocation(userId, req.body);

    const liveLocationService = require("../services/liveLocationService");
    return res.status(201).json({
      success: true,
      message: "Location recorded",
      location: point,
      tracking: liveLocationService.getTrackingConfig(),
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
  const liveLocationService = require("../services/liveLocationService");
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
