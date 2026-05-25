const express = require("express");
const officesController = require("../controllers/officesController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/", adminAuth, officesController.listOffices);
router.get("/:id", adminAuth, officesController.getOffice);
router.post("/", adminAuth, officesController.createOffice);
router.put("/:id", adminAuth, officesController.updateOffice);
router.delete("/:id", adminAuth, officesController.deleteOffice);

module.exports = router;
