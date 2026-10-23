import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Download, Loader2, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { composeStrip, downloadBlob } from '../lib/strip';
import type { Photo, SessionPrint } from '../types';

type SaveState = 'composing' | 'saving' | 'saved' | 'error';

export function StripComposer({
  photos,
  token,
  onClose,
  onSaved,
}: {
  photos: Photo[];
  token: string;
  onClose: () => void;
  onSaved: (print: SessionPrint) => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [state, setState] = useState<SaveState>('composing');
  const [message, setMessage] = useState('');
  const previewRef = useRef('');
  const photosRef = useRef(photos);
  const tokenRef = useRef(token);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    photosRef.current = photos;
    tokenRef.current = token;
    onSavedRef.current = onSaved;
  }, [onSaved, photos, token]);

  const save = useCallback(async (image: Blob) => {
    setState('saving');
    setMessage('');
    try {
      const result = await api.savePrint(
        tokenRef.current,
        image,
        photosRef.current.map((photo) => photo.id),
      );
      onSavedRef.current(result.print);
      setState('saved');
      setMessage('Strip tersimpan di sesi ini.');
    } catch (error) {
      setState('error');
      setMessage(error instanceof ApiError ? error.message : 'Gagal menyimpan strip. Coba lagi.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const image = await composeStrip(photosRef.current);
        if (cancelled) return;
        setBlob(image);
        const url = URL.createObjectURL(image);
        previewRef.current = url;
        setPreviewUrl(url);
        await save(image);
      } catch (error) {
        if (cancelled) return;
        setState('error');
        setMessage(error instanceof Error ? error.message : 'Gagal membuat strip.');
      }
    })();
    return () => {
      cancelled = true;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, [save]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state !== 'saving') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, state]);

  const download = () => {
    if (!blob) return;
    downloadBlob(blob, `lensa-strip-${new Date().toISOString().slice(0, 10)}.jpg`);
  };

  return createPortal(
    <div className="strip-modal" role="dialog" aria-modal="true" aria-label="Strip photobooth">
      <div className="strip-modal__panel">
        <div className="strip-modal__head">
          <div>
            <p className="eyebrow">Strip photobooth</p>
            <h2>Hasil cetak</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={state === 'saving'}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="strip-modal__body">
          <div className="strip-modal__preview">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview strip photobooth" />
            ) : (
              <span className="strip-modal__loading">
                <Loader2 size={24} className="spin" />
                Menyusun foto…
              </span>
            )}
          </div>

          <div className="strip-modal__side">
            <p className="strip-modal__count">{photos.length} dari 3 foto dipilih</p>
            <p className="strip-modal__hint">
              Foto di-crop otomatis mengikuti slot frame. Unduh hasilnya atau buka lagi dari sesi
              ini nanti.
            </p>

            <div className={`strip-modal__status strip-modal__status--${state}`}>
              {state === 'saved' && <Check size={16} />}
              {state === 'error' && <AlertCircle size={16} />}
              {(state === 'saving' || state === 'composing') && (
                <Loader2 size={16} className="spin" />
              )}
              <span>
                {state === 'composing'
                  ? 'Menyusun strip…'
                  : state === 'saving'
                    ? 'Menyimpan ke sesi…'
                    : message}
              </span>
            </div>

            <div className="strip-modal__actions">
              <button
                type="button"
                className="btn btn--dark"
                onClick={download}
                disabled={!blob}
              >
                <Download size={16} />
                Unduh strip
              </button>
              {state === 'error' && blob && (
                <button type="button" className="btn btn--light-dark" onClick={() => save(blob)}>
                  Coba simpan lagi
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
