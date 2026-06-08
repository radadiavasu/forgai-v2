import React from 'react';
import { Outlet } from 'react-router-dom';
import NavigationBar from './NavigationBar.jsx';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavigationBar />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        <Outlet />
      </main>
      <footer className="text-center text-sm text-gray-400 py-4 border-t border-gray-200">
        &copy; {new Date().getFullYear()} Personal Task Manager
      </footer>
    </div>
  );
}