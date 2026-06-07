import React from 'react';
import { Link } from 'react-router-dom';
import authService from '../services/authService.js';

export default function NotFoundPage() {
  const isAuthenticated = authService.isAuthenticated();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <span className="text-7xl font-extrabold text-gray-200">404</span>
      <h1 className="mt-4 text-2xl font-bold text-gray-800">Page Not Found</h1>
      <p className="mt-2 text-gray-500 max-w-sm">
        Sorry, we couldn't find the page you're looking for. It may have been moved or doesn't exist.
      </p>
      <div className="mt-6">
        {isAuthenticated ? (
          <Link to="/tasks" className="btn-primary">
            ← Back to Tasks
          </Link>
        ) : (
          <Link to="/login" className="btn-primary">
            ← Go to Login
          </Link>
        )}
      </div>
    </div>
  );
}