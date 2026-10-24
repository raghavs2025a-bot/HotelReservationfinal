import { config } from '../config/env.js';

export function notFound(req, _res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  err.isOperational = true;
  next(err);
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong.';

  if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    message = 'A record with the same unique value already exists.';
  } else if (err.code === 'ER_SIGNAL_EXCEPTION' && /ROOM_ALREADY_BOOKED/.test(err.message || '')) {
    status = 409;
    message = 'This room is already booked for the selected dates.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON request body.';
  } else if (!err.isOperational && status === 500) {
    console.error('[error]', err);
    message = config.isProd ? 'Internal server error.' : `Internal server error: ${err.message}`;
  }

  res.status(status).json({ success: false, message, details: err.details || undefined });
}
