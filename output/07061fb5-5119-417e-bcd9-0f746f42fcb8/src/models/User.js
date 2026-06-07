import { query } from '../db.js';

/**
 * Find a user by their email address.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function findUserByEmail(email) {
  const result = await query(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE email = $1 LIMIT 1',
    [email]
  );
  return result.rows[0] || null;
}

/**
 * Find a user by their ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export async function findUserById(id) {
  const result = await query(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE id = $1 LIMIT 1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Create a new user record.
 * @param {Object} userData
 * @param {string} userData.email
 * @param {string} userData.username
 * @param {string} userData.password_hash
 * @returns {Promise<Object>}
 */
export async function createUser({ email, username, password_hash }) {
  const result = await query(
    `INSERT INTO users (email, username, password_hash, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id, email, username, created_at`,
    [email, username, password_hash]
  );
  return result.rows[0];
}