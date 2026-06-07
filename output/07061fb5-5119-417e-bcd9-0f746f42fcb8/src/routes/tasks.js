import { Router } from 'express';
import {
  getTasks,
  createTask,
  getTaskById,
  completeTask,
} from '../controllers/tasksController.js';
import authenticate from '../middleware/auth.js';

const router = Router();

// All task routes require authentication
router.use(authenticate);

/**
 * GET /api/tasks
 * Retrieve all tasks for the authenticated user (with pagination and filtering)
 */
router.get('/', getTasks);

/**
 * POST /api/tasks
 * Create a new task for the authenticated user
 */
router.post('/', createTask);

/**
 * GET /api/tasks/:id
 * Retrieve a specific task by ID
 */
router.get('/:id', getTaskById);

/**
 * PATCH /api/tasks/:id/complete
 * Mark a specific task as complete
 */
router.patch('/:id/complete', completeTask);

export default router;