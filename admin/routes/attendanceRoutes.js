const express = require("express");
const attendanceController = require("../controllers/attendanceController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/", adminAuth, attendanceController.listAttendance);
router.get("/history", adminAuth, attendanceController.getHistory);
router.get("/reports", adminAuth, attendanceController.getReports);

module.exports = router;
