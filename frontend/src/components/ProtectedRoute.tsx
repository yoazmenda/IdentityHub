import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getToken } from '../api/client';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!getToken() || !user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
