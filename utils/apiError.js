/**
 * Build a non-empty error message for API responses (Postgres, MySQL, network).
 */
const formatApiError = (err, fallback = "Request failed") => {
  if (!err) return fallback;

  if (typeof err === "string" && err.trim()) return err.trim();

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
