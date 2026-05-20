const express = require("express");
const hlGeoController = require("../controllers/hlGeoController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/", adminAuth, hlGeoController.list);
router.get("/:pkGeoId", adminAuth, hlGeoController.getById);
router.post("/", adminAuth, hlGeoController.create);
router.put("/:pkGeoId", adminAuth, hlGeoController.update);
router.delete("/:pkGeoId", adminAuth, hlGeoController.remove);

module.exports = router;
