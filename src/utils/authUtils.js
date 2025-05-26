const bcrypt = require('bcrypt'); // Library for password hashing
const jwt = require('jsonwebtoken'); // Library for generating JSON Web Tokens
require('dotenv').config(); // Load environment variables

const saltRounds = 10; // Number of salt rounds for bcrypt hashing (higher is more secure but slower)

/**
 * Hashes a plain-text password using bcrypt.
 * @async
 * @param {string} password - The plain-text password to hash.
 * @returns {Promise<string>} A promise that resolves to the hashed password.
 * @throws {Error} If hashing fails. It's recommended to handle this error appropriately in the calling function.
 */
async function hashPassword(password) {
  try {
    const salt = await bcrypt.genSalt(saltRounds);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  } catch (error) {
    // Log the error for server-side diagnostics.
    console.error('Error hashing password in authUtils:', error);
    // Re-throw the error to be caught by the global error handler or a try-catch block in the controller.
    // Consider wrapping in AppError if specific status code needed, though 500 is likely for bcrypt failure.
    throw new Error('Password hashing failed.'); 
  }
}

/**
 * Compares a plain-text password with a hashed password using bcrypt.
 * @async
 * @param {string} password - The plain-text password to compare.
 * @param {string} hashedPassword - The stored hashed password to compare against.
 * @returns {Promise<boolean>} A promise that resolves to true if the passwords match, false otherwise.
 * @throws {Error} If comparison fails.
 */
async function comparePassword(password, hashedPassword) {
  try {
    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
  } catch (error) {
    console.error('Error comparing password in authUtils:', error);
    // bcrypt.compare itself usually doesn't throw for non-matching passwords, but for operational errors.
    throw new Error('Password comparison failed.');
  }
}

/**
 * Generates a JWT Access Token.
 * Access tokens are short-lived tokens used to authenticate API requests.
 * @param {object} user - The user object containing claims for the token payload.
 *                        Must include `id` and `username`.
 * @returns {string} The generated JWT access token.
 */
function generateAccessToken(user) {
  // Define the payload for the access token.
  // Include essential, non-sensitive user information.
  const payload = {
    id: user.id, // User's unique identifier
    username: user.username, // User's username
    // Example: type: 'access' (can be useful if you have multiple token types)
    // Example: roles: user.roles (if you implement role-based access control)
  };
  // Sign the token with the JWT_SECRET and set an expiration time (e.g., 15 minutes).
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' }); 
}

/**
 * Generates a JWT Refresh Token.
 * Refresh tokens are long-lived tokens used to obtain new access tokens without requiring re-login.
 * @param {object} user - The user object for whom to generate the token.
 *                        Must include `id` and `username`.
 * @returns {string} The generated JWT refresh token.
 */
function generateRefreshToken(user) {
  // Refresh tokens typically have minimal claims, primarily identifying the user and token type.
  const payload = {
    id: user.id,
    username: user.username, // Including username can be useful for logging/auditing refresh events
    // Example: type: 'refresh'
  };
  // Sign the token with a *different* secret (REFRESH_TOKEN_SECRET) and set a longer expiration (e.g., 7 days).
  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
};
