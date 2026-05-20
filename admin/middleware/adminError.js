const adminErrorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: err.message || "Admin request failed",
    code: err.code,
    details: err.details,
  });
};

module.exports = adminErrorHandler;
