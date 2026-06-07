import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_super_secret_key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate a signed JWT token.
 * @param {Object} payload - Data to encode in the token
 * @returns {string} Signed JWT string
 */
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token.
 * @param {string} token - JWT string to verify
 * @returns {Object} Decoded payload
 * @throws {JsonWebTokenError|TokenExpiredError} If the token is invalid or expired
 */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}