const dashboardService = require("../services/dashboardService");

const getStats = async (req, res, next) => {
  try {
    const stats = await dashboardService.getTotals(req.query.date);
    return res.json({ success: true, stats });
  } catch (err) {
    return next(err);
  }
};

const getAnalytics = async (req, res, next) => {
  try {
    const analytics = await dashboardService.getAnalytics(req.query.date);
    return res.json({ success: true, analytics });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getStats,
  getAnalytics,
};
