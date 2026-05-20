const path = require("path");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");

const uploadRoot = path.join(__dirname, "..", "uploads", "profile");
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const allowedExt = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = allowedExt.has(ext) ? ext : ".jpg";
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Only image files are allowed"));
  }
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext && !allowedExt.has(ext)) {
    return cb(new Error("Allowed extensions: jpg, png, gif, webp"));
  }
  cb(null, true);
};

const uploadProfileImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = { uploadProfileImage, uploadRoot };
