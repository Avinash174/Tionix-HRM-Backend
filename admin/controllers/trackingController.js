const trackingService = require("../services/trackingService");

const getLiveTracking = async (req, res, next) => {
  try {
    const result = await trackingService.getLiveTracking(req.query);
    const liveLocationService = require("../../services/liveLocationService");

    return res.json({
      success: true,
      employees: result.employees || result,
      geofences: result.geofences || [],
      office: result.office || null,
      summary: result.summary || null,
      hint: result.hint || null,
      tracking: liveLocationService.getTrackingConfig(),
    });
  } catch (err) {
    return next(err);
  }
};

const getTrackingAnalytics = async (req, res, next) => {
  try {
    const result = await trackingService.getTrackingAnalytics(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
};

const getRoutePlayback = async (req, res, next) => {
  try {
    const result = await trackingService.getRoutePlayback(
      req.params.employeeId,
      req.query
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
};

const getTrackingHistory = async (req, res, next) => {
  try {
    const result = await trackingService.getTrackingHistory(
      req.params.employeeId,
      req.query
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
};

const getLiveTrail = async (req, res, next) => {
  try {
    const result = await trackingService.getLiveTrail(req.params.employeeId, req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
};

const getEmployeeLiveSnapshot = async (req, res, next) => {
  try {
    const result = await trackingService.getEmployeeLiveSnapshot(req.params.employeeId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getLiveTracking,
  getTrackingAnalytics,
  getRoutePlayback,
  getTrackingHistory,
  getLiveTrail,
  getEmployeeLiveSnapshot,
};
