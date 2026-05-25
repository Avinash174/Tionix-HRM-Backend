const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { uploadProfileImage } = require("../middleware/uploadProfile");
const {
  getProfile,
  updateProfile,
  updateProfileImage,
  getProfileByEmpId,
  updateProfileByEmpId,
  getMySalaryStructure,
} = require("../controllers/profileController");

const uploadImageMiddleware = (req, res, next) => {
  uploadProfileImage.single("profileImage")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Upload failed" });
    }
    next();
  });
};

router.get("/", authMiddleware, getProfile);
router.get("/salary-structure", authMiddleware, getMySalaryStructure);
router.put("/", authMiddleware, updateProfile);
router.put("/image", authMiddleware, uploadImageMiddleware, updateProfileImage);
router.get("/emp/:empId", authMiddleware, getProfileByEmpId);
router.put("/emp/:empId", authMiddleware, updateProfileByEmpId);

module.exports = router;
