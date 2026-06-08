import React, { useEffect, useState, useCallback } from 'react';
import CreateTaskForm from '../components/CreateTaskForm.jsx';
import TaskItem from '../components/TaskItem.jsx';
import ApiService from '../services/ApiService.js';

export default function TaskListPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [completingIds, setCompletingIds] = useState(new Set());

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ApiService.getTasks(false);
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCreateTask = async ({ title, description }) => {
    setCreating(true);
    try {
      const newTask = await ApiService.createTask({ title, description });
      setTasks((prev) => [newTask, ...prev]);
    } finally {
      setCreating(false);
    }
  };

  const handleMarkComplete = async (id) => {
    setCompletingIds((prev) => new Set(prev).add(id));
    try {
      await ApiService.completeTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to mark task complete.');
    } finally {
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Active Tasks</h1>
        <p className="text-gray-500 mt-1 text-sm">Manage your pending tasks below.</p>
      </div>

      <CreateTaskForm onCreateTask={handleCreateTask} loading={creating} />

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError('')}
            className="ml-4 text-red-500 hover:text-red-700 font-bold text-lg leading-none"
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="ml-3 text-indigo-500 font-medium">Loading tasks...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-5xl">🎉</span>
          <p className="mt-4 text-gray-500 text-lg">No active tasks! You're all caught up.</p>
          <p className="text-gray-400 text-sm mt-1">Create a new task above to get started.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskItem
                task={task}
                onMarkComplete={handleMarkComplete}
                isCompleting={completingIds.has(task.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}