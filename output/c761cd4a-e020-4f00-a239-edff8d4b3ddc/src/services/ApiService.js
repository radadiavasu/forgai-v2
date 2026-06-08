import apiClient from '../api/client.js';

const ApiService = {
  /**
   * Fetch tasks filtered by completion status.
   * @param {boolean} isComplete - true for completed tasks, false for active
   */
  async getTasks(isComplete) {
    const query = isComplete !== undefined ? `?is_complete=${isComplete}` : '';
    return apiClient.get(`/tasks${query}`);
  },

  /**
   * Create a new task.
   * @param {{ title: string, description?: string }} taskData
   */
  async createTask(taskData) {
    return apiClient.post('/tasks', taskData);
  },

  /**
   * Mark a task as complete.
   * @param {number|string} id - task ID
   */
  async completeTask(id) {
    return apiClient.patch(`/tasks/${id}/complete`);
  },
};

export default ApiService;