import type {
  AdminSession,
  AuthMe,
  Overview,
  PublicSession,
  SessionListResponse,
  SessionPrint,
  SiteConfig,
} from '../types';

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const TOKEN_KEY = 'lensa_admin_token';
const IS_LOCAL_HOST =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAdminToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage bisa diblokir di mode privat; sesi tetap berjalan sampai reload.
  }
}

export function clearAdminToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function endpoint(path: string) {
  return `${API_BASE}${path}`;
}

export class ApiError extends Error {
  status: number;
  code: string;
  payload: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code = 'request_failed',
    payload: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE && !IS_LOCAL_HOST) {
    throw new ApiError(
      'API backend belum dikonfigurasi. Set VITE_API_BASE_URL di environment Vercel.',
      0,
      'api_not_configured',
    );
  }
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAdminToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(endpoint(path), {
    credentials: 'omit',
    ...init,
    headers,
  });

  let payload: Record<string, unknown> = {};
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    if (response.status === 401 && path.startsWith('/api/admin')) {
      clearAdminToken();
      window.dispatchEvent(new Event('lensa:unauthorized'));
    }
    throw new ApiError(
      String(payload.message || `Permintaan gagal (${response.status}).`),
      response.status,
      String(payload.error || 'request_failed'),
      payload,
    );
  }
  return payload as T;
}

export const api = {
  getConfig: () => request<SiteConfig>('/api/config'),
  getPublicSession: (token: string) =>
    request<PublicSession>(`/api/public/sessions/${encodeURIComponent(token)}`),
  savePrint: (token: string, image: Blob, photoIds: string[]) => {
    const search = new URLSearchParams({
      width: '1386',
      height: '3024',
    });
    return request<{ ok: boolean; print: SessionPrint }>(
      `/api/public/sessions/${encodeURIComponent(token)}/prints?${search.toString()}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': image.type || 'image/jpeg',
          'X-Lensa-Photo-Ids': photoIds.join(','),
        },
        body: image,
      },
    );
  },

  me: () => request<AuthMe>('/api/auth/me'),
  login: async (password: string) => {
    const result = await request<{ ok: boolean; token?: string; expiresAt?: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ password }),
      },
    );
    if (result.token) setAdminToken(result.token);
    return result;
  },
  logout: async () => {
    try {
      return await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      clearAdminToken();
    }
  },

  overview: () => request<Overview>('/api/admin/overview'),
  listSessions: (params: { limit?: number; offset?: number; q?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    if (params.offset) search.set('offset', String(params.offset));
    if (params.q) search.set('q', params.q);
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return request<SessionListResponse>(`/api/admin/sessions${suffix}`);
  },
  createSession: (title?: string) =>
    request<{ session: AdminSession; message: string }>('/api/admin/sessions', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    }),
  getSession: (id: string) =>
    request<{ session: AdminSession; config: Omit<SiteConfig, 'version'>; serverNow: string }>(
      `/api/admin/sessions/${encodeURIComponent(id)}`,
    ),
  updateSession: (id: string, data: { title?: string; note?: string }) =>
    request<{ session: AdminSession; message: string }>(
      `/api/admin/sessions/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),
  endSession: (id: string) =>
    request<{ session: AdminSession; message: string }>(
      `/api/admin/sessions/${encodeURIComponent(id)}/end`,
      { method: 'POST' },
    ),
  deletePhoto: (id: string) =>
    request<{ ok: boolean; message: string }>(`/api/admin/photos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const success = document.execCommand('copy');
      area.remove();
      return success;
    } catch {
      return false;
    }
  }
}
