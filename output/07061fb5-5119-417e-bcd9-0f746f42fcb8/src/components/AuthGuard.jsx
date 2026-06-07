import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import authService from '../services/authService.js';

export default function AuthGuard({ children }) {
  const location = useLocation();
  const isAuthenticated = authService.isAuthenticated();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}