const express = require("express");
const trackingController = require("../controllers/trackingController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/live", adminAuth, trackingController.getLiveTracking);
router.get("/analytics", adminAuth, trackingController.getTrackingAnalytics);
router.get("/playback/:employeeId", adminAuth, trackingController.getRoutePlayback);
router.get("/live/:employeeId", adminAuth, trackingController.getEmployeeLiveSnapshot);
router.get("/trail/:employeeId", adminAuth, trackingController.getLiveTrail);
router.get("/history/:employeeId", adminAuth, trackingController.getTrackingHistory);

module.exports = router;
