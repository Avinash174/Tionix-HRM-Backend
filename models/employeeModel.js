const { query } = require("../config/db");

const Employee = {
  findAll: async () => {
    const result = await query(`SELECT * FROM "Employees"`);
    return result.rows;
  },

  findById: async (id) => {
    const result = await query(
      `SELECT * FROM "Employees" WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  },

  create: async (data) => {
    const { firstName, lastName, email, phone, position, department, salary } = data;
    await query(
      `INSERT INTO "Employees" ("firstName", "lastName", "email", "phone", "position", "department", "salary")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [firstName, lastName, email, phone, position, department, salary]
    );
  },

  update: async (id, data) => {
    const { firstName, lastName, email, phone, position, department, salary } = data;
    await query(
      `UPDATE "Employees"
       SET "firstName" = $1, "lastName" = $2, "email" = $3,
           "phone" = $4, "position" = $5, "department" = $6, "salary" = $7
       WHERE id = $8`,
      [firstName, lastName, email, phone, position, department, salary, id]
    );
  },

  delete: async (id) => {
    await query(`DELETE FROM "Employees" WHERE id = $1`, [id]);
  },
};

module.exports = Employee;
