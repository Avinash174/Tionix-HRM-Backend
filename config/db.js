/**
 * Database — PostgreSQL (Supabase / local PG) OR local MySQL.
 *
 * PostgreSQL:
 *   DB_DRIVER=postgres   (default)
 *   DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/postgres
 *
 * Local MySQL (IERPSystem):
 *   DB_DRIVER=mysql
 *   MYSQL_HOST=127.0.0.1
 *   MYSQL_PORT=3306
 *   MYSQL_USER=root
 *   MYSQL_PASSWORD=your_password
 *   MYSQL_DATABASE=IERPSystem
 */
const { Pool } = require("pg");
const mysql = require("mysql2/promise");
require("dotenv").config();

const {
  isMysql,
  adaptSqlForMysql,
  toMysqlPlaceholders,
} = require("./dialect");

const driver = (process.env.DB_DRIVER || "postgres").toLowerCase();
const useMysql = driver === "mysql";

const connectionString = process.env.DATABASE_URL;

const isCloudHost = () =>
  !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.VERCEL);

/** Direct db.*.supabase.co is IPv6-only; Render needs pooler (IPv4). */
const isDirectSupabaseUrl = (url) =>
  typeof url === "string" &&
  /@db\.[a-z0-9]+\.supabase\.co/i.test(url);

const validateDatabaseConfig = () => {
  if (useMysql) {
    const host = process.env.MYSQL_HOST || "127.0.0.1";
    const localHost = host === "127.0.0.1" || host === "localhost";
    if (localHost && (isCloudHost() || process.env.NODE_ENV === "production")) {
      throw new Error(
        "DB_DRIVER=mysql with MYSQL_HOST=127.0.0.1 cannot run on Render. " +
          "Use DB_DRIVER=postgres and DATABASE_URL=your Supabase connection string."
      );
    }
    return;
  }

  const url = (connectionString || "").toLowerCase();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. On Render: Environment → add DATABASE_URL (Supabase URL)."
    );
  }
  if (
    (url.includes("127.0.0.1") || url.includes("localhost")) &&
    (isCloudHost() || process.env.NODE_ENV === "production")
  ) {
    throw new Error(
      "DATABASE_URL points to localhost — Render cannot reach your Mac. " +
        "Use Supabase Session pooler URI (see Supabase Dashboard → Connect)."
    );
  }
  if (isCloudHost() && isDirectSupabaseUrl(connectionString)) {
    throw new Error(
      "DATABASE_URL uses direct host db.*.supabase.co (IPv6 only). " +
        "Render cannot connect. In Supabase → Connect → Session mode, copy the pooler URI " +
        "(host aws-0-REGION.pooler.supabase.com, user postgres.YOUR_PROJECT_REF)."
    );
  }
};

const isLocalDatabase = () => {
  if (useMysql) return true;
  if (process.env.DB_SSL === "false") return true;
  if (process.env.DB_SSL === "true") return false;
  const url = (connectionString || "").toLowerCase();
  return (
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("@host.docker.internal")
  );
};

let pgPool = null;
let mysqlPool = null;

if (useMysql) {
  mysqlPool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: parseInt(process.env.MYSQL_PORT || "3306", 10),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "IERPSystem",
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
  });
} else {
  if (!connectionString) {
    const msg =
      "DATABASE_URL is not set. On Render: Environment → DATABASE_URL (Supabase URI).";
    if (isCloudHost()) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(msg);
  }
  pgPool = new Pool({
    connectionString,
    ssl: isLocalDatabase() ? false : { rejectUnauthorized: false },
  });
}

if (useMysql && isCloudHost()) {
  console.error(
    "DB_DRIVER=mysql cannot run on Render. Set DB_DRIVER=postgres and DATABASE_URL (Supabase)."
  );
  process.exit(1);
}

const RETURNING_RE = /\s+RETURNING\s+(.+)$/i;

const extractInsertTable = (sql) => {
  const m = sql.match(/INSERT\s+INTO\s+`?(\w+)`?/i);
  return m ? m[1] : null;
};

const runMysqlQuery = async (text, params = []) => {
  let sql = adaptSqlForMysql(text);
  const returningMatch = sql.match(RETURNING_RE);

  if (returningMatch) {
    const returningCols = returningMatch[1].trim();
    sql = sql.replace(RETURNING_RE, "").trim();
    const table = extractInsertTable(sql);
    const execSql = toMysqlPlaceholders(sql);
    const [result] = await mysqlPool.execute(execSql, params);
    const insertId = result.insertId;
    if (!table || !insertId) {
      return { rows: [], rowCount: result.affectedRows || 0 };
    }
    const pk =
      returningCols.toLowerCase().includes("sessionid") ||
      returningCols.includes("SessionID")
        ? "SessionID"
        : returningCols.toLowerCase().includes("pkgeoid")
          ? "pkGeoId"
          : "id";
    const [rows] = await mysqlPool.execute(
      `SELECT ${returningCols} FROM \`${table}\` WHERE \`${pk}\` = ? LIMIT 1`,
      [insertId]
    );
    return { rows, rowCount: 1 };
  }

  const execSql = toMysqlPlaceholders(sql);
  const [rows, fields] = await mysqlPool.execute(execSql, params);

  if (rows && typeof rows === "object" && !Array.isArray(rows) && rows.affectedRows != null) {
    return { rows: [], rowCount: rows.affectedRows };
  }
  return { rows: Array.isArray(rows) ? rows : [], rowCount: rows?.length ?? 0 };
};

/** Parameterized query — $1, $2 (works for both Postgres and MySQL). */
const query = async (text, params) => {
  if (useMysql) {
    return runMysqlQuery(text, params);
  }
  return pgPool.query(text, params);
};

const connectDB = async () => {
  try {
    validateDatabaseConfig();
    if (useMysql) {
      const conn = await mysqlPool.getConnection();
      const db = process.env.MYSQL_DATABASE || "IERPSystem";
      console.log(`MySQL (local) Connected — database: ${db}`);
      conn.release();
      return true;
    }
    const client = await pgPool.connect();
    client.release();
    const label = isLocalDatabase()
      ? "PostgreSQL (local) Connected"
      : "PostgreSQL (Supabase/cloud) Connected";
    console.log(label);
    return true;
  } catch (err) {
    console.error("Database connection failed:", err.message);
    if (!connectionString) {
      console.error("DATABASE_URL is not set (Render → Environment → add Supabase URI).");
    } else if (!useMysql) {
      try {
        const host = new URL(
          connectionString.replace(/^postgresql:\/\//i, "http://")
        ).hostname;
        console.error(`DATABASE_URL host: ${host}`);
      } catch {
        console.error("DATABASE_URL format is invalid.");
      }
    }
    if (isCloudHost()) {
      process.exit(1);
    }
    if (process.env.NODE_ENV !== "production") {
      throw err;
    }
    return false;
  }
};

const pool = useMysql ? mysqlPool : pgPool;

const { tbl } = require("./tables");

module.exports = {
  pool,
  query,
  connectDB,
  tbl,
  isLocalDatabase,
  isMysql: () => useMysql,
  dbDriver: () => driver,
};
