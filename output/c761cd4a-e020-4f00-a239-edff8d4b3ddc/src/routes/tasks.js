const express = require('express');
const router = express.Router();
const TaskService = require('../services/TaskService');

// GET /api/tasks
router.get('/', async (req, res) => {
  try {
    const { is_complete } = req.query;
    let filter = null;
    if (is_complete !== undefined) {
      if (is_complete === 'true') {
        filter = true;
      } else if (is_complete === 'false') {
        filter = false;
      }
    }
    const tasks = await TaskService.getAllTasks(filter);
    res.status(200).json({ data: tasks, tasks });
  } catch (err) {
    console.error('GET /api/tasks error:', err);
    res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (title.trim().length > 255) {
      return res.status(400).json({ error: 'Title must be 255 characters or fewer' });
    }
    const task = await TaskService.createTask({ title: title.trim(), description: description || null });
    res.status(201).json({ data: task, task });
  } catch (err) {
    console.error('POST /api/tasks error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PATCH /api/tasks/:id/complete
router.patch('/:id/complete', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }
    const task = await TaskService.completeTask(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(200).json({ data: task, task });
  } catch (err) {
    console.error('PATCH /api/tasks/:id/complete error:', err);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

module.exports = router;