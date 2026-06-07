import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import authService from '../services/authService.js';

export default function NavigationBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = authService.getUser();

  function handleLogout() {
    authService.logout();
    navigate('/login', { replace: true });
  }

  function isActive(path) {
    return location.pathname === path;
  }

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary-600">✅ TaskManager</span>
        </div>

        <nav className="flex items-center gap-1">
          <Link
            to="/tasks"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive('/tasks')
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            Active Tasks
          </Link>
          <Link
            to="/history"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive('/history')
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            History
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-gray-500 hidden sm:block">
              👤{' '}
              <span className="font-medium text-gray-700">
                {user.username || user.email}
              </span>
            </span>
          )}
          <button
            onClick={handleLogout}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}