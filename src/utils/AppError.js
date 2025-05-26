/**
 * Custom error class for operational errors that are expected and handled.
 * Extends the built-in Error class.
 * Operational errors are those that are not bugs in the code but rather
 * predictable issues like invalid user input, resource not found, etc.
 */
class AppError extends Error {
  /**
   * Creates an instance of AppError.
   * @param {number} statusCode - The HTTP status code for this error (e.g., 400, 404, 500).
   * @param {string} message - The error message describing the issue.
   */
  constructor(statusCode, message) {
    super(message); // Call the parent Error class constructor with the error message.

    this.statusCode = statusCode; // HTTP status code (e.g., 404 for Not Found).
    // Set status based on statusCode: 'fail' for 4xx client errors, 'error' for 5xx server errors.
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error'; 
    // Mark this error as an operational error (i.e., not a programming bug).
    // This flag is used by the global error handler to decide how to respond to the client.
    this.isOperational = true; 

    // Capture the stack trace, but exclude the constructor call from it to provide a cleaner trace.
    // This helps in pinpointing where the AppError was instantiated.
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
