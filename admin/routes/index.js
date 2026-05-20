const express = require("express");
const authRoutes = require("./authRoutes");
const authController = require("../controllers/authController");
const dashboardRoutes = require("./dashboardRoutes");
const employeesRoutes = require("./employeesRoutes");
const attendanceRoutes = require("./attendanceRoutes");
const trackingRoutes = require("./trackingRoutes");
const reportsRoutes = require("./reportsRoutes");
const notificationsRoutes = require("./notificationsRoutes");
const officesRoutes = require("./officesRoutes");
const hlGeoRoutes = require("./hlGeoRoutes");
const adminErrorHandler = require("../middleware/adminError");

const router = express.Router();

// Admin-only auth shortcuts (employees cannot use these)
router.post("/login", authController.login);
router.post("/auth/login", authController.login);
router.post("/refresh-token", authController.refreshToken);
router.use("/auth", authRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/employees", employeesRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/tracking", trackingRoutes);
router.use("/reports", reportsRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/offices", officesRoutes);
router.use("/hl-geolocations", hlGeoRoutes);

router.use(adminErrorHandler);

module.exports = router;
