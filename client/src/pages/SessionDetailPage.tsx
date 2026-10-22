import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FolderOpen,
  ImageOff,
  Images,
  Pencil,
  QrCode,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { QrCodeSvg, downloadQrSvg } from '../components/QrCode';
import {
  ConfirmDialog,
  CopyButton,
  Modal,
  PageLoader,
  Spinner,
  StatusPill,
  useToast,
} from '../components/ui';
import {
  formatBytes,
  formatCountdown,
  formatDateLong,
  formatDateTime,
  formatDuration,
  formatTime,
} from '../lib/format';
import { useCountdown, usePageTitle } from '../lib/hooks';
import { useSite } from '../context/AppProviders';
import type { AdminPhoto, AdminSession } from '../types';

function DetailLightbox({
  photos,
  index,
  onClose,
  onChange,
}: {
  photos: AdminPhoto[];
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
            Unduh asli
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
          {photo.width} × {photo.height} px · {formatBytes(photo.sizeBytes)}
        </span>
      </div>
    </div>,
    document.body,
  );
}

export function SessionDetailPage() {
  const { id = '' } = useParams();
  const { config } = useSite();
  const toast = useToast();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const sessionRef = useRef<AdminSession | null>(null);
  const qrRef = useRef<SVGSVGElement>(null);

  usePageTitle(session ? `${session.title} — ${config.siteName}` : `Sesi — ${config.siteName}`);
  const timezone = config.timezone;

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await api.getSession(id);
        sessionRef.current = data.session;
        setSession(data.session);
        setError(null);
      } catch (requestError) {
        if (!sessionRef.current) {
          const apiError = requestError instanceof ApiError ? requestError : null;
          setError({
            status: apiError?.status || 500,
            message:
              apiError?.status === 404
                ? 'Sesi ini tidak ditemukan atau sudah dihapus.'
                : 'Detail sesi tidak bisa dimuat.',
          });
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    sessionRef.current = null;
    setSession(null);
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (session?.status !== 'live') return undefined;
    const timer = window.setInterval(() => load(true), 4500);
    return () => window.clearInterval(timer);
  }, [load, session?.status]);

  const { remaining, expired } = useCountdown(session?.endsAt, session?.serverNow);
  useEffect(() => {
    if (expired && session?.status === 'live') load(true);
  }, [expired, load, session?.status]);

  const totalBytes = useMemo(
    () => (session?.photos || []).reduce((sum, photo) => sum + (photo.sizeBytes || 0), 0),
    [session?.photos],
  );

  const openEdit = () => {
    if (!session) return;
    setEditTitle(session.title);
    setEditNote(session.note || '');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!session) return;
    if (!editTitle.trim()) {
      toast.error('Judul sesi tidak boleh kosong.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.updateSession(session.id, {
        title: editTitle.trim(),
        note: editNote.trim(),
      });
      setSession(result.session);
      sessionRef.current = result.session;
      setEditOpen(false);
      toast.success(result.message);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  const endSession = async () => {
    if (!session) return;
    setEnding(true);
    try {
      const result = await api.endSession(session.id);
      setSession(result.session);
      sessionRef.current = result.session;
      setConfirmEnd(false);
      toast.success(result.message);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Gagal mengakhiri sesi.');
    } finally {
      setEnding(false);
    }
  };

  const deletePhoto = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await api.deletePhoto(deleteTarget.id);
      setSession((current) =>
        current
          ? {
              ...current,
              photos: current.photos.filter((photo) => photo.id !== deleteTarget.id),
              photoCount: Math.max(0, current.photoCount - 1),
            }
          : current,
      );
      setDeleteTarget(null);
      setLightboxIndex(null);
      toast.success(result.message);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Gagal menghapus foto.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !session) return <PageLoader label="Membuka folder sesi" />;

  if (error || !session) {
    return (
      <div className="admin-page admin-page--narrow">
        <div className="panel-error">
          <span className="panel-error__icon">
            <FolderOpen size={20} />
          </span>
          <h1>{error?.status === 404 ? 'Sesi tidak ditemukan' : 'Gagal membuka sesi'}</h1>
          <p>{error?.message || 'Sesi ini tidak tersedia.'}</p>
          <Link className="btn btn--dark" to="/admin/sessions">
            <ArrowLeft size={16} />
            Kembali ke arsip
          </Link>
        </div>
      </div>
    );
  }

  const end = session.endedAt || session.endsAt;
  const durationEnd =
    session.status === 'live' ? new Date().toISOString() : session.endedAt || session.endsAt;
  const photos = session.photos;
  const currentIndex = lightboxIndex !== null ? Math.min(lightboxIndex, photos.length - 1) : null;

  return (
    <div className="admin-page detail-page">
      <Link className="back-link" to="/admin/sessions">
        <ArrowLeft size={16} />
        Arsip sesi
      </Link>

      <div className="detail-head">
        <div className="detail-head__copy">
          <p className="eyebrow">
            Folder sesi {session.status === 'live' ? '· sedang berjalan' : '· tersimpan'}
          </p>
          <h1>{session.title}</h1>
          <div className="detail-head__meta">
            <StatusPill status={session.status} />
            <span>
              <CalendarDays size={15} />
              {formatDateLong(session.startedAt, timezone)}
            </span>
            <span>
              <Clock size={15} />
              {formatTime(session.startedAt, timezone)} – {formatTime(end, timezone)}
            </span>
            <span>
              <Images size={15} />
              {session.photoCount} foto
            </span>
          </div>
        </div>
        <div className="detail-head__actions">
          <button type="button" className="btn btn--ghost" onClick={openEdit}>
            <Pencil size={16} />
            Ubah detail
          </button>
          <a
            className="btn btn--light-dark"
            href={session.publicUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            Buka galeri publik
          </a>
        </div>
      </div>

      {session.status === 'live' && (
        <div className="detail-livebar">
          <span className="live-label">
            <span className="live-label__dot" />
            Sesi aktif
          </span>
          <span>
            <Timer size={15} />
            Berakhir dalam {formatCountdown(remaining)}
          </span>
          <span className="detail-livebar__note">QR bisa dipindai sampai sesi selesai.</span>
          <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => setConfirmEnd(true)}>
            Akhiri sekarang
          </button>
        </div>
      )}

      <div className="detail-layout">
        <section className="detail-main">
          <div className="section-head section-head--tight">
            <div>
              <p className="eyebrow">Galeri</p>
              <h2>{photos.length} foto di sesi ini</h2>
            </div>
            {photos.length > 0 && (
              <span className="section-head__meta">{formatBytes(totalBytes)} total</span>
            )}
          </div>

          {photos.length ? (
            <div className="admin-photo-grid">
              {photos.map((photo, index) => (
                <div className="admin-photo" key={photo.id}>
                  <button
                    type="button"
                    className="admin-photo__open"
                    onClick={() => setLightboxIndex(index)}
                    aria-label={`Buka ${photo.filename}`}
                  >
                    <img src={photo.thumbUrl} alt={photo.filename} loading="lazy" />
                  </button>
                  <span className="admin-photo__index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="admin-photo__actions">
                    <a href={photo.downloadUrl} title="Unduh foto asli" aria-label="Unduh foto asli">
                      <Download size={15} />
                    </a>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(photo)}
                      title="Hapus foto"
                      aria-label="Hapus foto"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="detail-empty">
              {session.status === 'live' ? <Timer size={26} /> : <ImageOff size={26} />}
              <h3>{session.status === 'live' ? 'Menunggu foto pertama' : 'Tidak ada foto'}</h3>
              <p>
                {session.status === 'live'
                  ? 'Foto akan muncul di sini begitu uploader mengirimkannya dari folder kamera.'
                  : 'Sesi ini selesai tanpa foto yang tersimpan.'}
              </p>
            </div>
          )}
        </section>

        <aside className="detail-side">
          <div className="side-qr">
            <div className="side-qr__head">
              <span>
                <QrCode size={15} />
                QR sesi
              </span>
              <span className="side-qr__status">{session.status === 'live' ? 'Aktif' : 'Arsip'}</span>
            </div>
            <div className="side-qr__frame">
              <QrCodeSvg ref={qrRef} value={session.publicUrl} />
            </div>
            <p className="side-qr__url">{session.publicUrl.replace(/^https?:\/\//, '')}</p>
            <div className="side-qr__actions">
              <CopyButton text={session.publicUrl} label="Salin" className="btn btn--dark btn--sm" />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => downloadQrSvg(qrRef.current, `qr-${session.publicToken}.svg`)}
              >
                <Download size={15} />
                QR
              </button>
            </div>
            <p className="side-qr__note">
              QR tetap bisa dipindai setelah sesi selesai. Galeri tidak pernah hilang.
            </p>
          </div>

          <div className="side-block">
            <h3>Detail sesi</h3>
            <dl className="detail-list">
              <div>
                <dt>Mulai</dt>
                <dd>{formatDateTime(session.startedAt, timezone)}</dd>
              </div>
              <div>
                <dt>Selesai</dt>
                <dd>{session.endedAt ? formatDateTime(session.endedAt, timezone) : 'Masih berjalan'}</dd>
              </div>
              <div>
                <dt>Durasi</dt>
                <dd>{formatDuration(session.startedAt, durationEnd)}</dd>
              </div>
              <div>
                <dt>Foto</dt>
                <dd>
                  {session.photoCount} · {formatBytes(totalBytes)}
                </dd>
              </div>
              <div>
                <dt>Akhir sesi</dt>
                <dd>
                  {session.status === 'live'
                    ? 'Otomatis dalam ' + formatCountdown(remaining)
                    : session.endReason === 'auto'
                      ? `Otomatis setelah ${config.sessionDurationMinutes} menit`
                      : 'Diakhiri manual'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="side-block">
            <div className="side-block__head">
              <h3>Catatan</h3>
              <button type="button" className="link-quiet" onClick={openEdit}>
                <Pencil size={13} />
                Ubah
              </button>
            </div>
            {session.note ? (
              <p className="side-note">{session.note}</p>
            ) : (
              <p className="side-note side-note--empty">
                Belum ada catatan. Tambahkan nama klien, lokasi, atau detail kecil lain.
              </p>
            )}
          </div>
        </aside>
      </div>

      <Modal
        open={editOpen}
        title="Ubah detail sesi"
        description="Judul tampil di galeri publik. Catatan hanya terlihat oleh admin."
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setEditOpen(false)}>
              Batal
            </button>
            <button type="button" className="btn btn--dark" onClick={saveEdit} disabled={saving}>
              {saving && <Spinner size={16} />}
              Simpan
            </button>
          </>
        }
      >
        <label className="field">
          <span className="field__label">Judul sesi</span>
          <span className="field__control">
            <input
              type="text"
              value={editTitle}
              maxLength={90}
              onChange={(event) => setEditTitle(event.target.value)}
              placeholder="Contoh: Sesi keluarga Andini"
            />
          </span>
        </label>
        <label className="field">
          <span className="field__label">Catatan internal</span>
          <span className="field__control field__control--textarea">
            <textarea
              value={editNote}
              maxLength={1000}
              rows={4}
              onChange={(event) => setEditNote(event.target.value)}
              placeholder="Nama klien, lokasi, konsep, atau hal yang perlu diingat…"
            />
          </span>
          <span className="field__hint">{editNote.length}/1000</span>
        </label>
      </Modal>

      <ConfirmDialog
        open={confirmEnd}
        title="Akhiri sesi sekarang?"
        description="Sesi berhenti menerima foto baru. QR dan galeri tetap bisa dibuka semua orang untuk melihat serta mengunduh foto."
        confirmLabel="Akhiri sesi"
        danger
        loading={ending}
        onConfirm={endSession}
        onCancel={() => setConfirmEnd(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus foto ini?"
        description={`“${deleteTarget?.filename || 'Foto'}” akan dihapus permanen dari galeri dan penyimpanan. Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Hapus permanen"
        danger
        loading={deleting}
        onConfirm={deletePhoto}
        onCancel={() => setDeleteTarget(null)}
      />

      {currentIndex !== null && (
        <DetailLightbox
          photos={photos}
          index={currentIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  );
}
