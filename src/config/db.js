const { Pool } = require('pg'); // PostgreSQL client library
require('dotenv').config(); // Load environment variables from .env file

/**
 * PostgreSQL Connection Pool.
 * Manages a pool of connections to the PostgreSQL database, improving performance
 * by reusing connections rather than creating new ones for each query.
 * Configuration is sourced from environment variables.
 */
const pool = new Pool({
  user: process.env.DB_USER,         // PostgreSQL username
  host: process.env.DB_HOST,         // Database server host
  database: process.env.DB_DATABASE, // Database name
  password: process.env.DB_PASSWORD, // User's password
  port: process.env.DB_PORT,         // Port PostgreSQL is running on (default: 5432)
  // Optional: Add connection timeout, max connections, etc.
  // connectionTimeoutMillis: 2000, // time to wait for a connection before timing out
  // max: 20, // maximum number of clients in the pool
  // idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
});

/**
 * Database query function.
 * Executes a SQL query against the database using a client from the pool.
 * @param {string} text - The SQL query string (can include placeholders like $1, $2).
 * @param {Array} [params] - An array of parameters to substitute into the query string. Optional.
 * @returns {Promise<object>} A promise that resolves with the query result object from 'pg'.
 *                            The result object typically contains `rows`, `rowCount`, etc.
 * @throws {Error} If the query fails, the promise will be rejected with an error.
 * 
 * @example
 * const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [1]);
 * console.log(rows[0]); 
 */
const query = (text, params) => pool.query(text, params);

module.exports = {
  query, // Export the simplified query function for common use
  pool,  // Export the pool itself for cases where direct pool access or transactions are needed
         // (e.g., client.query('BEGIN'), client.query('COMMIT'), client.query('ROLLBACK'))
};
