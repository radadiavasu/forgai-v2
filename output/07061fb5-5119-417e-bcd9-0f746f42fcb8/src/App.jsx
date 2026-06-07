import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import TaskListPage from './pages/TaskListPage.jsx';
import TaskHistoryPage from './pages/TaskHistoryPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import AuthGuard from './components/AuthGuard.jsx';
import Layout from './components/Layout.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/tasks"
          element={
            <AuthGuard>
              <Layout>
                <TaskListPage />
              </Layout>
            </AuthGuard>
          }
        />
        <Route
          path="/history"
          element={
            <AuthGuard>
              <Layout>
                <TaskHistoryPage />
              </Layout>
            </AuthGuard>
          }
        />
        <Route path="/" element={<Navigate to="/tasks" replace />} />
        <Route
          path="*"
          element={
            <Layout>
              <NotFoundPage />
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}