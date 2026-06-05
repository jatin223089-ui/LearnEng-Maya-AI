import { Navigate } from 'react-router-dom';
import { useAuth } from './auth';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-stone-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
