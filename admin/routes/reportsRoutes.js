const express = require("express");
const reportsController = require("../controllers/reportsController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/attendance", adminAuth, reportsController.getAttendanceReport);
router.get("/productivity", adminAuth, reportsController.getProductivityReport);
router.get("/offices", adminAuth, reportsController.getOfficeReport);

module.exports = router;
