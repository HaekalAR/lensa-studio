import { LogOut, QrCode } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo, useToast } from '../components/ui';
import { useAuth } from '../context/AppProviders';

export function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const handleLogout = async () => {
    await logout();
    toast.info('Kamu sudah keluar dari studio.');
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="admin-shell">
      <header className="admin-nav">
        <div className="admin-nav__inner">
          <Logo to="/admin" />
          <nav className="admin-nav__links" aria-label="Navigasi admin">
            <NavLink
              to="/admin"
              end
              className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
            >
              Dasbor
            </NavLink>
            <NavLink
              to="/admin/sessions"
              className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
            >
              Arsip sesi
            </NavLink>
          </nav>
          <div className="admin-nav__right">
            <span className="admin-nav__badge">
              <QrCode size={14} />
              Studio
            </span>
            <button
              type="button"
              className="icon-btn icon-btn--bordered"
              onClick={handleLogout}
              aria-label="Keluar"
              title="Keluar"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <Outlet />
      </main>

      <footer className="admin-footer">
        <span>Lensa Studio · dashboard privat</span>
        <span>Foto disimpan aman dan hanya dibagikan lewat QR sesi.</span>
      </footer>
    </div>
  );
}
