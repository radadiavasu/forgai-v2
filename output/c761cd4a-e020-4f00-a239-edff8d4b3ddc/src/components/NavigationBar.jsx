import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function NavigationBar() {
  const location = useLocation();

  const linkClasses = (path) =>
    [
      'px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150',
      location.pathname === path
        ? 'bg-indigo-600 text-white shadow'
        : 'text-indigo-700 hover:bg-indigo-100',
    ].join(' ');

  return (
    <header className="bg-white shadow-sm">
      <nav className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✅</span>
          <span className="text-xl font-bold text-indigo-700 tracking-tight">
            Task Manager
          </span>
        </div>
        <div className="flex gap-2">
          <Link to="/" className={linkClasses('/')}>
            Active Tasks
          </Link>
          <Link to="/history" className={linkClasses('/history')}>
            History
          </Link>
        </div>
      </nav>
    </header>
  );
}