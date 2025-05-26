const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Creates a new user in the database.
 * @param {string} username - The username for the new user.
 * @param {string} passwordHash - The hashed password for the new user.
 * @returns {Promise<object>} The newly created user object (id, username, created_at).
 * @throws {AppError} If the username already exists (409) or for other database errors (500).
 */
async function createUser(username, passwordHash) {
  const queryText = 'INSERT INTO users(username, password_hash) VALUES($1, $2) RETURNING id, username, created_at';
  const values = [username, passwordHash];
  try {
    const { rows } = await db.query(queryText, values);
    return rows[0];
  } catch (error) {
    // Check for unique constraint violation (PostgreSQL error code 23505 for 'unique_violation')
    // 'users_username_key' is the default constraint name for a UNIQUE constraint on the username column.
    if (error.code === '23505' && error.constraint === 'users_username_key') {
      throw new AppError(409, 'Username already exists.');
    }
    console.error('Error creating user in userService:', error); // More specific logging
    throw new AppError(500, 'Could not create user due to a server error.');
  }
}

/**
 * Finds a user by their username.
 * @param {string} username - The username to search for.
 * @param {boolean} [expectUser=false] - If true, throws an AppError if the user is not found.
 * @returns {Promise<object|undefined>} The user object (id, username, password_hash, created_at) if found, 
 *                                      otherwise undefined (unless expectUser is true).
 * @throws {AppError} If expectUser is true and user is not found (404), or for database errors (500).
 */
async function findUserByUsername(username, expectUser = false) {
  const queryText = 'SELECT id, username, password_hash, created_at FROM users WHERE username = $1';
  try {
    const { rows } = await db.query(queryText, [username]);
    if (!rows[0] && expectUser) {
      throw new AppError(404, `User with username '${username}' not found.`);
    }
    return rows[0]; 
  } catch (error) {
    if (error instanceof AppError) throw error; // Re-throw AppError if it's already one
    console.error('Error finding user by username in userService:', error);
    throw new AppError(500, 'Could not find user due to a server error.');
  }
}

/**
 * Finds a user by their ID.
 * Primarily used for internal validation, e.g., checking if a user involved in a chat operation exists.
 * @param {number} userId - The ID of the user to search for.
 * @param {boolean} [expectUser=false] - If true, throws an AppError if the user is not found.
 * @returns {Promise<object|undefined>} The user object (id, username, created_at) if found, 
 *                                      otherwise undefined (unless expectUser is true).
 * @throws {AppError} If expectUser is true and user is not found (404), or for database errors (500).
 */
async function findUserById(userId, expectUser = false) {
    const queryText = 'SELECT id, username, created_at FROM users WHERE id = $1';
    try {
        const { rows } = await db.query(queryText, [userId]);
        if (!rows[0] && expectUser) {
            throw new AppError(404, `User with ID ${userId} not found.`);
        }
        return rows[0];
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error('Error finding user by ID in userService:', error);
        throw new AppError(500, 'Could not find user by ID due to a server error.');
    }
}


module.exports = {
  createUser,
  findUserByUsername,
  findUserById,
};
