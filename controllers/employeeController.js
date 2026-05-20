const Employee = require("../models/employeeModel");

const getAllEmployees = async (req, res) => {
    try {
        const employees = await Employee.findAll();
        res.json(employees);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const getEmployeeById = async (req, res) => {
    const { id } = req.params;
    try {
        const employee = await Employee.findById(id);
        res.json(employee);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const createEmployee = async (req, res) => {
    try {
        await Employee.create(req.body);
        res.status(201).json({ message: 'Employee created successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const updateEmployee = async (req, res) => {
    const { id } = req.params;
    try {
        await Employee.update(id, req.body);
        res.json({ message: 'Employee updated successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const deleteEmployee = async (req, res) => {
    const { id } = req.params;
    try {
        await Employee.delete(id);
        res.json({ message: 'Employee deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = { getAllEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee };
