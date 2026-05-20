const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/stats", adminAuth, dashboardController.getStats);
router.get("/analytics", adminAuth, dashboardController.getAnalytics);

module.exports = router;
