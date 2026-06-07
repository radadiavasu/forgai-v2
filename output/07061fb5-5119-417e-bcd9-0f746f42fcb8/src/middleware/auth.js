import { verifyToken } from '../utils/jwt.js';
import { findUserById } from '../models/User.js';

/**
 * Middleware to authenticate requests using JWT Bearer tokens.
 * Attaches the authenticated user to req.user on success.
 */
export default async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await findUserById(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
    };

    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}