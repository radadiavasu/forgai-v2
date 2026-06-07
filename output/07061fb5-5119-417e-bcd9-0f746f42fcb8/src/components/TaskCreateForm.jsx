import React, { useState } from 'react';

export default function TaskCreateForm({ onSubmit, loading }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});

  function validate() {
    const errs = {};
    if (!title.trim()) errs.title = 'Title is required.';
    if (title.trim().length > 200) errs.title = 'Title must be 200 characters or fewer.';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    const success = await onSubmit({ title: title.trim(), description: description.trim() });
    if (success) {
      setTitle('');
      setDescription('');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="task-title" className="block text-sm font-medium text-gray-700 mb-1">
          Task Title <span className="text-red-500">*</span>
        </label>
        <input
          id="task-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you need to do?"
          className={`input-field ${
            errors.title ? 'border-red-400 focus:ring-red-400' : ''
          }`}
          disabled={loading}
          maxLength={200}
        />
        {errors.title && (
          <p className="mt-1 text-xs text-red-500">{errors.title}</p>
        )}
      </div>

      <div>
        <label htmlFor="task-description" className="block text-sm font-medium text-gray-700 mb-1">
          Description{' '}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add details about this task..."
          rows={3}
          className="input-field resize-none"
          disabled={loading}
        />
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Creating...
            </span>
          ) : (
            '+ Add Task'
          )}
        </button>
      </div>
    </form>
  );
}