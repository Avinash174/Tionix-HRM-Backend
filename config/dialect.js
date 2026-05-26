/**
 * SQL dialect helpers — PostgreSQL (Supabase/local PG) vs local MySQL.
 * Set DB_DRIVER=mysql in .env for local MySQL (IERPSystem / dbo tables).
 */

const isMysql = () =>
  (process.env.DB_DRIVER || "postgres").toLowerCase() === "mysql";

/** Quoted table name (dbo.AppUser on PG, AppUser on MySQL). */
const tbl = (name) => (isMysql() ? `\`${name}\`` : `"dbo.${name}"`);

/** Quoted column name. */
const col = (name) => (isMysql() ? `\`${name}\`` : `"${name}"`);

/** AtDate column value for INSERT (matches dbo.Attendance.AtDate format). */
const atDateInsert = () =>
  isMysql()
    ? "DATE_FORMAT(CURDATE(), '%Y-%m-%d')"
    : "CURRENT_DATE::text";

/** PunchTime for INSERT. */
const punchTimeInsert = () =>
  isMysql() ? "TIME_FORMAT(NOW(), '%H:%i:%s')" : "TO_CHAR(NOW(), 'HH24:MI:SS')";

/** Compare AtDate to today in WHERE. */
const atDateToday = () =>
  isMysql()
    ? `${col("AtDate")} = DATE_FORMAT(CURDATE(), '%Y-%m-%d')`
    : `${col("AtDate")} = CURRENT_DATE::text`;

/** Session expiry expression for INSERT. */
const sessionExpiresAt = () =>
  isMysql() ? "DATE_ADD(NOW(), INTERVAL 7 DAY)" : "NOW() + INTERVAL '7 days'";

/** Stale / online window: NOW() - N seconds */
const secondsAgo = (paramIndex) =>
  isMysql()
    ? `DATE_SUB(NOW(), INTERVAL ? SECOND)`
    : `NOW() - ($${paramIndex} || ' seconds')::INTERVAL`;

/** Admin / employee SysDefined check fragment. */
const adminSysDefinedOr = () =>
  isMysql()
    ? `OR COALESCE(${col("SysDefined")}, 0) = 1
           OR (COALESCE(NULLIF(TRIM(CAST(${col("fkECId")} AS CHAR)), ''), 0) = 1 AND ${col("fkEmpId")} IS NULL)`
    : `OR COALESCE("SysDefined"::int, 0) = 1
           OR (COALESCE(NULLIF(TRIM("fkECId"::text), '')::int, 0) = 1 AND "fkEmpId" IS NULL)`;

/** Active flag in WHERE. */
const activeTrue = () => (isMysql() ? "1" : "true");

/** CREATE TABLE employee_live_locations */
const createLiveLocationTableSql = () =>
  isMysql()
    ? `
    CREATE TABLE IF NOT EXISTS employee_live_locations (
      id              BIGINT AUTO_INCREMENT PRIMARY KEY,
      emp_code        VARCHAR(50)    NOT NULL,
      emp_name        VARCHAR(100)   NULL,
      latitude        DECIMAL(10,7)  NOT NULL,
      longitude       DECIMAL(10,7)  NOT NULL,
      accuracy_meters DECIMAL(10,2)  NULL,
      heading         DECIMAL(10,2)  NULL,
      speed           DECIMAL(10,2)  NULL,
      address         VARCHAR(500)   NULL,
      device_info     VARCHAR(500)   NULL,
      is_suspicious   TINYINT(1)     DEFAULT 0,
      gps_risk_score  INT            NULL,
      gps_flags       VARCHAR(500)   NULL,
      recorded_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
    : `
    CREATE TABLE IF NOT EXISTS employee_live_locations (
      id             BIGSERIAL PRIMARY KEY,
      emp_code       VARCHAR(50)    NOT NULL,
      emp_name       VARCHAR(100)   NULL,
      latitude       DECIMAL(10,7)  NOT NULL,
      longitude      DECIMAL(10,7)  NOT NULL,
      accuracy_meters DECIMAL(10,2) NULL,
      heading        DECIMAL(10,2)  NULL,
      speed          DECIMAL(10,2)  NULL,
      address        VARCHAR(500)   NULL,
      device_info    VARCHAR(500)   NULL,
      is_suspicious  BOOLEAN        DEFAULT false,
      gps_risk_score INT            NULL,
      gps_flags      VARCHAR(500)   NULL,
      recorded_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    )`;

/**
 * Adapt a Postgres-style query string for MySQL execution.
 * Call before converting $1 placeholders to ?.
 */
const adaptSqlForMysql = (sql) => {
  let s = sql;

  s = s.replace(/"dbo\.([^"]+)"/g, "`$1`");
  s = s.replace(/"([^"]+)"/g, "`$1`");

  s = s.replace(/CURRENT_DATE::text/gi, "DATE_FORMAT(CURDATE(), '%Y-%m-%d')");
  s = s.replace(
    /TO_CHAR\s*\(\s*NOW\s*\(\s*\)\s*,\s*'HH24:MI:SS'\s*\)/gi,
    "TIME_FORMAT(NOW(), '%H:%i:%s')"
  );
  s = s.replace(
    /NOW\s*\(\s*\)\s*\+\s*INTERVAL\s*'7 days'/gi,
    "DATE_ADD(NOW(), INTERVAL 7 DAY)"
  );
  s = s.replace(
    /NOW\s*\(\s*\)\s*-\s*\(\s*\?\s*\|\|\s*'\s*seconds'\s*\)::INTERVAL/gi,
    "DATE_SUB(NOW(), INTERVAL ? SECOND)"
  );
  s = s.replace(
    /NOW\s*\(\s*\)\s*-\s*\(\s*\$(\d+)\s*\|\|\s*'\s*seconds'\s*\)::INTERVAL/gi,
    "DATE_SUB(NOW(), INTERVAL ? SECOND)"
  );
  s = s.replace(/::int/gi, "");
  s = s.replace(/::text/gi, "");
  s = s.replace(/::TEXT/gi, "");
  s = s.replace(/::date/gi, "");
  s = s.replace(/recorded_at::date/gi, "DATE(recorded_at)");
  s = s.replace(/ILIKE/gi, "LIKE");
  s = s.replace(/\$(\d+)::text/gi, "?");
  s = s.replace(/\$(\d+)::int/gi, "?");
  s = s.replace(/=\s*true\b/gi, "= 1");
  s = s.replace(/recorded_at\s*=\s*CURRENT_DATE/gi, "DATE(recorded_at) = CURDATE()");

  return s;
};

/** Match AppUser.fkLocationId (text) to AttendanceLocations.LocationID (bigint). */
const joinUserToLocation = (userAlias = "u", locAlias = "l") =>
  isMysql()
    ? `${userAlias}.\`fkLocationId\` = ${locAlias}.\`LocationID\``
    : `NULLIF(TRIM(${userAlias}."fkLocationId"), '')::bigint = ${locAlias}."LocationID"`;

/** Filter AppUser rows by office/location id parameter. */
const filterUserLocationId = (userAlias = "u", paramIndex = 1) =>
  isMysql()
    ? `${userAlias}.\`fkLocationId\` = ?`
    : `NULLIF(TRIM(${userAlias}."fkLocationId"), '')::bigint = $${paramIndex}::bigint`;

const toMysqlPlaceholders = (sql) => sql.replace(/\$(\d+)/g, "?");

module.exports = {
  isMysql,
  tbl,
  col,
  atDateInsert,
  punchTimeInsert,
  atDateToday,
  sessionExpiresAt,
  secondsAgo,
  adminSysDefinedOr,
  activeTrue,
  createLiveLocationTableSql,
  adaptSqlForMysql,
  toMysqlPlaceholders,
  joinUserToLocation,
  filterUserLocationId,
};
