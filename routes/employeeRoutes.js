const express = require('express');
const router = express.Router();
const { getAllEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee } = require('../controllers/employeeController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/', authMiddleware, getAllEmployees);
router.get('/:id', authMiddleware, getEmployeeById);
router.post('/', authMiddleware, createEmployee);
router.put('/:id', authMiddleware, updateEmployee);
router.delete('/:id', authMiddleware, deleteEmployee);

module.exports = router;
