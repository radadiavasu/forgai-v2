import React from 'react';

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TaskItem({ task, onMarkComplete, isCompleting }) {
  const isActive = !task.is_complete;

  return (
    <div
      className={[
        'bg-white rounded-xl border p-5 flex items-start gap-4 shadow-sm transition-opacity duration-200',
        isCompleting ? 'opacity-50' : 'opacity-100',
        isActive ? 'border-gray-200' : 'border-green-100 bg-green-50',
      ].join(' ')}
    >
      <div className="mt-0.5">
        {isActive ? (
          <span className="inline-block w-5 h-5 rounded-full border-2 border-indigo-400 bg-white" />
        ) : (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={[
            'text-base font-semibold break-words',
            isActive ? 'text-gray-800' : 'text-gray-500 line-through',
          ].join(' ')}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="text-sm text-gray-500 mt-1 break-words">{task.description}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
          {task.created_at && (
            <span>Created: {formatDate(task.created_at)}</span>
          )}
          {!isActive && task.completed_at && (
            <span className="text-green-600 font-medium">Completed: {formatDate(task.completed_at)}</span>
          )}
        </div>
      </div>
      {isActive && onMarkComplete && (
        <button
          onClick={() => onMarkComplete(task.id)}
          disabled={isCompleting}
          className="flex-shrink-0 ml-2 inline-flex items-center gap-1 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors duration-150"
        >
          {isCompleting ? (
            <>
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Saving...
            </>
          ) : (
            '✓ Complete'
          )}
        </button>
      )}
    </div>
  );
}