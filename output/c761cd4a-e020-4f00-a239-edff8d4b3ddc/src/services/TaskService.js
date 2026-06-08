const TaskModel = require('../models/Task');

const TaskService = {
  async getAllTasks(isCompleteFilter) {
    return await TaskModel.findAll(isCompleteFilter);
  },

  async createTask({ title, description }) {
    return await TaskModel.create({ title, description });
  },

  async completeTask(id) {
    const task = await TaskModel.findById(id);
    if (!task) {
      return null;
    }
    return await TaskModel.markComplete(id);
  }
};

module.exports = TaskService;