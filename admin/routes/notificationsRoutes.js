const express = require("express");
const notificationsController = require("../controllers/notificationsController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/", adminAuth, notificationsController.listNotifications);
router.post("/send", adminAuth, notificationsController.sendNotification);

module.exports = router;
