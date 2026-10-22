import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageLoader } from '../components/ui';
import { useAuth } from '../context/AppProviders';

export function ProtectedRoute() {
  const { auth, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader label="Memeriksa akses studio" />;
  if (!auth.authenticated) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <Outlet />;
}
