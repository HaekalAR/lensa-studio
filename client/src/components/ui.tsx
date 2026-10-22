import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Aperture,
  Check,
  Copy,
  LoaderCircle,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { copyText } from '../lib/api';
import type { SessionStatus } from '../types';

export function Logo({
  to = '/',
  tone = 'dark',
  compact = false,
}: {
  to?: string;
  tone?: 'dark' | 'light';
  compact?: boolean;
}) {
  return (
    <Link className={`logo logo--${tone} ${compact ? 'logo--compact' : ''}`} to={to}>
      <span className="logo__mark">
        <Aperture size={18} strokeWidth={1.8} />
      </span>
      <span className="logo__word">Lensa</span>
      {!compact && <span className="logo__dot">Studio</span>}
    </Link>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <LoaderCircle className="spin" size={size} aria-hidden="true" />;
}

export function PageLoader({ label = 'Menyiapkan halaman' }: { label?: string }) {
  return (
    <div className="page-loader">
      <span className="page-loader__mark">
        <Aperture size={26} strokeWidth={1.5} />
      </span>
      <span>{label}</span>
      <span className="page-loader__line" />
    </div>
  );
}

export function StatusPill({ status }: { status: SessionStatus }) {
  if (status === 'live') {
    return (
      <span className="status status--live">
        <span className="status__dot" />
        Live
      </span>
    );
  }
  return (
    <span className="status status--ended">
      <span className="status__dot" />
      Selesai
    </span>
  );
}

export function CopyButton({
  text,
  label = 'Salin tautan',
  className = 'btn btn--ghost',
  compact = false,
}: {
  text: string;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const toast = useToast();

  const handleCopy = async () => {
    const ok = await copyText(text);
    if (!ok) {
      toast.error('Tautan gagal disalin. Salin manual dari kolom alamat.');
      return;
    }
    setCopied(true);
    toast.success('Tautan disalin.');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button type="button" className={className} onClick={handleCopy}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {!compact && <span>{copied ? 'Tersalin' : label}</span>}
    </button>
  );
}

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<number[]>([]);

  const push = useCallback((message: string, kind: ToastKind) => {
    const id = ++toastId;
    setItems((current) => [...current, { id, message, kind }]);
    const timer = window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, kind === 'error' ? 6500 : 4000);
    timers.current.push(timer);
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
      info: (message) => push(message, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div key={item.id} className={`toast toast--${item.kind}`}>
            <span className="toast__icon">
              {item.kind === 'success' ? (
                <Check size={15} />
              ) : item.kind === 'error' ? (
                <AlertTriangle size={15} />
              ) : (
                <Aperture size={15} />
              )}
            </span>
            <span>{item.message}</span>
            <button
              type="button"
              className="toast__close"
              aria-label="Tutup notifikasi"
              onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast harus dipakai di dalam ToastProvider');
  return context;
}

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal__head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        {children && <div className="modal__body">{children}</div>}
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Lanjutkan',
  cancelLabel = 'Batal',
  loading = false,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--dark'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Spinner size={16} />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="modal__copy">{description}</p>
    </Modal>
  );
}

export function QrGlyph({ seed = 'lensa' }: { seed?: string }) {
  const cells = useMemo(() => {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const size = 25;
    const grid: boolean[] = [];
    const finder = (row: number, col: number) => {
      for (let r = -1; r <= 7; r += 1) {
        for (let c = -1; c <= 7; c += 1) {
          const rr = row + r;
          const cc = col + c;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          const ring = r === 0 || r === 6 || c === 0 || c === 6;
          const center = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[rr * size + cc] = inner && (ring || center);
        }
      }
    };

    for (let i = 0; i < size * size; i += 1) {
      hash ^= hash << 13;
      hash ^= hash >>> 17;
      hash ^= hash << 5;
      grid[i] = (hash & 1) === 1;
    }
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);
    return grid;
  }, [seed]);

  return (
    <div className="qr-glyph" aria-hidden="true">
      {cells.map((filled, index) => (
        <span key={index} className={filled ? 'qr-glyph__cell is-filled' : 'qr-glyph__cell'} />
      ))}
    </div>
  );
}

export function ErrorState({
  title = 'Halaman tidak ditemukan',
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="error-state">
      <span className="error-state__mark">
        <AlertTriangle size={22} />
      </span>
      <p className="eyebrow">Tidak bisa dibuka</p>
      <h1>{title}</h1>
      <p>{message}</p>
      {action && <div className="error-state__action">{action}</div>}
    </div>
  );
}
