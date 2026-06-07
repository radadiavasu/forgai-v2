import client from '../api/client.js';

// Auth endpoints
export const authApi = {
  register: (userData) => client.post('/auth/register', userData),
  login: (credentials) => client.post('/auth/login', credentials),
};

// Task endpoints
export const tasksApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams();
    if (params.completed !== undefined) {
      query.set('completed', String(params.completed));
    }
    if (params.page !== undefined) {
      query.set('page', String(params.page));
    }
    if (params.limit !== undefined) {
      query.set('limit', String(params.limit));
    }
    const queryString = query.toString();
    return client.get(`/tasks${queryString ? `?${queryString}` : ''}`);
  },

  getById: (id) => client.get(`/tasks/${id}`),

  create: (taskData) => client.post('/tasks', taskData),

  complete: (id) => client.patch(`/tasks/${id}/complete`, {}),
};