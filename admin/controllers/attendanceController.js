const attendanceService = require("../services/attendanceService");

const listAttendance = async (req, res, next) => {
  try {
    const result = await attendanceService.listAttendance(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const history = await attendanceService.getHistory(req.query);
    return res.json({ success: true, history });
  } catch (err) {
    return next(err);
  }
};

const getReports = async (req, res, next) => {
  try {
    const reports = await attendanceService.getReports(req.query);
    return res.json({ success: true, reports });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listAttendance,
  getHistory,
  getReports,
};
