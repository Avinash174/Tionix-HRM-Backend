const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase
});

const connectDB = async () => {
  try {
    const client = await pool.connect();
    client.release();
    console.log("PostgreSQL (Supabase) Connected");
    return true;
  } catch (err) {
    console.error("Database connection failed:", err.message);
    if (process.env.NODE_ENV !== "production") {
      throw err;
    }
    return false;
  }
};

// Helper: run a parameterized query
// mssql used @paramName, pg uses $1, $2 — this helper handles that automatically
const query = (text, params) => pool.query(text, params);

const { tbl } = require("./tables");

module.exports = {
  pool,
  query,
  connectDB,
  tbl,
};
