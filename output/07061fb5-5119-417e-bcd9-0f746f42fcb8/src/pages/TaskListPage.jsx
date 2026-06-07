import React, { useEffect, useState, useCallback } from 'react';
import { tasksApi } from '../services/api.js';
import TaskCreateForm from '../components/TaskCreateForm.jsx';

function TaskCard({ task, onComplete, completing }) {
  const isCompleting = completing === task.id;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-800 truncate">{task.title}</h3>
          {task.description && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">{task.description}</p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            Created: {new Date(task.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <button
          onClick={() => onComplete(task.id)}
          disabled={isCompleting}
          className="btn-success flex-shrink-0"
          title="Mark as complete"
        >
          {isCompleting ? (
            <span className="flex items-center gap-1.5">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Completing
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Complete
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export default function TaskListPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [completing, setCompleting] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await tasksApi.getAll({ completed: false });
      const taskList = Array.isArray(data) ? data : (data.tasks || data.data || []);
      setTasks(taskList);
    } catch (err) {
      setError(err.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function handleCreate(taskData) {
    setCreating(true);
    setCreateError('');
    try {
      const newTask = await tasksApi.create(taskData);
      const task = newTask.task || newTask;
      setTasks((prev) => [task, ...prev]);
      setShowForm(false);
      return true;
    } catch (err) {
      setCreateError(err.message || 'Failed to create task.');
      return false;
    } finally {
      setCreating(false);
    }
  }

  async function handleComplete(id) {
    setCompleting(id);
    try {
      await tasksApi.complete(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to complete task.');
    } finally {
      setCompleting(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Active Tasks</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? 'Loading...' : `${tasks.length} task${tasks.length !== 1 ? 's' : ''} remaining`}
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setCreateError('');
          }}
          className="btn-primary"
        >
          {showForm ? '✕ Cancel' : '+ New Task'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Create New Task</h2>
          {createError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {createError}
            </div>
          )}
          <TaskCreateForm onSubmit={handleCreate} loading={creating} />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-3">
          <span>⚠️</span>
          <span>{error}</span>
          <button
            onClick={fetchTasks}
            className="ml-auto text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center py-20">
          <svg className="animate-spin h-8 w-8 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && tasks.length === 0 && (
        <div className="text-center py-20">
          <span className="text-5xl">🎉</span>
          <h3 className="mt-4 text-lg font-semibold text-gray-700">All caught up!</h3>
          <p className="mt-1 text-sm text-gray-400">You have no active tasks. Create one to get started.</p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary mt-4"
            >
              + Create your first task
            </button>
          )}
        </div>
      )}

      {/* Task list */}
      {!loading && tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleComplete}
              completing={completing}
            />
          ))}
        </div>
      )}
    </div>
  );
}