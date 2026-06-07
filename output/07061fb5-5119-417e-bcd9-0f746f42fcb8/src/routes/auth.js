import { Router } from 'express';
import { register, login } from '../controllers/authController.js';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', register);

/**
 * POST /api/auth/login
 * Authenticate an existing user
 */
router.post('/login', login);

export default router;