const { query } = require('../db/client');

const TaskModel = {
  async findAll(isCompleteFilter) {
    let text = 'SELECT id, title, description, is_complete, created_at, completed_at FROM tasks';
    const params = [];

    if (isCompleteFilter !== null && isCompleteFilter !== undefined) {
      text += ' WHERE is_complete = $1';
      params.push(isCompleteFilter);
    }

    text += ' ORDER BY created_at DESC';

    const result = await query(text, params);
    return result.rows;
  },

  async findById(id) {
    const text = 'SELECT id, title, description, is_complete, created_at, completed_at FROM tasks WHERE id = $1';
    const result = await query(text, [id]);
    return result.rows[0] || null;
  },

  async create({ title, description }) {
    const text = `
      INSERT INTO tasks (title, description, is_complete, created_at, completed_at)
      VALUES ($1, $2, false, NOW(), NULL)
      RETURNING id, title, description, is_complete, created_at, completed_at
    `;
    const result = await query(text, [title, description]);
    return result.rows[0];
  },

  async markComplete(id) {
    const text = `
      UPDATE tasks
      SET is_complete = true, completed_at = NOW()
      WHERE id = $1
      RETURNING id, title, description, is_complete, created_at, completed_at
    `;
    const result = await query(text, [id]);
    return result.rows[0] || null;
  }
};

module.exports = TaskModel;