import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Logo, PageLoader, QrGlyph, Spinner } from '../components/ui';
import { useAuth, useSite } from '../context/AppProviders';
import { usePageTitle } from '../lib/hooks';

export function LoginPage() {
  const { auth, loading, login } = useAuth();
  const { config } = useSite();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  usePageTitle(`Masuk studio — ${config.siteName}`);

  const from = (location.state as { from?: string } | null)?.from || '/admin';

  useEffect(() => {
    if (auth.authenticated) navigate(from, { replace: true });
  }, [auth.authenticated, from, navigate]);

  if (loading) return <PageLoader label="Memeriksa akses studio" />;
  if (auth.authenticated) return <Navigate to={from} replace />;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError('');
    try {
      await login(password);
      navigate(from, { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Tidak bisa masuk. Coba lagi.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="login-panel__top">
          <Logo />
          <Link className="link-quiet" to="/">
            <ArrowLeft size={15} />
            Halaman tamu
          </Link>
        </div>

        <div className="login-form-wrap">
          <p className="eyebrow">Ruang kerja fotografer</p>
          <h1>Masuk ke studio.</h1>
          <p className="login-lede">
            Kelola sesi, bagikan QR, dan lihat semua foto yang masuk dari kamera.
          </p>

          {!auth.configured && (
            <div className="alert alert--warning">
              <ShieldCheck size={18} />
              <span>
                Password admin belum dikonfigurasi di server. Set <code>ADMIN_PASSWORD_HASH</code>{' '}
                atau <code>ADMIN_PASSWORD</code>.
              </span>
            </div>
          )}

          <form className="login-form" onSubmit={onSubmit}>
            <label className="field">
              <span className="field__label">Password admin</span>
              <span className="field__control field__control--password">
                <Lock size={17} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                  autoFocus
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="field__reveal"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn--dark btn--wide" disabled={submitting || !password}>
              {submitting ? <Spinner size={17} /> : <Lock size={16} />}
              {submitting ? 'Memeriksa…' : 'Masuk ke dashboard'}
              {!submitting && <ArrowRight size={17} className="btn__end" />}
            </button>
          </form>

          <p className="login-footnote">
            Halaman ini hanya untuk admin. Tamu membuka galeri lewat QR atau tautan sesi.
          </p>
        </div>

        <p className="login-copyright">
          {config.siteName} Studio · akses terenkripsi
        </p>
      </section>

      <aside className="login-art" aria-hidden="true">
        <div className="login-art__grid" />
        <span className="login-art__index">STUDIO / 01</span>
        <div className="login-art__qr">
          <QrGlyph seed="lensa-admin-login" />
        </div>
        <p className="login-art__quote">
          “Setiap sesi punya
          <br />
          <em>ceritanya sendiri.</em>”
        </p>
        <div className="login-art__meta">
          <span>
            <strong>01</strong> sesi aktif
          </span>
          <span>
            <strong>{config.sessionDurationMinutes}</strong> menit
          </span>
          <span>
            <strong>∞</strong> arsip
          </span>
        </div>
      </aside>
    </div>
  );
}
