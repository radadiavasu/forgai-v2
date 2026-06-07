import { query } from '../db.js';

/**
 * Find tasks belonging to a user with optional filtering and pagination.
 * @param {number} userId
 * @param {Object} options
 * @param {number} options.limit
 * @param {number} options.offset
 * @param {boolean|undefined} options.completed
 * @returns {Promise<Array>}
 */
export async function findTasksByUser(userId, { limit, offset, completed }) {
  let sql = `SELECT id, user_id, title, description, completed, completed_at, created_at
             FROM tasks
             WHERE user_id = $1`;
  const params = [userId];
  let paramIndex = 2;

  if (completed !== undefined) {
    sql += ` AND completed = $${paramIndex}`;
    params.push(completed);
    paramIndex++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Count tasks belonging to a user with optional filtering.
 * @param {number} userId
 * @param {Object} options
 * @param {boolean|undefined} options.completed
 * @returns {Promise<number>}
 */
export async function countTasksByUser(userId, { completed }) {
  let sql = 'SELECT COUNT(*) FROM tasks WHERE user_id = $1';
  const params = [userId];
  let paramIndex = 2;

  if (completed !== undefined) {
    sql += ` AND completed = $${paramIndex}`;
    params.push(completed);
  }

  const result = await query(sql, params);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Find a task by its ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export async function findTaskById(id) {
  const result = await query(
    `SELECT id, user_id, title, description, completed, completed_at, created_at
     FROM tasks
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Create a new task.
 * @param {Object} taskData
 * @param {number} taskData.user_id
 * @param {string} taskData.title
 * @param {string|null} taskData.description
 * @returns {Promise<Object>}
 */
export async function createTask({ user_id, title, description }) {
  const result = await query(
    `INSERT INTO tasks (user_id, title, description, completed, completed_at, created_at)
     VALUES ($1, $2, $3, FALSE, NULL, NOW())
     RETURNING id, user_id, title, description, completed, completed_at, created_at`,
    [user_id, title, description]
  );
  return result.rows[0];
}

/**
 * Mark a task as complete by setting completed = true and completed_at = now.
 * @param {number} id
 * @returns {Promise<Object>}
 */
export async function markTaskComplete(id) {
  const result = await query(
    `UPDATE tasks
     SET completed = TRUE, completed_at = NOW()
     WHERE id = $1
     RETURNING id, user_id, title, description, completed, completed_at, created_at`,
    [id]
  );
  return result.rows[0];
}