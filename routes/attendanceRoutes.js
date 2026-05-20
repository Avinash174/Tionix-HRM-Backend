const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  markAttendance,
  markGeofenceAttendance,
  checkout,
  getAttendanceByEmpCode,
  getAttendanceConfig,
  getRecentAttendance,
  getCurrentStatus,
  getShiftSchedule,
} = require("../controllers/attendanceController");
const {
  postLiveLocation,
  getMyLatestLocation,
  getLiveLocationConfig,
} = require("../controllers/liveLocationController");

const upload = require("../middleware/uploadMiddleware");

router.post("/punch", authMiddleware, upload.none(), markAttendance);
router.post("/geofence", authMiddleware, upload.none(), markGeofenceAttendance);
router.post("/checkout", authMiddleware, upload.none(), checkout);
router.get("/employee/:empCode", authMiddleware, getAttendanceByEmpCode);
router.get("/config", authMiddleware, getAttendanceConfig);
router.get("/status/:empCode", authMiddleware, getCurrentStatus);
router.get("/shift", authMiddleware, getShiftSchedule);
router.get("/shift/:empCode", authMiddleware, getShiftSchedule);
router.get("/live-location/config", authMiddleware, getLiveLocationConfig);
router.post("/live-location", authMiddleware, upload.none(), postLiveLocation);
router.get("/live-location", authMiddleware, getMyLatestLocation);

// Keep existing if needed, but the mobile app seems to use the above
const {
  punchIn,
  punchOut,
  getAttendanceHistory,
} = require("../controllers/gpsAttendanceController");

router.post("/punch-in", authMiddleware, upload.none(), markAttendance);
router.post("/punch-out", authMiddleware, upload.none(), checkout);
router.get("/history", authMiddleware, getRecentAttendance);

module.exports = router;
