const path = require("path");
const fs = require("fs/promises");
const User = require("../models/userModel");

const toPublicProfile = (row) => {
  if (!row) return null;
  return {
    pkUserId: row.pkUserId,
    userName: row.UserName,
    fkEmpId: row.fkEmpId,
    email: row.Email ?? null,
    phone: row.Phone ?? null,
    profileImageUrl: row.ProfileImage ?? null,
  };
};

const getProfile = async (req, res) => {
  try {
    const profile = await User.findByPkUserId(req.user.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, profile: toPublicProfile(profile) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const updated = await User.updateProfile(req.user.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({
      success: true,
      message: "Profile updated",
      profile: toPublicProfile(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateProfileByEmpId = async (req, res) => {
  try {
    const { empId } = req.params;
    const updated = await User.updateProfileByEmpId(empId, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({
      success: true,
      message: "Profile updated successfully",
      profile: toPublicProfile(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image file is required (multipart field name: profileImage)",
      });
    }

    const before = await User.findByPkUserId(req.user.id);
    if (!before) {
      const bad = path.join(__dirname, "..", "uploads", "profile", req.file.filename);
      await fs.unlink(bad).catch(() => {});
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const publicPath = `/uploads/profile/${req.file.filename}`;

    if (before.ProfileImage && before.ProfileImage.startsWith("/uploads/profile/")) {
      const rel = before.ProfileImage.replace(/^\//, "");
      const oldPath = path.join(__dirname, "..", rel);
      await fs.unlink(oldPath).catch(() => {});
    }

    const updated = await User.updateProfileImage(req.user.id, publicPath);
    res.json({
      success: true,
      message: "Profile image updated",
      profile: toPublicProfile(updated),
    });
  } catch (err) {
    if (req.file) {
      const bad = path.join(__dirname, "..", "uploads", "profile", req.file.filename);
      await fs.unlink(bad).catch(() => {});
    }
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getProfileByEmpId = async (req, res) => {
  try {
    const { empId } = req.params; // Get empId from URL parameters
    const profile = await User.findByEmpId(empId);
    if (!profile) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, profile: toPublicProfile(profile) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateProfileImage,
  getProfileByEmpId,
  updateProfileByEmpId,
};
