/**
 * Validate registration input.
 * @param {Object} data
 * @returns {{ error: { message: string } | null }}
 */
export function validateRegistration(data) {
  const { email, password, username } = data || {};

  if (!email || typeof email !== 'string' || !email.trim()) {
    return { error: { message: 'Email is required' } };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { error: { message: 'Email must be a valid email address' } };
  }

  if (email.trim().length > 255) {
    return { error: { message: 'Email must not exceed 255 characters' } };
  }

  if (!password || typeof password !== 'string') {
    return { error: { message: 'Password is required' } };
  }

  if (password.length < 8) {
    return { error: { message: 'Password must be at least 8 characters' } };
  }

  if (!username || typeof username !== 'string' || !username.trim()) {
    return { error: { message: 'Username is required' } };
  }

  if (username.trim().length > 100) {
    return { error: { message: 'Username must not exceed 100 characters' } };
  }

  return { error: null };
}

/**
 * Validate login input.
 * @param {Object} data
 * @returns {{ error: { message: string } | null }}
 */
export function validateLogin(data) {
  const { email, password } = data || {};

  if (!email || typeof email !== 'string' || !email.trim()) {
    return { error: { message: 'Email is required' } };
  }

  if (!password || typeof password !== 'string') {
    return { error: { message: 'Password is required' } };
  }

  return { error: null };
}

/**
 * Validate task creation input.
 * @param {Object} data
 * @returns {{ error: { message: string } | null }}
 */
export function validateTaskCreation(data) {
  const { title, description } = data || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    return { error: { message: 'Title is required' } };
  }

  if (title.trim().length > 255) {
    return { error: { message: 'Title must not exceed 255 characters' } };
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    return { error: { message: 'Description must be a string' } };
  }

  return { error: null };
}