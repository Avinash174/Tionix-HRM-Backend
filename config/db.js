const sql = require("mssql");
require("dotenv").config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT),
  options: {
    trustServerCertificate: true,
    encrypt: false,
  },
};

const connectDB = async () => {
  try {
    await sql.connect(config);
    console.log("SQL Server Connected");
  } catch (err) {
    console.log(err);
  }
};

module.exports = {
  sql,
  connectDB,
};
