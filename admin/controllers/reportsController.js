const reportsService = require("../services/reportsService");

const getAttendanceReport = async (req, res, next) => {
  try {
    const report = await reportsService.getAttendanceReport(req.query);
    return res.json({ success: true, report });
  } catch (err) {
    return next(err);
  }
};

const getProductivityReport = async (req, res, next) => {
  try {
    const report = await reportsService.getProductivityReport(req.query);
    return res.json({ success: true, report });
  } catch (err) {
    return next(err);
  }
};

const getOfficeReport = async (req, res, next) => {
  try {
    const report = await reportsService.getOfficeReport();
    return res.json({ success: true, report });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getAttendanceReport,
  getProductivityReport,
  getOfficeReport,
};
