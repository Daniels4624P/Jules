const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError'); // Use AppError for consistent error handling
require('dotenv').config();

/**
 * @middleware verifyToken
 * Express middleware to authenticate users based on JWT (JSON Web Token).
 * It expects the JWT to be provided in an HttpOnly cookie named 'accessToken'.
 * - If the token is valid, it decodes the payload and attaches it to `req.user`.
 * - If the token is missing, invalid, or expired, it calls `next` with an appropriate `AppError`.
 * This middleware should be used to protect routes that require user authentication.
 * 
 * @param {object} req - Express request object. `req.cookies.accessToken` is expected.
 * @param {object} res - Express response object (not directly used here, errors are passed to `next`).
 * @param {function} next - Express next middleware function.
 * @returns {void} Calls `next()` to pass control to the next middleware/handler, or `next(error)` on failure.
 */
function verifyToken(req, res, next) {
  const token = req.cookies.accessToken;

  if (!token) {
    // No token provided in cookies.
    // 401 Unauthorized is more semantically correct than 403 Forbidden when credentials are required but missing.
    return next(new AppError(401, 'Access token is required. No token provided. Please log in.'));
  }

  try {
    // Verify the token using the JWT_SECRET.
    // jwt.verify throws an error if the token is invalid or expired.
    const decodedPayload = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach the decoded user payload (e.g., { id: userId, username: 'user' }) to the request object.
    // This makes the authenticated user's information available to subsequent route handlers.
    req.user = decodedPayload; 
    
    next(); // Token is valid, proceed to the next middleware or route handler.
  } catch (error) {
    // Handle JWT verification errors.
    console.error('Token verification error in auth.js middleware:', error.name, error.message);
    if (error.name === 'TokenExpiredError') {
      // Token has expired.
      return next(new AppError(401, 'Access token expired. Please log in again.'));
    }
    if (error.name === 'JsonWebTokenError') {
      // Token is malformed or signature is invalid.
      return next(new AppError(401, 'Invalid access token. Please log in again.'));
    }
    // For other unexpected errors during token verification.
    return next(new AppError(500, 'Could not verify access token due to a server issue.'));
  }
}

module.exports = {
  verifyToken,
};
