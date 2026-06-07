import {
  findTasksByUser,
  countTasksByUser,
  createTask as createTaskModel,
  findTaskById,
  markTaskComplete,
} from '../models/Task.js';
import { validateTaskCreation } from '../utils/validation.js';

/**
 * GET /api/tasks
 * Retrieve tasks for the authenticated user with optional pagination and filtering
 */
export async function getTasks(req, res) {
  try {
    const userId = req.user.id;

    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 20;

    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 100) limit = 100;

    const offset = (page - 1) * limit;

    let completed = undefined;
    if (req.query.completed !== undefined) {
      if (req.query.completed === 'true') completed = true;
      else if (req.query.completed === 'false') completed = false;
    }

    const [tasks, total] = await Promise.all([
      findTasksByUser(userId, { limit, offset, completed }),
      countTasksByUser(userId, { completed }),
    ]);

    const total_pages = Math.ceil(total / limit);

    return res.status(200).json({
      tasks,
      pagination: {
        page,
        limit,
        total,
        total_pages,
      },
    });
  } catch (err) {
    console.error('getTasks error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/tasks
 * Create a new task for the authenticated user
 */
export async function createTask(req, res) {
  try {
    const { error } = validateTaskCreation(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { title, description } = req.body;
    const userId = req.user.id;

    const task = await createTaskModel({
      user_id: userId,
      title,
      description: description || null,
    });

    return res.status(201).json(task);
  } catch (err) {
    console.error('createTask error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/tasks/:id
 * Retrieve a specific task by ID
 */
export async function getTaskById(req, res) {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = await findTaskById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.status(200).json(task);
  } catch (err) {
    console.error('getTaskById error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PATCH /api/tasks/:id/complete
 * Mark a specific task as complete
 */
export async function completeTask(req, res) {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = await findTaskById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (task.completed) {
      return res.status(400).json({ error: 'Task is already completed' });
    }

    const updatedTask = await markTaskComplete(taskId);

    return res.status(200).json(updatedTask);
  } catch (err) {
    console.error('completeTask error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}