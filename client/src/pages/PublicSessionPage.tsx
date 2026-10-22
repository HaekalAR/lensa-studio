import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Images,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import {
  formatCountdown,
  formatDateLong,
  formatDateTime,
  formatTime,
} from '../lib/format';
import { useCountdown, usePageTitle } from '../lib/hooks';
import { useSite } from '../context/AppProviders';
import type { Photo, PublicSession } from '../types';
import { ErrorState, Logo, StatusPill } from '../components/ui';

function Lightbox({
  photos,
  index,
  onClose,
  onChange,
}: {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onChange: (index: number) => void;
}) {
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasPrev) onChange(index - 1);
      if (event.key === 'ArrowRight' && hasNext) onChange(index + 1);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [hasNext, hasPrev, index, onChange, onClose]);

  if (!photo) return null;

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Lihat foto">
      <div className="lightbox__top">
        <span className="lightbox__counter">
          {String(index + 1).padStart(2, '0')} <span>/</span>{' '}
          {String(photos.length).padStart(2, '0')}
        </span>
        <div className="lightbox__actions">
          <a className="btn btn--light btn--sm" href={photo.downloadUrl}>
            <Download size={15} />
            Unduh
          </a>
          <button type="button" className="icon-btn icon-btn--light" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="lightbox__stage" onClick={onClose} role="presentation">
        <img
          key={photo.id}
          src={photo.previewUrl}
          alt={photo.filename}
          onClick={(event) => event.stopPropagation()}
        />
        {hasPrev && (
          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            onClick={(event) => {
              event.stopPropagation();
              onChange(index - 1);
            }}
            aria-label="Foto sebelumnya"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            onClick={(event) => {
              event.stopPropagation();
              onChange(index + 1);
            }}
            aria-label="Foto berikutnya"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      <div className="lightbox__bottom">
        <span>{photo.filename}</span>
        <span>
          {photo.width} × {photo.height} px
        </span>
      </div>
    </div>,
    document.body,
  );
}

function PublicSkeleton() {
  return (
    <div className="public-page">
      <div className="public-header">
        <Logo tone="light" />
      </div>
      <div className="public-skeleton">
        <span className="skeleton skeleton--line" />
        <span className="skeleton skeleton--title" />
        <span className="skeleton skeleton--meta" />
        <div className="public-skeleton__grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <span className="skeleton skeleton--photo" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PublicSessionPage() {
  const { token = '' } = useParams();
  const { config } = useSite();
  const [session, setSession] = useState<PublicSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const sessionRef = useRef<PublicSession | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getPublicSession(token);
      sessionRef.current = data;
      setSession(data);
      setError(null);
    } catch (requestError) {
      const apiError = requestError instanceof ApiError ? requestError : null;
      if (!sessionRef.current) {
        setError({
          status: apiError?.status || 500,
          message:
            apiError?.status === 404
              ? 'QR ini tidak valid, atau sesinya sudah tidak tersedia.'
              : 'Galeri sedang tidak bisa dimuat. Coba muat ulang halaman ini.',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    sessionRef.current = null;
    setSession(null);
    setError(null);
    setLightboxIndex(null);
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!session || session.status !== 'live') return undefined;
    const poll = window.setInterval(load, 3000);
    return () => window.clearInterval(poll);
  }, [load, session?.status]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const { remaining, expired } = useCountdown(session?.endsAt, session?.serverNow);

  useEffect(() => {
    if (expired && session?.status === 'live') {
      setSession((current) => (current ? { ...current, status: 'ended' } : current));
      load();
    }
  }, [expired, load, session?.status]);

  usePageTitle(
    session ? `${session.title} — ${config.siteName}` : `Galeri sesi — ${config.siteName}`,
  );

  const photos = session?.photos || [];
  const currentIndex = lightboxIndex !== null ? Math.min(lightboxIndex, photos.length - 1) : null;
  const isEmpty = !loading && !error && photos.length === 0;
  const galleryNote = useMemo(() => {
    if (!session) return '';
    if (session.status === 'live') {
      return 'Galeri ini diperbarui otomatis. Foto baru akan muncul tanpa perlu memuat ulang.';
    }
    return 'Sesi telah selesai. Semua foto tetap tersimpan dan bisa diunduh.';
  }, [session]);

  if (loading && !session) return <PublicSkeleton />;

  if (error) {
    return (
      <div className="public-page public-page--center">
        <header className="public-header public-header--simple">
          <Logo tone="light" />
        </header>
        <ErrorState
          title={error.status === 404 ? 'Galeri tidak ditemukan' : 'Gagal memuat galeri'}
          message={error.message}
          action={
            <Link className="btn btn--light" to="/">
              Ke halaman utama
            </Link>
          }
        />
      </div>
    );
  }

  if (!session) return <PublicSkeleton />;

  return (
    <div className="public-page">
      <header className="public-header">
        <Logo tone="light" />
        <div className="public-header__meta">
          <span className="public-header__private">
            <ShieldCheck size={14} />
            Privat
          </span>
          <StatusPill status={session.status} />
        </div>
      </header>

      <main className="public-main">
        <section className="public-hero">
          <div className="public-hero__copy">
            <p className="eyebrow eyebrow--accent">
              <span className="eyebrow__line" />
              Galeri sesi foto
            </p>
            <h1>{session.title}</h1>
            <div className="public-meta">
              <span>
                <CalendarDays size={16} />
                {formatDateLong(session.startedAt, config.timezone)}
              </span>
              <span>
                <Clock size={16} />
                {formatTime(session.startedAt, config.timezone)}
              </span>
              <span>
                <Images size={16} />
                {photos.length || session.photoCount} foto
              </span>
            </div>
          </div>

          <div className={`public-timer ${session.status === 'live' ? 'is-live' : ''}`}>
            <span className="public-timer__label">
              {session.status === 'live' ? 'Sesi berakhir dalam' : 'Sesi selesai'}
            </span>
            <strong>
              {session.status === 'live'
                ? formatCountdown(remaining)
                : session.endedAt
                  ? formatTime(session.endedAt, config.timezone)
                  : '—'}
            </strong>
            <span className="public-timer__sub">
              {session.status === 'live'
                ? 'Foto tetap bisa diakses setelah sesi selesai'
                : 'Galeri tetap dapat dibuka kapan saja'}
            </span>
          </div>
        </section>

        <div className={`public-banner ${session.status === 'live' ? 'public-banner--live' : ''}`}>
          <span className="public-banner__icon">
            {session.status === 'live' ? <Camera size={17} /> : <ShieldCheck size={17} />}
          </span>
          <span>{galleryNote}</span>
        </div>

        {isEmpty ? (
          <div className="public-empty">
            <span className="public-empty__aperture">
              <Camera size={30} strokeWidth={1.3} />
            </span>
            <p className="eyebrow">Menunggu foto pertama</p>
            <h2>{session.status === 'live' ? 'Kamera sedang bekerja.' : 'Belum ada foto di sesi ini.'}</h2>
            <p>
              {session.status === 'live'
                ? 'Biarkan halaman ini terbuka. Setiap jepretan akan muncul di sini secara otomatis.'
                : 'Hubungi fotografer jika kamu mengharapkan foto di sesi ini.'}
            </p>
            {session.status === 'live' && (
              <span className="public-empty__pulse">
                <span />
                Menunggu kiriman dari kamera
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="gallery-head">
              <span>
                {photos.length} foto · {session.status === 'live' ? 'terus diperbarui' : 'sesi selesai'}
              </span>
              <span className="gallery-head__hint">Ketuk foto untuk memperbesar</span>
            </div>
            <div
              className={`photo-grid ${
                photos.length <= 2 || photos.length === 4 ? 'photo-grid--wide' : ''
              }`}
            >
              {photos.map((photo, index) => (
                <button
                  type="button"
                  className="photo-card"
                  key={photo.id}
                  onClick={() => setLightboxIndex(index)}
                >
                  <img
                    src={photo.thumbUrl}
                    alt={`Foto ${index + 1} — ${session.title}`}
                    loading={index < 4 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                  <span className="photo-card__scrim" />
                  <span className="photo-card__number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="photo-card__action">
                    <Download size={15} />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {photos.length > 0 && (
          <div className="public-endnote">
            <span>{session.status === 'live' ? 'Sesi masih berlangsung' : 'Sesi selesai'}</span>
            <p>
              {session.status === 'live'
                ? `Berakhir pukul ${formatTime(session.endsAt, config.timezone)}. Setelah itu semua foto tetap bisa dibuka.`
                : `Diakhiri ${session.endedAt ? formatDateTime(session.endedAt, config.timezone) : '—'}.`}
            </p>
          </div>
        )}
      </main>

      <footer className="public-footer">
        <span>{config.siteName} · Galeri sesi privat</span>
        <span className="public-footer__note">Simpan tautan ini untuk membuka galeri kembali.</span>
      </footer>

      {currentIndex !== null && (
        <Lightbox
          photos={photos}
          index={currentIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  );
}
