import { Hono } from 'hono';

const app = new Hono();
const enc = new TextEncoder();
const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/* ------------------------------------------------------------------ utils */

function nowIso() {
  return new Date().toISOString();
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function sessionDuration(c) {
  return Math.min(240, Math.max(1, toInt(c.env.SESSION_DURATION_MINUTES, 15)));
}

function timezone(c) {
  return c.env.APP_TIMEZONE || 'Asia/Jakarta';
}

function trimUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function originOf(value) {
  try {
    return new URL(String(value)).origin;
  } catch {
    return '';
  }
}

function appBase(c) {
  return trimUrl(c.env.PUBLIC_APP_URL) || new URL(c.req.url).origin;
}

function apiBase(c) {
  return trimUrl(c.env.PUBLIC_API_URL) || new URL(c.req.url).origin;
}

function allowedOrigins(c) {
  const list = String(c.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const appOrigin = originOf(c.env.PUBLIC_APP_URL);
  return [...new Set([...list, ...(appOrigin ? [appOrigin] : [])])];
}

function corsHeaders(c) {
  const origin = c.req.header('origin') || '';
  const headers = {};
  if (origin && allowedOrigins(c).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
    headers['Access-Control-Expose-Headers'] = 'Content-Disposition, Content-Length';
  }
  return headers;
}

function b64url(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function randomToken(bytes = 18) {
  return b64url(randomBytes(bytes));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = enc.encode(a);
  const right = enc.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function bearer(c) {
  const header = c.req.header('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

function safeFilename(value) {
  return String(value || 'foto.jpg')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'foto.jpg';
}

function extensionForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function attachmentHeader(filename) {
  const ascii = safeFilename(filename).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function hmac(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return b64url(new Uint8Array(signature));
}

async function issueAdminToken(c) {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const nonce = randomToken(12);
  const payload = `v1.${expiresAt}.${nonce}`;
  const signature = await hmac(c.env.SESSION_SECRET, payload);
  return {
    token: `${payload}.${signature}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

async function verifyAdminToken(c, token) {
  if (!token || !c.env.SESSION_SECRET) return false;
  const parts = String(token).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const [, expiresRaw, nonce, signature] = parts;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !nonce) return false;
  const expected = await hmac(c.env.SESSION_SECRET, `v1.${expiresRaw}.${nonce}`);
  return safeEqual(signature, expected);
}

async function authenticate(c) {
  const token = bearer(c);
  return Boolean(token && (await verifyAdminToken(c, token)));
}

async function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  try {
    const salt = fromB64url(parts[2]);
    const expected = fromB64url(parts[3]);
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      key,
      expected.length * 8,
    );
    return safeEqual(b64url(new Uint8Array(bits)), b64url(expected));
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------------- db */

async function all(c, sql, ...params) {
  const statement = params.length ? c.env.DB.prepare(sql).bind(...params) : c.env.DB.prepare(sql);
  const result = await statement.all();
  return result.results || [];
}

async function first(c, sql, ...params) {
  const statement = params.length ? c.env.DB.prepare(sql).bind(...params) : c.env.DB.prepare(sql);
  return statement.first();
}

async function run(c, sql, ...params) {
  const statement = params.length ? c.env.DB.prepare(sql).bind(...params) : c.env.DB.prepare(sql);
  return statement.run();
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    publicToken: row.public_token,
    title: row.title,
    note: row.note || '',
    status: row.status,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    endedAt: row.ended_at || null,
    endReason: row.end_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoCount: Number(row.photo_count || 0),
    coverPhotoId: row.cover_photo_id || null,
  };
}

function mapPhoto(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    originalKey: row.original_key,
    previewKey: row.preview_key,
    thumbKey: row.thumb_key,
    filename: row.filename,
    mime: row.mime,
    sizeBytes: Number(row.size_bytes),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    sha256: row.sha256,
    capturedAt: row.captured_at || null,
    createdAt: row.created_at,
  };
}

const sessionSelect = `
  SELECT s.*,
    (SELECT COUNT(*) FROM photos p WHERE p.session_id = s.id) AS photo_count,
    (SELECT p.id FROM photos p WHERE p.session_id = s.id
      ORDER BY COALESCE(p.captured_at, p.created_at) ASC, p.created_at ASC LIMIT 1) AS cover_photo_id
  FROM sessions s
`;

async function expireDue(c, now = nowIso()) {
  await run(
    c,
    `UPDATE sessions
     SET status = 'ended', ended_at = ends_at, end_reason = 'auto', updated_at = ?
     WHERE status = 'active' AND ends_at <= ?`,
    now,
    now,
  );
}

function isLive(session) {
  return Boolean(session && session.status === 'active' && new Date(session.endsAt).getTime() > Date.now());
}

async function getActiveSession(c) {
  return mapSession(await first(c, `${sessionSelect} WHERE s.status = 'active' LIMIT 1`));
}

async function getSessionById(c, id) {
  return mapSession(await first(c, `${sessionSelect} WHERE s.id = ?`, id));
}

async function getSessionByToken(c, token) {
  return mapSession(await first(c, `${sessionSelect} WHERE s.public_token = ?`, token));
}

async function listSessions(c, { limit = 30, offset = 0, query = '' } = {}) {
  const safeLimit = Math.min(100, Math.max(1, toInt(limit, 30)));
  const safeOffset = Math.max(0, toInt(offset, 0));
  const search = String(query || '').trim();
  const where = search ? 'WHERE s.title LIKE ? OR s.note LIKE ?' : '';
  const params = search ? [`%${search}%`, `%${search}%`] : [];
  const totalRow = await first(c, `SELECT COUNT(*) AS count FROM sessions s ${where}`, ...params);
  const rows = await all(
    c,
    `${sessionSelect} ${where} ORDER BY s.started_at DESC LIMIT ? OFFSET ?`,
    ...params,
    safeLimit,
    safeOffset,
  );
  return {
    sessions: rows.map(mapSession),
    total: Number(totalRow?.count || 0),
    limit: safeLimit,
    offset: safeOffset,
  };
}

async function listPhotos(c, sessionId) {
  const rows = await all(
    c,
    `SELECT * FROM photos WHERE session_id = ?
     ORDER BY COALESCE(captured_at, created_at) ASC, created_at ASC`,
    sessionId,
  );
  return rows.map(mapPhoto);
}

async function getPhoto(c, id) {
  return mapPhoto(await first(c, `SELECT * FROM photos WHERE id = ?`, id));
}

async function getPhotoByHash(c, sessionId, sha256) {
  return mapPhoto(
    await first(c, `SELECT * FROM photos WHERE session_id = ? AND sha256 = ?`, sessionId, sha256),
  );
}

function mapPrint(row) {
  if (!row) return null;
  let photoIds = [];
  try {
    photoIds = JSON.parse(row.photo_ids || '[]');
  } catch {
    photoIds = [];
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    storageKey: row.storage_key,
    filename: row.filename,
    mime: row.mime,
    sizeBytes: Number(row.size_bytes),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    photoIds: Array.isArray(photoIds) ? photoIds : [],
    createdAt: row.created_at,
  };
}

async function listPrints(c, sessionId) {
  const rows = await all(
    c,
    `SELECT * FROM prints WHERE session_id = ? ORDER BY created_at DESC`,
    sessionId,
  );
  return rows.map(mapPrint);
}

async function getPrint(c, id) {
  return mapPrint(await first(c, `SELECT * FROM prints WHERE id = ?`, id));
}

async function countPrints(c, sessionId) {
  const row = await first(c, `SELECT COUNT(*) AS count FROM prints WHERE session_id = ?`, sessionId);
  return Number(row?.count || 0);
}

async function getStats(c) {
  const sessions = await first(c, `SELECT COUNT(*) AS count FROM sessions`);
  const photos = await first(c, `SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM photos`);
  return {
    totalSessions: Number(sessions?.count || 0),
    totalPhotos: Number(photos?.count || 0),
    totalBytes: Number(photos?.bytes || 0),
  };
}

async function getWatcherStatus(c) {
  const row = await first(c, `SELECT * FROM watcher_status WHERE id = 1`);
  if (!row) return { lastSeenAt: null, agentName: null, lastUploadAt: null, online: false };
  return {
    lastSeenAt: row.last_seen_at || null,
    agentName: row.agent_name || null,
    lastUploadAt: row.last_upload_at || null,
    online: Boolean(row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() < 90_000),
  };
}

async function touchWatcher(c, agentName, uploaded = false) {
  const now = nowIso();
  await run(
    c,
    `INSERT INTO watcher_status (id, last_seen_at, agent_name, last_upload_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       agent_name = COALESCE(excluded.agent_name, watcher_status.agent_name),
       last_upload_at = COALESCE(excluded.last_upload_at, watcher_status.last_upload_at)`,
    now,
    agentName || null,
    uploaded ? now : null,
  );
  return getWatcherStatus(c);
}

async function formatSessionTitle(c, date = new Date()) {
  try {
    const datePart = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: timezone(c),
    }).format(date);
    const timePart = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone(c),
    })
      .format(date)
      .replace(':', '.');
    return `Sesi ${datePart} · ${timePart}`;
  } catch {
    return `Sesi ${date.toISOString().slice(0, 16).replace('T', ' ')}`;
  }
}

async function createSession(c, title = '') {
  const now = new Date();
  const endsAt = new Date(now.getTime() + sessionDuration(c) * 60 * 1000);
  const id = crypto.randomUUID();
  const publicToken = randomToken(18);
  const cleanTitle = String(title || '').trim().slice(0, 90) || (await formatSessionTitle(c, now));
  try {
    await run(
      c,
      `INSERT INTO sessions
        (id, public_token, title, note, status, started_at, ends_at, created_at, updated_at)
       VALUES (?, ?, ?, '', 'active', ?, ?, ?, ?)`,
      id,
      publicToken,
      cleanTitle,
      now.toISOString(),
      endsAt.toISOString(),
      now.toISOString(),
      now.toISOString(),
    );
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) return null;
    throw error;
  }
  return getSessionById(c, id);
}

async function endSession(c, id) {
  const now = nowIso();
  await run(
    c,
    `UPDATE sessions
     SET status = 'ended', ended_at = COALESCE(ended_at, ?), end_reason = COALESCE(end_reason, 'manual'), updated_at = ?
     WHERE id = ? AND status = 'active'`,
    now,
    now,
    id,
  );
  return getSessionById(c, id);
}

/* ------------------------------------------------------------- serializers */

function mediaUrl(c, token, photoId, variant, download = false) {
  const base = `${apiBase(c)}/api/public/media/${encodeURIComponent(token)}/${encodeURIComponent(photoId)}`;
  const suffix = variant === 'original' && download ? '?download=1' : '';
  return `${base}/${variant}${suffix}`;
}

function printUrl(c, token, printId, download = false) {
  const base = `${apiBase(c)}/api/public/prints/${encodeURIComponent(token)}/${encodeURIComponent(printId)}`;
  return download ? `${base}?download=1` : base;
}

function publicPrint(c, token, print) {
  return {
    id: print.id,
    width: print.width,
    height: print.height,
    photoIds: print.photoIds,
    createdAt: print.createdAt,
    imageUrl: printUrl(c, token, print.id),
    downloadUrl: printUrl(c, token, print.id, true),
  };
}

function publicPhoto(c, token, photo) {
  return {
    id: photo.id,
    filename: photo.filename,
    width: photo.width,
    height: photo.height,
    capturedAt: photo.capturedAt,
    createdAt: photo.createdAt,
    thumbUrl: mediaUrl(c, token, photo.id, 'thumb'),
    previewUrl: mediaUrl(c, token, photo.id, 'preview'),
    downloadUrl: mediaUrl(c, token, photo.id, 'original', true),
  };
}

function publicSessionPayload(c, session, photos = [], prints = []) {
  return {
    title: session.title,
    status: isLive(session) ? 'live' : 'ended',
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    endedAt: session.endedAt,
    photoCount: session.photoCount,
    photos: photos.map((photo) => publicPhoto(c, session.publicToken, photo)),
    prints: prints.map((print) => publicPrint(c, session.publicToken, print)),
    serverNow: nowIso(),
    sessionUrl: `${appBase(c)}/s/${session.publicToken}`,
  };
}

function adminPhoto(c, token, photo) {
  return {
    ...publicPhoto(c, token, photo),
    sizeBytes: photo.sizeBytes,
    mime: photo.mime,
  };
}

function adminSessionPayload(c, session, photos, prints = []) {
  if (!session) return null;
  const list = photos ?? [];
  return {
    id: session.id,
    title: session.title,
    note: session.note,
    status: isLive(session) ? 'live' : 'ended',
    rawStatus: session.status,
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    endedAt: session.endedAt,
    endReason: session.endReason,
    photoCount: session.photoCount,
    coverPhotoId: session.coverPhotoId,
    coverThumbUrl: session.coverPhotoId
      ? mediaUrl(c, session.publicToken, session.coverPhotoId, 'thumb')
      : null,
    publicToken: session.publicToken,
    publicUrl: `${appBase(c)}/s/${session.publicToken}`,
    photos: list.map((photo) => adminPhoto(c, session.publicToken, photo)),
    prints: prints.map((print) => publicPrint(c, session.publicToken, print)),
    serverNow: nowIso(),
  };
}

async function adminSessionSummary(c, session) {
  return adminSessionPayload(c, session, []);
}

function activeSessionSummary(session) {
  if (!session) return null;
  return {
    id: session.id,
    title: session.title,
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    photoCount: session.photoCount,
  };
}

function photoKeys(sessionId, photoId, mime) {
  const base = `sessions/${sessionId}/${photoId}`;
  return {
    original: `${base}/original.${extensionForMime(mime)}`,
    preview: `${base}/preview.jpg`,
    thumb: `${base}/thumb.jpg`,
  };
}

function printStorageKey(sessionId, printId, mime) {
  return `sessions/${sessionId}/prints/${printId}.${extensionForMime(mime)}`;
}

/* ---------------------------------------------------------------- middleware */

app.use('*', async (c, next) => {
  const origin = c.req.header('origin') || '';
  if (origin && allowedOrigins(c).includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
  }
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Lensa-Agent, X-Lensa-Photo-Id, X-Lensa-Kind, X-Lensa-Photo-Ids');
    c.header('Access-Control-Max-Age', '86400');
    return c.body(null, 204);
  }
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  await next();
});

async function requireAdmin(c, next) {
  if (!(await authenticate(c))) {
    return c.json({ error: 'unauthorized', message: 'Silakan masuk sebagai admin.' }, 401);
  }
  await next();
}

async function requireIngest(c, next) {
  const token = bearer(c);
  if (!token || !safeEqual(token, c.env.INGEST_TOKEN || '')) {
    return c.json({ error: 'unauthorized', message: 'Token uploader salah.' }, 401);
  }
  await next();
}

/* -------------------------------------------------------------------- auth */

app.get('/api/auth/me', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({
    authenticated: await authenticate(c),
    configured: Boolean(c.env.ADMIN_PASSWORD_HASH),
    siteName: c.env.SITE_NAME || 'Lensa',
  });
});

app.post('/api/auth/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const cutoff = new Date(now - LOGIN_WINDOW_MS).toISOString();
  await run(c, `DELETE FROM login_attempts WHERE attempted_at < ?`, cutoff);
  const countRow = await first(
    c,
    `SELECT COUNT(*) AS count FROM login_attempts WHERE ip = ? AND attempted_at >= ?`,
    ip,
    cutoff,
  );
  if (Number(countRow?.count || 0) >= MAX_LOGIN_ATTEMPTS) {
    return c.json(
      { error: 'rate_limited', message: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' },
      429,
    );
  }

  let body = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) {
    return c.json({ error: 'invalid_request', message: 'Password wajib diisi.' }, 400);
  }

  const valid = await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH);
  if (!valid) {
    await run(c, `INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)`, ip, nowIso());
    return c.json({ error: 'invalid_password', message: 'Password salah.' }, 401);
  }

  await run(c, `DELETE FROM login_attempts WHERE ip = ?`, ip);
  const issued = await issueAdminToken(c);
  c.header('Cache-Control', 'no-store');
  return c.json({ ok: true, ...issued });
});

app.post('/api/auth/logout', async (c) => c.json({ ok: true }));

/* ------------------------------------------------------------------ public */

app.get('/api/config', async (c) =>
  c.json({
    siteName: c.env.SITE_NAME || 'Lensa',
    timezone: timezone(c),
    sessionDurationMinutes: sessionDuration(c),
    version: '2.0.0',
  }),
);

app.get('/api/public/sessions/:token', async (c) => {
  await expireDue(c);
  const token = c.req.param('token');
  const session = await getSessionByToken(c, token);
  if (!session) return c.json({ error: 'not_found', message: 'Sesi tidak ditemukan.' }, 404);
  const [photos, prints] = await Promise.all([
    listPhotos(c, session.id),
    listPrints(c, session.id),
  ]);
  c.header('Cache-Control', 'no-store');
  return c.json(publicSessionPayload(c, session, photos, prints));
});

app.post('/api/public/sessions/:token/prints', async (c) => {
  await expireDue(c);
  const token = c.req.param('token');
  const session = await getSessionByToken(c, token);
  if (!session) return c.json({ error: 'not_found', message: 'Sesi tidak ditemukan.' }, 404);

  const mime = String(c.req.header('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/jpeg', 'image/png'].includes(mime)) {
    return c.json({ error: 'invalid_type', message: 'Hasil harus JPEG atau PNG.' }, 415);
  }

  const length = toInt(c.req.header('content-length'), 0);
  const maxBytes = 10 * 1024 * 1024;
  if (length > maxBytes) {
    return c.json({ error: 'invalid_size', message: 'Ukuran hasil tidak valid.' }, 413);
  }

  if ((await countPrints(c, session.id)) >= 50) {
    return c.json({ error: 'too_many_prints', message: 'Batas hasil cetak sesi ini tercapai.' }, 429);
  }

  const photoIds = String(c.req.header('x-lensa-photo-ids') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (photoIds.length === 0) {
    return c.json({ error: 'invalid_photos', message: 'Pilih minimal satu foto.' }, 400);
  }

  const data = await c.req.arrayBuffer();
  if (!data.byteLength || data.byteLength > maxBytes) {
    return c.json({ error: 'invalid_size', message: 'Ukuran hasil tidak valid.' }, 413);
  }
  const bytes = new Uint8Array(data);
  const isJpeg = mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    mime === 'image/png' &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  if (!isJpeg && !isPng) {
    return c.json({ error: 'invalid_image', message: 'File hasil bukan gambar valid.' }, 415);
  }

  const id = crypto.randomUUID();
  const extension = mime === 'image/png' ? 'png' : 'jpg';
  const key = printStorageKey(session.id, id, mime);
  const filename = `lensa-${session.publicToken.slice(0, 6)}-${id.slice(0, 8)}.${extension}`;
  await c.env.PHOTOS.put(key, data, {
    httpMetadata: {
      contentType: mime,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  try {
    await run(
      c,
      `INSERT INTO prints
        (id, session_id, storage_key, filename, mime, size_bytes, width, height, photo_ids, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      session.id,
      key,
      filename,
      mime,
      data.byteLength,
      toInt(c.req.query('width'), 1386),
      toInt(c.req.query('height'), 3024),
      JSON.stringify(photoIds),
      nowIso(),
    );
  } catch (error) {
    await c.env.PHOTOS.delete(key).catch(() => undefined);
    throw error;
  }

  const print = await getPrint(c, id);
  return c.json({ ok: true, print: publicPrint(c, session.publicToken, print) }, 201);
});

app.on(['GET', 'HEAD'], '/api/public/media/:token/:photoId/:variant', async (c) => {
  const { token, photoId, variant } = c.req.param();
  if (!['thumb', 'preview', 'original'].includes(variant)) {
    return c.text('Not found', 404);
  }
  const session = await getSessionByToken(c, token);
  if (!session) return c.text('Not found', 404);
  const photo = await getPhoto(c, photoId);
  if (!photo || photo.sessionId !== session.id) return c.text('Not found', 404);

  const key =
    variant === 'thumb' ? photo.thumbKey : variant === 'preview' ? photo.previewKey : photo.originalKey;
  const headers = {
    'Content-Type': variant === 'original' ? photo.mime : 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders(c),
  };

  if (variant === 'original' && c.req.query('download') === '1') {
    headers['Content-Disposition'] = attachmentHeader(photo.filename);
  } else {
    headers['Content-Disposition'] = 'inline';
  }

  if (c.req.method === 'HEAD') {
    const object = await c.env.PHOTOS.head(key);
    if (!object) return c.text('Not found', 404);
    headers['Content-Length'] = String(object.size);
    return new Response(null, { headers });
  }

  const object = await c.env.PHOTOS.get(key);
  if (!object) return c.text('Not found', 404);
  headers['Content-Length'] = String(object.size);
  if (object.httpEtag) headers.ETag = object.httpEtag;
  return new Response(object.body, { headers });
});

app.on(['GET', 'HEAD'], '/api/public/prints/:token/:printId', async (c) => {
  const { token, printId } = c.req.param();
  const session = await getSessionByToken(c, token);
  if (!session) return c.text('Not found', 404);
  const print = await getPrint(c, printId);
  if (!print || print.sessionId !== session.id) return c.text('Not found', 404);

  const headers = {
    'Content-Type': print.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition':
      c.req.query('download') === '1' ? attachmentHeader(print.filename) : 'inline',
    ...corsHeaders(c),
  };

  if (c.req.method === 'HEAD') {
    const object = await c.env.PHOTOS.head(print.storageKey);
    if (!object) return c.text('Not found', 404);
    headers['Content-Length'] = String(object.size);
    return new Response(null, { headers });
  }

  const object = await c.env.PHOTOS.get(print.storageKey);
  if (!object) return c.text('Not found', 404);
  headers['Content-Length'] = String(object.size);
  if (object.httpEtag) headers.ETag = object.httpEtag;
  return new Response(object.body, { headers });
});

/* ------------------------------------------------------------------ ingest */

app.use('/api/ingest/*', requireIngest);

function agentName(c) {
  return String(c.req.header('x-lensa-agent') || 'Uploader').trim().slice(0, 80);
}

app.post('/api/ingest/heartbeat', async (c) => {
  await expireDue(c);
  const active = await getActiveSession(c);
  const uploader = await touchWatcher(c, agentName(c), false);
  return c.json({
    ok: true,
    activeSession: activeSessionSummary(active),
    uploader,
    serverNow: nowIso(),
    sessionDurationMinutes: sessionDuration(c),
  });
});

app.post('/api/ingest/prepare', async (c) => {
  await expireDue(c);
  const session = await getActiveSession(c);
  if (!session) {
    return c.json(
      { error: 'no_active_session', message: 'Tidak ada sesi aktif. Foto tidak diunggah.' },
      409,
    );
  }

  let body = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_request', message: 'Body tidak valid.' }, 400);
  }

  const sha256 = String(body.sha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    return c.json({ error: 'invalid_hash', message: 'Hash foto tidak valid.' }, 400);
  }
  const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(body.mime)
    ? body.mime
    : 'image/jpeg';
  const filename = safeFilename(body.filename);
  const width = Math.min(100_000, Math.max(0, toInt(body.width)));
  const height = Math.min(100_000, Math.max(0, toInt(body.height)));
  const sizeBytes = Math.min(100 * 1024 * 1024, Math.max(0, toInt(body.sizeBytes)));
  // Tanggal kamera tidak dipakai untuk menerima/menolak foto. Sesi yang
  // menentukan; capturedAt hanya metadata dan fallback ke waktu upload.
  const capturedAt = body.capturedAt && !Number.isNaN(new Date(body.capturedAt).getTime())
    ? new Date(body.capturedAt)
    : new Date();

  const existing = await getPhotoByHash(c, session.id, sha256);
  if (existing) {
    return c.json({
      ok: true,
      duplicate: true,
      photo: { id: existing.id },
      sessionId: session.id,
    });
  }

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await run(c, `DELETE FROM pending_uploads WHERE created_at < ?`, cutoff);

  const photoId = crypto.randomUUID();
  await run(
    c,
    `INSERT INTO pending_uploads
      (id, session_id, sha256, filename, mime, size_bytes, width, height, captured_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    photoId,
    session.id,
    sha256,
    filename,
    mime,
    sizeBytes,
    width,
    height,
    capturedAt.toISOString(),
    nowIso(),
  );
  return c.json({ ok: true, duplicate: false, photoId, sessionId: session.id });
});

app.post('/api/ingest/asset', async (c) => {
  const photoId = c.req.header('x-lensa-photo-id') || '';
  const kind = c.req.header('x-lensa-kind') || '';
  if (!['original', 'preview', 'thumb'].includes(kind)) {
    return c.json({ error: 'invalid_kind', message: 'Jenis aset tidak valid.' }, 400);
  }
  const pending = await first(c, `SELECT * FROM pending_uploads WHERE id = ?`, photoId);
  if (!pending) {
    return c.json({ error: 'not_found', message: 'Upload tidak ditemukan.' }, 404);
  }
  await expireDue(c);
  const session = await getSessionById(c, pending.session_id);
  if (!session || !isLive(session)) {
    return c.json({ error: 'no_active_session', message: 'Sesi sudah selesai.' }, 409);
  }

  const length = toInt(c.req.header('content-length'), 0);
  const max = kind === 'original' ? 100 * 1024 * 1024 : 15 * 1024 * 1024;
  if (length <= 0 || length > max) {
    return c.json({ error: 'invalid_size', message: 'Ukuran aset tidak valid.' }, 413);
  }
  const body = c.req.raw.body;
  if (!body) return c.json({ error: 'invalid_body', message: 'Aset kosong.' }, 400);

  const keys = photoKeys(pending.session_id, pending.id, pending.mime);
  const key = keys[kind];
  const contentType = kind === 'original' ? pending.mime : 'image/jpeg';
  await c.env.PHOTOS.put(key, body, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
  });
  await touchWatcher(c, agentName(c), false);
  return c.json({ ok: true });
});

app.post('/api/ingest/commit', async (c) => {
  await expireDue(c);
  let body = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const photoId = String(body.photoId || '');
  const pending = await first(c, `SELECT * FROM pending_uploads WHERE id = ?`, photoId);
  if (!pending) {
    return c.json({ error: 'not_found', message: 'Upload tidak ditemukan.' }, 404);
  }
  const session = await getSessionById(c, pending.session_id);
  if (!session || !isLive(session)) {
    return c.json({ error: 'no_active_session', message: 'Sesi sudah selesai.' }, 409);
  }

  const keys = photoKeys(pending.session_id, pending.id, pending.mime);
  const [original, preview, thumb] = await Promise.all([
    c.env.PHOTOS.head(keys.original),
    c.env.PHOTOS.head(keys.preview),
    c.env.PHOTOS.head(keys.thumb),
  ]);
  if (!original || !preview || !thumb) {
    return c.json({ error: 'incomplete_upload', message: 'Aset foto belum lengkap.' }, 409);
  }

  try {
    await run(
      c,
      `INSERT INTO photos
        (id, session_id, original_key, preview_key, thumb_key, filename, mime,
         size_bytes, width, height, sha256, captured_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      pending.id,
      pending.session_id,
      keys.original,
      keys.preview,
      keys.thumb,
      pending.filename,
      pending.mime,
      pending.size_bytes,
      pending.width,
      pending.height,
      pending.sha256,
      pending.captured_at,
      nowIso(),
    );
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) {
      await run(c, `DELETE FROM pending_uploads WHERE id = ?`, pending.id);
      const existing = await getPhotoByHash(c, pending.session_id, pending.sha256);
      return c.json({ ok: true, duplicate: true, photoId: existing?.id || null });
    }
    throw error;
  }

  await run(c, `DELETE FROM pending_uploads WHERE id = ?`, pending.id);
  const uploader = await touchWatcher(c, agentName(c), true);
  return c.json({ ok: true, duplicate: false, photoId: pending.id, uploader });
});

app.post('/api/ingest/abort', async (c) => {
  let body = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const pending = await first(c, `SELECT * FROM pending_uploads WHERE id = ?`, String(body.photoId || ''));
  if (!pending) return c.json({ ok: true });
  const keys = photoKeys(pending.session_id, pending.id, pending.mime);
  await Promise.allSettled([
    c.env.PHOTOS.delete(keys.original),
    c.env.PHOTOS.delete(keys.preview),
    c.env.PHOTOS.delete(keys.thumb),
  ]);
  await run(c, `DELETE FROM pending_uploads WHERE id = ?`, pending.id);
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------- admin */

app.use('/api/admin/*', requireAdmin);

app.get('/api/admin/overview', async (c) => {
  await expireDue(c);
  const active = await getActiveSession(c);
  const activePhotos = active ? (await listPhotos(c, active.id)).slice(-12) : [];
  const recent = await listSessions(c, { limit: 8 });
  const stats = await getStats(c);
  const uploader = await getWatcherStatus(c);
  return c.json({
    activeSession: active ? adminSessionPayload(c, active, activePhotos) : null,
    recentSessions: await Promise.all(recent.sessions.map((session) => adminSessionSummary(c, session))),
    stats,
    uploader,
    storage: { mode: 'r2', bucket: c.env.R2_BUCKET_NAME || 'Cloudflare R2' },
    config: {
      siteName: c.env.SITE_NAME || 'Lensa',
      timezone: timezone(c),
      sessionDurationMinutes: sessionDuration(c),
    },
    serverNow: nowIso(),
  });
});

app.get('/api/admin/sessions', async (c) => {
  await expireDue(c);
  const result = await listSessions(c, {
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
    query: c.req.query('q'),
  });
  return c.json({
    ...result,
    sessions: await Promise.all(result.sessions.map((session) => adminSessionSummary(c, session))),
  });
});

app.post('/api/admin/sessions', async (c) => {
  await expireDue(c);
  const active = await getActiveSession(c);
  if (active) {
    return c.json(
      {
        error: 'active_session_exists',
        message: 'Masih ada sesi aktif. Akhiri sesi tersebut terlebih dahulu.',
        activeSession: await adminSessionSummary(c, active),
      },
      409,
    );
  }
  let body = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length > 90) {
    return c.json({ error: 'invalid_title', message: 'Judul maksimal 90 karakter.' }, 400);
  }
  const session = await createSession(c, title);
  if (!session) {
    return c.json(
      { error: 'active_session_exists', message: 'Masih ada sesi aktif. Coba lagi.' },
      409,
    );
  }
  return c.json(
    {
      session: adminSessionPayload(c, session, []),
      message: 'Sesi baru siap. QR sudah bisa dipindai.',
    },
    201,
  );
});

app.get('/api/admin/sessions/:id', async (c) => {
  await expireDue(c);
  const session = await getSessionById(c, c.req.param('id'));
  if (!session) return c.json({ error: 'not_found', message: 'Sesi tidak ditemukan.' }, 404);
  const [photos, prints] = await Promise.all([
    listPhotos(c, session.id),
    listPrints(c, session.id),
  ]);
  return c.json({
    session: adminSessionPayload(c, session, photos, prints),
    config: {
      siteName: c.env.SITE_NAME || 'Lensa',
      timezone: timezone(c),
      sessionDurationMinutes: sessionDuration(c),
    },
    serverNow: nowIso(),
  });
});

app.patch('/api/admin/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const current = await getSessionById(c, id);
  if (!current) return c.json({ error: 'not_found', message: 'Sesi tidak ditemukan.' }, 404);
  let body = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title');
  const hasNote = Object.prototype.hasOwnProperty.call(body, 'note');
  if (!hasTitle && !hasNote) {
    return c.json({ error: 'invalid_request', message: 'Tidak ada perubahan.' }, 400);
  }
  const title = hasTitle ? String(body.title || '').trim() : current.title;
  if (hasTitle && (!title || title.length > 90)) {
    return c.json(
      { error: 'invalid_title', message: 'Judul harus diisi dan maksimal 90 karakter.' },
      400,
    );
  }
  const note = hasNote ? String(body.note || '').trim() : current.note;
  if (note.length > 1000) {
    return c.json({ error: 'invalid_note', message: 'Catatan maksimal 1.000 karakter.' }, 400);
  }
  await run(
    c,
    `UPDATE sessions SET title = ?, note = ?, updated_at = ? WHERE id = ?`,
    title,
    note,
    nowIso(),
    id,
  );
  const updated = await getSessionById(c, id);
  return c.json({
    session: adminSessionPayload(c, updated, await listPhotos(c, id)),
    message: 'Detail sesi disimpan.',
  });
});

app.post('/api/admin/sessions/:id/end', async (c) => {
  await expireDue(c);
  const current = await getSessionById(c, c.req.param('id'));
  if (!current) return c.json({ error: 'not_found', message: 'Sesi tidak ditemukan.' }, 404);
  if (!isLive(current)) {
    return c.json({
      session: adminSessionPayload(c, current, await listPhotos(c, current.id)),
      message: 'Sesi sudah selesai.',
    });
  }
  const ended = await endSession(c, current.id);
  return c.json({
    session: adminSessionPayload(c, ended, await listPhotos(c, ended.id)),
    message: 'Sesi selesai. QR lama tetap membuka galeri.',
  });
});

app.delete('/api/admin/photos/:id', async (c) => {
  const photo = await getPhoto(c, c.req.param('id'));
  if (!photo) return c.json({ error: 'not_found', message: 'Foto tidak ditemukan.' }, 404);
  await Promise.allSettled([
    c.env.PHOTOS.delete(photo.originalKey),
    c.env.PHOTOS.delete(photo.previewKey),
    c.env.PHOTOS.delete(photo.thumbKey),
  ]);
  await run(c, `DELETE FROM photos WHERE id = ?`, photo.id);
  return c.json({ ok: true, message: 'Foto dihapus.', sessionId: photo.sessionId });
});

/* -------------------------------------------------------------------- misc */

app.get('/healthz', async (c) => c.json({ ok: true, service: 'lensa-worker', now: nowIso() }));

app.get('/robots.txt', async (c) => c.text('User-agent: *\nDisallow: /\n'));

app.get('/', async (c) =>
  c.json({
    service: 'lensa-api',
    status: 'ok',
    docs: 'https://github.com/',
  }),
);

app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'not_found', message: 'Endpoint tidak ditemukan.' }, 404);
  }
  return c.text('Not found', 404);
});

app.onError((error, c) => {
  console.error('worker error', error);
  return c.json({ error: 'internal_error', message: 'Terjadi kesalahan di server.' }, 500);
});

export default app;
