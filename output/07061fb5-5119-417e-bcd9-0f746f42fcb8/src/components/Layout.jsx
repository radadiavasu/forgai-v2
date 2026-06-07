import React from 'react';
import NavigationBar from './NavigationBar.jsx';
import authService from '../services/authService.js';

export default function Layout({ children }) {
  const isAuthenticated = authService.isAuthenticated();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {isAuthenticated && <NavigationBar />}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} Personal Task Manager
      </footer>
    </div>
  );
}