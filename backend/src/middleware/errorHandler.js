const env = require('../config/env');
const ApiError = require('../utils/ApiError');

// 404 for unmatched routes
function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// Central error handler
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Map common PostgreSQL errors to friendly responses
  if (err.code === '23505') {
    statusCode = 409;
    message = 'A record with these unique values already exists';
    details = err.detail || null;
  } else if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced record does not exist';
    details = err.detail || null;
  } else if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid input syntax (e.g. malformed UUID or number)';
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  const body = { success: false, message };
  if (details) body.details = details;
  if (env.nodeEnv === 'development' && statusCode >= 500) body.stack = err.stack;

  res.status(statusCode).json(body);
}

module.exports = { notFound, errorHandler };
