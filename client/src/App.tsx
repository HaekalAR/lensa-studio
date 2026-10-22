import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastProvider } from './components/ui';
import { AuthProvider, SiteProvider } from './context/AppProviders';
import { AdminLayout } from './pages/AdminLayout';
import { ArchivePage } from './pages/ArchivePage';
import { DashboardPage } from './pages/DashboardPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PublicSessionPage } from './pages/PublicSessionPage';
import { SessionDetailPage } from './pages/SessionDetailPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <SiteProvider>
        <AuthProvider>
          <ToastProvider>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/s/:token" element={<PublicSessionPage />} />
              <Route path="/admin/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="sessions" element={<ArchivePage />} />
                  <Route path="sessions/:id" element={<SessionDetailPage />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </SiteProvider>
    </BrowserRouter>
  );
}
