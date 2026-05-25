const { errorResponse } = require("../../utils/apiError");

const adminErrorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.statusCode || 500;
  return res.status(status).json(
    errorResponse(err, "Admin request failed", { details: err.details })
  );
};

module.exports = adminErrorHandler;
