import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Cloud,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Images,
  Plus,
  QrCode,
  RefreshCw,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { QrCodeSvg, downloadQrSvg } from '../components/QrCode';
import { SessionRow } from '../components/SessionRow';
import {
  ConfirmDialog,
  CopyButton,
  PageLoader,
  QrGlyph,
  Spinner,
  useToast,
} from '../components/ui';
import { useCountdown, usePageTitle } from '../lib/hooks';
import {
  formatBytes,
  formatCountdown,
  formatDateLong,
  formatRelative,
  formatTime,
} from '../lib/format';
import { useSite } from '../context/AppProviders';
import type { AdminSession, Overview, SessionSummary } from '../types';

function ActivePanel({
  session,
  timezone,
  fresh,
  onEnd,
}: {
  session: AdminSession;
  timezone: string;
  fresh: boolean;
  onEnd: () => void;
}) {
  const { remaining } = useCountdown(session.endsAt, session.serverNow);
  const latest = session.photos.slice(-6).reverse();
  const qrRef = useRef<SVGSVGElement>(null);

  return (
    <section id="active-session" className={`active-card ${fresh ? 'is-fresh' : ''}`}>
      <div className="active-card__main">
        <div className="active-card__topline">
          <span className="live-label">
            <span className="live-label__dot" />
            Sesi aktif
          </span>
          <span className="active-card__clock">
            <Timer size={14} />
            {formatCountdown(remaining)} tersisa
          </span>
        </div>

        <h2>{session.title}</h2>
        <p className="active-card__lede">
          QR di samping bisa dipindai siapa saja. Foto dari folder kamera akan masuk otomatis
          ke sesi ini.
        </p>

        <div className="active-card__numbers">
          <div>
            <strong>{session.photoCount}</strong>
            <span>foto masuk</span>
          </div>
          <div>
            <strong>{formatTime(session.startedAt, timezone)}</strong>
            <span>mulai</span>
          </div>
          <div>
            <strong>{formatTime(session.endsAt, timezone)}</strong>
            <span>selesai</span>
          </div>
        </div>

        <div className="active-card__actions">
          <CopyButton
            text={session.publicUrl}
            label="Salin tautan"
            className="btn btn--light"
          />
          <a
            className="btn btn--outline-light"
            href={session.publicUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            Buka galeri
          </a>
          <Link className="btn btn--outline-light" to={`/admin/sessions/${session.id}`}>
            Detail sesi
            <ArrowRight size={16} />
          </Link>
          <button type="button" className="btn btn--danger-ghost" onClick={onEnd}>
            Akhiri sesi
          </button>
        </div>
      </div>

      <div className="active-card__qr">
        <div className="qr-ticket">
          <div className="qr-ticket__head">
            <span>PINDAI UNTUK MEMBUKA</span>
            <QrCode size={14} />
          </div>
          <QrCodeSvg ref={qrRef} value={session.publicUrl} />
          <p>{session.publicUrl.replace(/^https?:\/\//, '')}</p>
        </div>
        <button
          type="button"
          className="active-card__qrlink"
          onClick={() => downloadQrSvg(qrRef.current, `qr-${session.publicToken}.svg`)}
        >
          Unduh QR untuk dicetak
        </button>
      </div>

      <div className="active-card__strip">
        <div className="active-card__strip-head">
          <span>
            <Camera size={15} />
            Jepretan terbaru
          </span>
          <Link to={`/admin/sessions/${session.id}`}>
            Semua foto <ArrowRight size={14} />
          </Link>
        </div>
        {latest.length ? (
          <div className="active-strip">
            {latest.map((photo) => (
              <Link
                key={photo.id}
                to={`/admin/sessions/${session.id}`}
                className="active-strip__item"
                title={photo.filename}
              >
                <img src={photo.thumbUrl} alt={photo.filename} loading="lazy" />
              </Link>
            ))}
            <div className="active-strip__more">
              <strong>{session.photoCount}</strong>
              <span>foto</span>
            </div>
          </div>
        ) : (
          <div className="active-strip__empty">
            <span className="waiting-dot" />
            Menunggu foto pertama dari kamera…
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyActive({
  onCreate,
  creating,
  durationMinutes,
}: {
  onCreate: () => void;
  creating: boolean;
  durationMinutes: number;
}) {
  return (
    <section className="no-session" id="active-session">
      <div className="no-session__copy">
        <span className="eyebrow">Ruang sesi</span>
        <h2>Belum ada sesi yang berjalan.</h2>
        <p>
          Mulai sesi baru, lalu tunjukkan QR ke orang yang sedang kamu foto. Galeri mereka
          langsung siap — bahkan sebelum foto pertama masuk.
        </p>
        <button type="button" className="btn btn--accent" onClick={onCreate} disabled={creating}>
          {creating ? <Spinner size={17} /> : <Plus size={17} />}
          {creating ? 'Menyiapkan sesi…' : 'Mulai sesi baru'}
        </button>
        <small>
          Sesi otomatis selesai setelah {durationMinutes} menit. Bisa diakhiri lebih cepat.
        </small>
      </div>
      <div className="no-session__visual" aria-hidden="true">
        <div className="no-session__qr">
          <QrGlyph seed="lensa-empty-session" />
        </div>
        <div className="no-session__tag">
          <span />
          QR dibuat saat sesi mulai
        </div>
      </div>
    </section>
  );
}

export function DashboardPage() {
  const { config } = useSite();
  const toast = useToast();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [conflict, setConflict] = useState<SessionSummary | null>(null);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [fresh, setFresh] = useState(false);
  const freshTimer = useRef<number | null>(null);

  usePageTitle(`Dasbor — ${config.siteName}`);
  const timezone = overview?.config.timezone || config.timezone;
  const active = overview?.activeSession || null;

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await api.overview();
      setOverview(data);
      setError('');
    } catch (requestError) {
      if (!silent) {
        setError(requestError instanceof Error ? requestError.message : 'Gagal memuat dasbor.');
      }
    } finally {
      if (!silent) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const { expired } = useCountdown(active?.endsAt, active?.serverNow);
  useEffect(() => {
    if (expired && active?.status === 'live') refresh(true);
  }, [active?.status, expired, refresh]);

  useEffect(
    () => () => {
      if (freshTimer.current) window.clearTimeout(freshTimer.current);
    },
    [],
  );

  const createNow = async (endSessionId?: string) => {
    setCreating(true);
    try {
      if (endSessionId) {
        await api.endSession(endSessionId);
      }
      const result = await api.createSession();
      toast.success(result.message);
      setFresh(true);
      if (freshTimer.current) window.clearTimeout(freshTimer.current);
      freshTimer.current = window.setTimeout(() => setFresh(false), 5000);
      await refresh(true);
      window.setTimeout(() => {
        document.getElementById('active-session')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 120);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'active_session_exists') {
        const payload = requestError.payload.activeSession as SessionSummary | undefined;
        if (payload) setConflict(payload);
        else await refresh(true);
      } else {
        toast.error(requestError instanceof Error ? requestError.message : 'Gagal membuat sesi.');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleNew = () => {
    if (active) {
      setConflict({
        ...active,
        photos: undefined,
      } as unknown as SessionSummary);
      return;
    }
    createNow();
  };

  const handleEnd = async () => {
    if (!active) return;
    setEnding(true);
    try {
      const result = await api.endSession(active.id);
      toast.success(result.message);
      setConfirmEnd(false);
      await refresh(true);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Gagal mengakhiri sesi.');
    } finally {
      setEnding(false);
    }
  };

  if (loading) return <PageLoader label="Memuat ruang kerja" />;

  if (error && !overview) {
    return (
      <div className="admin-page admin-page--narrow">
        <div className="panel-error">
          <span className="panel-error__icon">
            <WifiOff size={20} />
          </span>
          <h1>Dashboard tidak bisa dimuat</h1>
          <p>{error}</p>
          <button type="button" className="btn btn--dark" onClick={() => refresh()}>
            <RefreshCw size={16} />
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  if (!overview) return <PageLoader label="Memuat ruang kerja" />;

  return (
    <div className="admin-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Dasbor studio</p>
          <h1>Sesi foto</h1>
          <p className="page-head__sub">
            {formatDateLong(new Date(), timezone)} · {overview.uploader.online ? 'uploader siap' : 'uploader belum terhubung'}
          </p>
        </div>
        <div className="page-head__actions">
          <button
            type="button"
            className="btn btn--ghost btn--icon-text"
            onClick={() => refresh()}
            disabled={refreshing}
            title="Muat ulang"
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Memuat' : 'Muat ulang'}
          </button>
          <button type="button" className="btn btn--dark" onClick={handleNew} disabled={creating}>
            {creating ? <Spinner size={17} /> : <Plus size={17} />}
            {creating ? 'Menyiapkan…' : 'New Session'}
          </button>
        </div>
      </div>

      {active ? (
        <ActivePanel
          session={active}
          timezone={timezone}
          fresh={fresh}
          onEnd={() => setConfirmEnd(true)}
        />
      ) : (
        <EmptyActive
          onCreate={handleNew}
          creating={creating}
          durationMinutes={overview.config.sessionDurationMinutes}
        />
      )}

      <div className="stat-grid">
        <article className="stat-card">
          <span className="stat-card__icon">
            <FolderOpen size={17} />
          </span>
          <span className="stat-card__label">Total sesi</span>
          <strong>{overview.stats.totalSessions}</strong>
          <span className="stat-card__note">tersimpan di arsip</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__icon">
            <Images size={17} />
          </span>
          <span className="stat-card__label">Total foto</span>
          <strong>{overview.stats.totalPhotos}</strong>
          <span className="stat-card__note">{formatBytes(overview.stats.totalBytes)} terpakai</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__icon">
            {overview.storage.mode === 'r2' ? <Cloud size={17} /> : <HardDrive size={17} />}
          </span>
          <span className="stat-card__label">Penyimpanan</span>
          <strong className="stat-card__text">
            {overview.storage.mode === 'r2' ? 'Cloudflare R2' : 'Lokal'}
          </strong>
          <span className="stat-card__note">
            {overview.storage.mode === 'r2' ? overview.storage.bucket : 'folder data/uploads'}
          </span>
        </article>
        <article className={`stat-card stat-card--uploader ${overview.uploader.online ? 'is-online' : ''}`}>
          <span className="stat-card__icon">
            {overview.uploader.online ? <Wifi size={17} /> : <WifiOff size={17} />}
          </span>
          <span className="stat-card__label">Uploader folder</span>
          <strong className="stat-card__text">
            {overview.uploader.online ? 'Terhubung' : 'Offline'}
          </strong>
          <span className="stat-card__note">
            {overview.uploader.online
              ? `${overview.uploader.agentName || 'Laptop'} · ${formatRelative(
                  overview.uploader.lastSeenAt,
                  timezone,
                )}`
              : 'Jalankan start-watcher.cmd di laptop'}
          </span>
        </article>
      </div>

      <section className="recent-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Arsip</p>
            <h2>Folder sesi terbaru</h2>
          </div>
          <Link className="link-arrow" to="/admin/sessions">
            Lihat semua sesi
            <ArrowRight size={15} />
          </Link>
        </div>

        {overview.recentSessions.length ? (
          <div className="session-list">
            {overview.recentSessions.map((session) => (
              <SessionRow key={session.id} session={session} timezone={timezone} />
            ))}
          </div>
        ) : (
          <div className="tiny-empty">
            <FolderOpen size={22} />
            <p>Belum ada sesi di arsip. Sesi pertamamu akan muncul di sini.</p>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmEnd}
        title="Akhiri sesi ini?"
        description="QR lama tetap bisa membuka galeri untuk melihat dan mengunduh foto, tetapi sesi berhenti menerima foto baru."
        confirmLabel="Ya, akhiri sesi"
        danger
        loading={ending}
        onConfirm={handleEnd}
        onCancel={() => setConfirmEnd(false)}
      />

      <ConfirmDialog
        open={Boolean(conflict)}
        title="Masih ada sesi aktif"
        description={`Sesi “${conflict?.title || 'aktif'}” masih berjalan. Akhiri sesi itu dulu, lalu buat sesi baru? QR sesi lama tetap bisa dibuka.`}
        confirmLabel="Akhiri & mulai baru"
        danger
        loading={creating}
        onConfirm={() => {
          const id = conflict?.id;
          setConflict(null);
          if (id) createNow(id);
        }}
        onCancel={() => setConflict(null)}
      />

      {error && overview && (
        <div className="inline-error">
          <WifiOff size={15} />
          {error}
        </div>
      )}
    </div>
  );
}
