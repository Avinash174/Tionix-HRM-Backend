const express = require("express");
const authController = require("../controllers/authController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.post("/login", authController.login);
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", adminAuth, authController.logout);
router.post("/logout-all", adminAuth, authController.logoutAll);
router.get("/sessions", adminAuth, authController.sessions);
router.get("/me", adminAuth, authController.me);

module.exports = router;
