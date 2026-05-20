const express = require("express");
const officesController = require("../controllers/officesController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/", adminAuth, officesController.listOffices);
router.get("/:id", adminAuth, officesController.getOffice);

module.exports = router;
