/**
 * Build a non-empty error message for API responses (Postgres, MySQL, network).
 */
const cloudDbHint = (err) => {
  if (err?.code === "ENETUNREACH" || String(err?.address || "").includes(":")) {
    return (
      "Supabase direct URL uses IPv6 — Render cannot reach it. " +
      "In Supabase Dashboard → Connect → Session pooler (port 5432), " +
      "copy that URI into Render DATABASE_URL (host: aws-0-REGION.pooler.supabase.com)."
    );
  }
  return (
    "Database unreachable from cloud (Render/Railway/Vercel). " +
    "Set DATABASE_URL to Supabase Session pooler URI (not db.xxx.supabase.co direct). " +
    "Use DB_DRIVER=postgres and remove MYSQL_HOST=127.0.0.1 on Render."
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
