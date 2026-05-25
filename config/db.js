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
    return true;
  } catch (err) {
    console.error("Database connection failed:", err.message);
    // On Vercel we don't want to crash the serverless function
    if (process.env.VERCEL) {
      console.warn("Running on Vercel - continuing without DB connection");
      return false;
    }
    if (process.env.NODE_ENV !== "production") {
      throw err;
    }
    return false;
  }
};

module.exports = {
  sql,
  connectDB,
};
