const express = require("express");
const router = express.Router();
const { login, refreshToken, logout } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/login", login);
router.post("/refresh-token", refreshToken);
router.post("/logout", authMiddleware, logout);

module.exports = router;
