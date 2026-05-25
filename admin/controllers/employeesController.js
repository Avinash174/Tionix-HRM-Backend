const employeesService = require("../services/employeesService");

const listEmployees = async (req, res, next) => {
  try {
    const result = await employeesService.listEmployees(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
};

const getEmployee = async (req, res, next) => {
  try {
    const employee = await employeesService.resolveEmployee(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    const summary = await employeesService.getAttendanceSummary(employee.fkEmpId || employee.pkUserId);
    const logs = await employeesService.getActivityLogs(employee.fkEmpId || employee.pkUserId);
    return res.json({
      success: true,
      employee,
      attendanceSummary: summary,
      activityLogs: logs,
    });
  } catch (err) {
    return next(err);
  }
};

const updateEmployee = async (req, res, next) => {
  try {
    const employee = await employeesService.updateEmployee(req.params.id, req.body);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    return res.json({ success: true, employee });
  } catch (err) {
    return next(err);
  }
};

const deleteEmployee = async (req, res, next) => {
  try {
    const employee = await employeesService.deleteEmployee(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    return res.json({ success: true, employee });
  } catch (err) {
    return next(err);
  }
};

const getEmployeeSalaryStructure = async (req, res, next) => {
  try {
    const result = await employeesService.getLatestSalaryStructure(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    return res.json({
      success: true,
      exists: result.exists,
      hasCtc: result.hasCtc,
      sourceTable: result.sourceTable || "SalStructure",
      employee: result.employee,
      salaryStructure: result.salaryStructure,
      ctc: result.ctc,
      message: result.exists
        ? "Latest salary structure found in SalStructure"
        : "No salary structure found in SalStructure for this employee",
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeSalaryStructure,
};
