const { sql } = require("../config/db");

const Employee = {
  findAll: async () => {
    const result = await new sql.Request().query('SELECT * FROM Employees');
    return result.recordset;
  },

  findById: async (id) => {
    const result = await new sql.Request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Employees WHERE id = @id');
    return result.recordset[0];
  },

  create: async (data) => {
    const { firstName, lastName, email, phone, position, department, salary } = data;
    await new sql.Request()
      .input('firstName', sql.VarChar, firstName)
      .input('lastName', sql.VarChar, lastName)
      .input('email', sql.VarChar, email)
      .input('phone', sql.VarChar, phone)
      .input('position', sql.VarChar, position)
      .input('department', sql.VarChar, department)
      .input('salary', sql.Numeric, salary)
      .query(`
        INSERT INTO Employees (firstName, lastName, email, phone, position, department, salary) 
        VALUES (@firstName, @lastName, @email, @phone, @position, @department, @salary)
      `);
  },

  update: async (id, data) => {
    const { firstName, lastName, email, phone, position, department, salary } = data;
    await new sql.Request()
      .input('id', sql.Int, id)
      .input('firstName', sql.VarChar, firstName)
      .input('lastName', sql.VarChar, lastName)
      .input('email', sql.VarChar, email)
      .input('phone', sql.VarChar, phone)
      .input('position', sql.VarChar, position)
      .input('department', sql.VarChar, department)
      .input('salary', sql.Numeric, salary)
      .query(`
        UPDATE Employees 
        SET firstName = @firstName, lastName = @lastName, email = @email, 
            phone = @phone, position = @position, department = @department, 
            salary = @salary 
        WHERE id = @id
      `);
  },

  delete: async (id) => {
    await new sql.Request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Employees WHERE id = @id');
  }
};

module.exports = Employee;
