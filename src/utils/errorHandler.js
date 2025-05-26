const AppError = require('./AppError');

// Note: The original error handling functions (handleCastErrorDB, handleDuplicateFieldsDB, handleValidationErrorDB)
// were more specific to MongoDB/Mongoose. For PostgreSQL, error handling often relies on specific error codes
// or the structure of the error object provided by the 'pg' driver.
// These will be simplified or adapted for common PostgreSQL errors if encountered directly here,
// otherwise, services are expected to throw AppError for specific DB issues like unique constraints.

/**
 * Handles JWT (JsonWebTokenError) specific errors by creating an AppError.
 * @returns {AppError} An AppError instance for invalid tokens.
 */
const handleJWTError = () => new AppError(401, 'Invalid token. Please log in again!');

/**
 * Handles JWT (TokenExpiredError) specific errors by creating an AppError.
 * @returns {AppError} An AppError instance for expired tokens.
 */
const handleJWTExpiredError = () => new AppError(401, 'Your token has expired! Please log in again.');

/**
 * Sends detailed error information in the development environment.
 * Includes error object, message, and stack trace for API requests.
 * For non-API requests (future), it could render an error page.
 * @param {Error|AppError} err - The error object.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const sendErrorDev = (err, req, res) => {
  // For API requests (identified by URL starting with /api)
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err, // Send the full error object in development
      message: err.message,
      stack: err.stack // Include stack trace for debugging
    });
  }
  // For future non-API/rendered website errors (currently not implemented)
  console.error('DEVELOPMENT ERROR 💥', err);
  // Example: res.status(err.statusCode).render('errorPage', { title: 'Error!', message: err.message, stack: err.stack });
  return res.status(err.statusCode).send(
    `<h1>Something went wrong (Dev Mode)!</h1>
     <p>${err.message}</p>
     <pre>${err.stack}</pre>`
  );
};

/**
 * Sends user-friendly error messages in the production environment.
 * For operational errors (AppError), sends the specific message.
 * For programming or unknown errors, sends a generic message to avoid leaking sensitive details.
 * @param {Error|AppError} err - The error object.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const sendErrorProd = (err, req, res) => {
  // For API requests
  if (req.originalUrl.startsWith('/api')) {
    // A) Operational, trusted error: send message to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    }
    // B) Programming or other unknown error: don't leak error details
    // 1) Log error for developers
    console.error('PRODUCTION ERROR 💥 (API):', err);
    // 2) Send generic message to client
    return res.status(500).json({
      status: 'error',
      message: 'Something went very wrong! Please try again later.'
    });
  }
  
  // For future non-API/rendered website errors
  // A) Operational, trusted error
  if (err.isOperational) {
    // Example: res.status(err.statusCode).render('errorPage', { title: 'Error!', message: err.message });
    return res.status(err.statusCode).send(
      `<h1>Something went wrong!</h1>
       <p>${err.message}</p>`
    );
  }
  // B) Programming or other unknown error
  // 1) Log error
  console.error('PRODUCTION ERROR 💥 (Non-API):', err);
  // 2) Send generic message
  // Example: res.status(500).render('errorPage', { title: 'Error!', message: 'Please try again later.' });
  return res.status(500).send(
    '<h1>An Unexpected Error Occurred!</h1><p>We are working to fix it. Please try again later.</p>'
  );
};

/**
 * Global Error Handling Middleware for Express.
 * This middleware catches all errors passed to `next(err)`.
 * It normalizes errors, distinguishes between development and production environments,
 * and sends appropriate responses.
 * 
 * @param {Error|AppError} err - The error object.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function (rarely used in global error handler).
 */
module.exports = (err, req, res, next) => {
  // Set default status code and status if not already defined on the error object.
  err.statusCode = err.statusCode || 500; // Default to 500 Internal Server Error
  err.status = err.status || 'error';   // Default status to 'error'

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    // In production, we want to transform certain errors into AppError instances
    // to send user-friendly messages for operational errors.
    // Create a shallow copy to avoid modifying the original error object directly,
    // especially for non-enumerable properties like 'name'.
    let error = { ...err, name: err.name, message: err.message }; 

    // Example: Handling specific PostgreSQL error codes (if not already handled by services)
    // if (error.code === '23505') { // PostgreSQL unique violation
    //   error = new AppError(400, `Duplicate value entered: ${error.detail || 'Please use another value.'}`);
    // }
    // if (error.code === '22P02') { // PostgreSQL invalid text representation (e.g., for UUID or integer)
    //    error = new AppError(400, `Invalid input syntax for type: ${error.message}`);
    // }
    
    // Handle JWT specific errors
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};
