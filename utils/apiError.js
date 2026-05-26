/**
 * Build a non-empty error message for API responses (Postgres, MySQL, network).
 */
const cloudDbHint = (err) => {
  if (err?.code === "ENETUNREACH" || String(err?.address || "").includes(":")) {
    return (
      "Supabase direct URL uses IPv6 — Render cannot reach it. " +
      "Supabase → Connect → Session mode → copy pooler URI into Render DATABASE_URL " +
      "(host must be aws-0-REGION.pooler.supabase.com, user postgres.PROJECT_REF)."
    );
  }
  if (err?.code === "ECONNREFUSED") {
    if (!process.env.DATABASE_URL) {
      return (
        "DATABASE_URL is not set on Render. Add Supabase Session pooler URI in " +
        "Render → Environment → DATABASE_URL (not empty)."
      );
    }
    if ((process.env.DB_DRIVER || "").toLowerCase() === "mysql") {
      return (
        "DB_DRIVER=mysql connects to localhost on Render. Set DB_DRIVER=postgres " +
        "and DATABASE_URL to Supabase Session pooler URI."
      );
    }
    return (
      "Database connection refused. On Render use Supabase Session pooler URI " +
      "(pooler.supabase.com), not db.xxx.supabase.co direct URL."
    );
  }
  return (
    "Database unreachable from cloud (Render). Set DATABASE_URL to Supabase " +
    "Session pooler URI. DB_DRIVER=postgres. Remove MYSQL_* variables."
  );
};

const formatApiError = (err, fallback = "Request failed") => {
  if (!err) return fallback;

  if (typeof err === "string" && err.trim()) return err.trim();

  if (err.code === "ECONNREFUSED" || err.code === "ENETUNREACH") {
    return cloudDbHint(err);
  }

  const parts = [
    err.message,
    err.detail,
    err.sqlMessage,
    err.hint,
    err.code && !err.message ? `Error ${err.code}` : null,
  ].filter((p) => p != null && String(p).trim() !== "");

  if (parts.length > 0) {
    return parts.map((p) => String(p).trim()).join(" — ");
  }

  if (Array.isArray(err.errors) && err.errors.length > 0) {
    const nested = formatApiError(err.errors[0], "");
    if (nested) return nested;
  }

  const asString = String(err);
  if (asString && asString !== "[object Object]") return asString;

  return fallback;
};

/** JSON body for errors — includes `error` for older mobile clients. */
const errorResponse = (err, fallback, extra = {}) => {
  const message = formatApiError(err, fallback);
  return {
    success: false,
    message,
    error: message,
    code: err?.code,
    ...extra,
  };
};

module.exports = { formatApiError, errorResponse };
