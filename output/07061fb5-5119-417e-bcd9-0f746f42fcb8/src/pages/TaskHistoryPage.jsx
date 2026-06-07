import React, { useEffect, useState, useCallback } from 'react';
import { tasksApi } from '../services/api.js';

const PAGE_SIZE = 10;

function CompletedTaskCard({ task }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm opacity-80 hover:opacity-100 transition-opacity">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-0.5">
          <span className="inline-flex items-center justify-center w-7 h-7 bg-green-100 text-green-600 rounded-full text-base">✓</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-700 line-through decoration-gray-400 truncate">
            {task.title}
          </h3>
          {task.description && (
            <p className="mt-1 text-sm text-gray-400 line-clamp-2">{task.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
            <span>
              Created:{' '}
              {new Date(task.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            {task.completed_at && (
              <span className="text-green-600 font-medium">
                Completed:{' '}
                {new Date(task.completed_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TaskHistoryPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchHistory = useCallback(async (pageNum) => {
    setLoading(true);
    setError('');
    try {
      const data = await tasksApi.getAll({
        completed: true,
        page: pageNum,
        limit: PAGE_SIZE,
      });

      // Handle different response shapes
      let taskList = [];
      let total = 0;
      let pages = 1;

      if (Array.isArray(data)) {
        taskList = data;
        total = data.length;
        pages = 1;
      } else if (data && Array.isArray(data.tasks)) {
        taskList = data.tasks;
        total = data.total || data.totalCount || data.count || data.tasks.length;
        pages = data.totalPages || data.pages || Math.ceil(total / PAGE_SIZE) || 1;
      } else if (data && Array.isArray(data.data)) {
        taskList = data.data;
        total = data.total || data.totalCount || data.count || data.data.length;
        pages = data.totalPages || data.pages || Math.ceil(total / PAGE_SIZE) || 1;
      }

      setTasks(taskList);
      setTotalCount(total);
      setTotalPages(Math.max(1, pages));
    } catch (err) {
      setError(err.message || 'Failed to load task history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

  function handlePrev() {
    if (page > 1) setPage((p) => p - 1);
  }

  function handleNext() {
    if (page < totalPages) setPage((p) => p + 1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Task History</h1>
        <p className="mt-1 text-sm text-gray-500">
          {loading
            ? 'Loading...'
            : `${totalCount} completed task${totalCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-3">
          <span>⚠️</span>
          <span>{error}</span>
          <button
            onClick={() => fetchHistory(page)}
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
          <span className="text-5xl">📋</span>
          <h3 className="mt-4 text-lg font-semibold text-gray-700">No completed tasks yet</h3>
          <p className="mt-1 text-sm text-gray-400">
            Complete your first task and it will appear here.
          </p>
        </div>
      )}

      {/* Task list */}
      {!loading && tasks.length > 0 && (
        <>
          <div className="space-y-3">
            {tasks.map((task) => (
              <CompletedTaskCard key={task.id} task={task} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handlePrev}
                disabled={page <= 1}
                className="btn-secondary"
              >
                ← Previous
              </button>
              <span className="text-sm text-gray-500">
                Page <span className="font-medium">{page}</span> of{' '}
                <span className="font-medium">{totalPages}</span>
              </span>
              <button
                onClick={handleNext}
                disabled={page >= totalPages}
                className="btn-secondary"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}