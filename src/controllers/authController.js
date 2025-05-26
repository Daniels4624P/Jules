const userService = require('../services/userService');
const authUtils = require('../utils/authUtils');
const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
require('dotenv').config(); // Ensures environment variables are loaded

/**
 * @controller register
 * Handles new user registration.
 * Validates username and password, checks for existing users, hashes the password,
 * and creates a new user.
 * @param {object} req - Express request object. Expected body: { username, password }.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {void} Sends a JSON response with success message and user info, or calls next with AppError.
 */
const register = catchAsync(async (req, res, next) => {
  const { username, password } = req.body;

  // --- Input Validation ---
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return next(new AppError(400, 'Username must be a string and at least 3 characters long.'));
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return next(new AppError(400, 'Password must be a string and at least 6 characters long.'));
  }

  // --- Check for existing user ---
  // userService.findUserByUsername will return user object or undefined (if not expecting user).
  // Here, we don't expect user, so it returns undefined if username is available.
  const existingUser = await userService.findUserByUsername(username);
  if (existingUser) {
    return next(new AppError(409, 'Username already taken. Please choose another.'));
  }

  // --- Password Hashing & User Creation ---
  const hashedPassword = await authUtils.hashPassword(password);
  const newUser = await userService.createUser(username, hashedPassword); 
  // userService.createUser will throw AppError on DB errors (e.g., if unique constraint violated despite check - race condition).

  // --- Success Response ---
  res.status(201).json({
    message: 'User created successfully.',
    user: { id: newUser.id, username: newUser.username } // Do not send password hash
  });
});

/**
 * @controller login
 * Handles user login.
 * Validates input, finds the user, compares passwords, and generates JWTs (access and refresh tokens).
 * Tokens are set as HttpOnly cookies.
 * @param {object} req - Express request object. Expected body: { username, password }.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {void} Sends JSON response with success message and user info, or calls next with AppError.
 */
const login = catchAsync(async (req, res, next) => {
  const { username, password } = req.body;

  // --- Input Validation ---
  if (!username || typeof username !== 'string' || username.trim() === '') {
    return next(new AppError(400, 'Username is required.'));
  }
  if (!password || typeof password !== 'string' || password === '') {
    return next(new AppError(400, 'Password is required.'));
  }

  // --- User Existence & Password Verification ---
  // userService.findUserByUsername (with expectUser=true) will throw AppError if user not found.
  const user = await userService.findUserByUsername(username, true); 
  
  const isMatch = await authUtils.comparePassword(password, user.password_hash);
  if (!isMatch) {
    return next(new AppError(401, 'Invalid credentials. Please check username and password.'));
  }

  // --- Token Generation ---
  const accessToken = authUtils.generateAccessToken({ id: user.id, username: user.username });
  const refreshToken = authUtils.generateRefreshToken({ id: user.id, username: user.username });

  // --- Set HttpOnly Cookies ---
  // Access Token Cookie: Short-lived, used for API authentication.
  res.cookie('accessToken', accessToken, {
    httpOnly: true, // Not accessible via JavaScript, helps prevent XSS
    secure: process.env.NODE_ENV === 'production', // Send only over HTTPS in production
    path: '/', // Accessible site-wide
    maxAge: 15 * 60 * 1000, // 15 minutes in milliseconds
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' for cross-site, 'lax' for same-site
  });

  // Refresh Token Cookie: Long-lived, used to obtain new access tokens.
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/refresh-token', // Specific path for refresh token requests
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  // --- Success Response ---
  res.json({
    message: 'Logged in successfully.',
    user: { id: user.id, username: user.username } // User details for the client
  });
});

/**
 * @controller refreshTokenHandler (aliased as refreshToken in exports)
 * Handles refreshing of access tokens using a valid refresh token.
 * Verifies the refresh token, generates a new access token, and sets it as an HttpOnly cookie.
 * @param {object} req - Express request object. Expected cookie: refreshToken.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {void} Sends JSON response with success message, or calls next with AppError.
 */
const refreshTokenHandler = catchAsync(async (req, res, next) => {
  const existingRefreshToken = req.cookies.refreshToken;

  if (!existingRefreshToken) {
    return next(new AppError(401, 'Refresh token not found. Please log in.'));
  }

  let decodedPayload;
  try {
    // Verify the refresh token using its specific secret
    decodedPayload = jwt.verify(existingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (err) {
    // If token verification fails (e.g., invalid, expired), clear the potentially compromised cookie
    res.cookie('refreshToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/api/auth/refresh-token',
        maxAge: 0, // Expire immediately
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      });
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError(403, 'Invalid or expired refresh token. Please log in again.'));
    }
    // For other unexpected verification errors
    return next(new AppError(500, 'Could not verify refresh token due to a server issue.'));
  }
  
  // Optional: Check if the user associated with the token still exists in the database.
  // This adds an extra layer of security (e.g., if user was deleted after token issuance).
  // const user = await userService.findUserById(decodedPayload.id);
  // if (!user) {
  //   return next(new AppError(401, 'User belonging to this token no longer exists.'));
  // }

  // Generate a new access token
  const newAccessToken = authUtils.generateAccessToken({ id: decodedPayload.id, username: decodedPayload.username });

  // Set the new access token as an HttpOnly cookie
  res.cookie('accessToken', newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  res.json({ message: 'Access token refreshed successfully.' });
});

/**
 * @controller logout
 * Handles user logout by clearing the access and refresh token cookies.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {void} Sends JSON response with success message.
 */
const logout = (req, res) => { 
  // Clear the access token cookie by setting its value to empty and maxAge to 0
  res.cookie('accessToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0, // Expire immediately
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  // Clear the refresh token cookie
  res.cookie('refreshToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/refresh-token',
    maxAge: 0, // Expire immediately
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  res.status(200).json({ message: 'Logged out successfully.' });
};

module.exports = {
  register,
  login,
  refreshToken: refreshTokenHandler, // Export refreshTokenHandler as 'refreshToken'
  logout,
};
