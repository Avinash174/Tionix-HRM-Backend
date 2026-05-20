const express = require("express");
const employeesController = require("../controllers/employeesController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/", adminAuth, employeesController.listEmployees);
router.get("/:id", adminAuth, employeesController.getEmployee);
router.put("/:id", adminAuth, employeesController.updateEmployee);
router.delete("/:id", adminAuth, employeesController.deleteEmployee);

module.exports = router;
