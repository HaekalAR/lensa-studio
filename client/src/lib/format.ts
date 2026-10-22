const DEFAULT_TZ = 'Asia/Jakarta';

function dateFrom(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateLong(value: string | Date, timezone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(dateFrom(value));
}

export function formatDateShort(value: string | Date, timezone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: timezone,
  })
    .format(dateFrom(value))
    .replace(/\./g, '');
}

export function formatTime(value: string | Date, timezone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  })
    .format(dateFrom(value))
    .replace(':', '.');
}

export function formatDateTime(value: string | Date, timezone = DEFAULT_TZ): string {
  return `${formatDateShort(value, timezone)} · ${formatTime(value, timezone)}`;
}

export function formatDayName(value: string | Date, timezone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    timeZone: timezone,
  }).format(dateFrom(value));
}

export function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDuration(start: string, end: string): string {
  const seconds = Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds} detik`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!rest) return `${minutes} menit`;
  return `${minutes} mnt ${rest} dtk`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatRelative(value: string | null, timezone = DEFAULT_TZ): string {
  if (!value) return 'belum pernah';
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  if (diff < 30_000) return 'baru saja';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60_000)} menit lalu`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3_600_000)} jam lalu`;
  if (diff < 48 * 60 * 60 * 1000) return `kemarin, ${formatTime(value, timezone)}`;
  return formatDateTime(value, timezone);
}

export function percentAspect(width: number | null, height: number | null): string | undefined {
  if (!width || !height) return undefined;
  return `${width} / ${height}`;
}
