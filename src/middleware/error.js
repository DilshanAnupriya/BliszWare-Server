/** 404 handler for unmatched routes. */
export const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Not found — ${req.originalUrl}`));
};

/**
 * Central error handler. Normalises Mongoose cast/validation/duplicate-key
 * errors into clean JSON responses and hides stack traces in production.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message;

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Resource not found';
  }

  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `That ${field} is already in use`;
  }

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV === 'production' ? {} : { stack: err.stack }),
  });
};
