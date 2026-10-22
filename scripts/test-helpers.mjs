import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { processImage } from '../shared/image.js';

export const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const INGEST_TOKEN = process.env.INGEST_TOKEN || '';

export function requireTestEnv() {
  if (!ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD wajib diisi di .env untuk menjalankan tes.');
  }
  if (!INGEST_TOKEN) {
    throw new Error('INGEST_TOKEN wajib diisi di .env untuk menjalankan tes.');
  }
}

export async function loginAdmin(base = BASE, password = ADMIN_PASSWORD) {
  requireTestEnv();
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Login gagal (HTTP ${response.status}).`);
  }
  if (!data.token) throw new Error('Token admin tidak diterima.');
  return data.token;
}

export async function apiRequest(pathname, { token = '', ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${BASE}${pathname}`, { ...options, headers });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { response, data };
}

export async function createTestSession(token, title = 'Sesi Demo · Lensa') {
  // Tes memakai satu sesi aktif. Sesi dev yang tertinggal ditutup dulu.
  const overview = await apiRequest('/api/admin/overview', { token });
  if (overview.data.activeSession?.id) {
    await apiRequest(`/api/admin/sessions/${overview.data.activeSession.id}/end`, {
      method: 'POST',
      token,
    });
  }
  const { response, data } = await apiRequest('/api/admin/sessions', {
    method: 'POST',
    token,
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(data.message || `Gagal membuat sesi (HTTP ${response.status}).`);
  }
  return data.session;
}

async function ingestAsset(photoId, kind, data, mime) {
  const response = await fetch(`${BASE}/api/ingest/asset`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${INGEST_TOKEN}`,
      'X-Lensa-Photo-Id': photoId,
      'X-Lensa-Kind': kind,
      'Content-Type': mime,
      'Content-Length': String(data.length),
      'X-Lensa-Agent': 'Test Runner',
    },
    body: data,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Upload ${kind} gagal (HTTP ${response.status}).`);
  }
}

export async function uploadTestPhoto(filePath, capturedAt = new Date()) {
  requireTestEnv();
  const buffer = fs.readFileSync(filePath);
  const processed = await processImage(buffer, path.basename(filePath));

  const prepareResponse = await fetch(`${BASE}/api/ingest/prepare`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${INGEST_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Lensa-Agent': 'Test Runner',
    },
    body: JSON.stringify({
      sha256: processed.hash,
      filename: processed.filename,
      mime: processed.mime,
      sizeBytes: processed.sizeBytes,
      width: processed.width,
      height: processed.height,
      capturedAt: capturedAt.toISOString(),
    }),
  });
  const prepared = await prepareResponse.json().catch(() => ({}));
  if (!prepareResponse.ok) return { response: prepareResponse, data: prepared };
  if (prepared.duplicate) return { response: prepareResponse, data: prepared };

  const photoId = prepared.photoId;
  if (!photoId) throw new Error('Server tidak mengembalikan photoId.');
  try {
    await ingestAsset(photoId, 'original', buffer, processed.mime);
    await ingestAsset(photoId, 'preview', processed.previewBuffer, 'image/jpeg');
    await ingestAsset(photoId, 'thumb', processed.thumbBuffer, 'image/jpeg');
  } catch (error) {
    await fetch(`${BASE}/api/ingest/abort`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${INGEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ photoId }),
    }).catch(() => undefined);
    throw error;
  }

  const commitResponse = await fetch(`${BASE}/api/ingest/commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${INGEST_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Lensa-Agent': 'Test Runner',
    },
    body: JSON.stringify({ photoId }),
  });
  const data = await commitResponse.json().catch(() => ({}));
  return { response: commitResponse, data };
}

const PALETTES = [
  ['#121018', '#9f3c50', '#f1c27d', '#2c4358'],
  ['#101814', '#3d6b58', '#d6a35c', '#1b2b2c'],
  ['#19121a', '#a94f36', '#e8b28d', '#2c1d28'],
  ['#0e1620', '#35698f', '#9fc6c9', '#152c38'],
  ['#1a140f', '#9b6b3d', '#e9d3a2', '#2b241b'],
  ['#14111c', '#64538d', '#d5b7c8', '#201c31'],
];

/**
 * Creates self-contained JPEG fixtures for tests. Returns absolute paths.
 */
export async function makeTestPhotos(count = 6) {
  const dir = path.resolve('test-results/fixtures');
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (let index = 0; index < count; index += 1) {
    const palette = PALETTES[index % PALETTES.length];
    const portrait = index % 3 !== 1;
    const width = portrait ? 1200 : 1600;
    const height = portrait ? 1500 : 1067;
    const [bg, a, b, c] = palette;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${bg}"/>
            <stop offset="1" stop-color="${c}"/>
          </linearGradient>
          <radialGradient id="glow" cx="0.35" cy="0.3" r="0.7">
            <stop offset="0" stop-color="${b}" stop-opacity="0.98"/>
            <stop offset="0.45" stop-color="${a}" stop-opacity="0.8"/>
            <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="rim" cx="0.7" cy="0.85" r="0.55">
            <stop offset="0" stop-color="${b}" stop-opacity="0.6"/>
            <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <rect width="100%" height="100%" fill="url(#glow)"/>
        <rect width="100%" height="100%" fill="url(#rim)"/>
        <circle cx="${width * 0.62}" cy="${height * 0.34}" r="${Math.min(width, height) * 0.22}"
          fill="none" stroke="${b}" stroke-opacity="0.55" stroke-width="2"/>
        <circle cx="${width * 0.36}" cy="${height * 0.68}" r="${Math.min(width, height) * 0.3}"
          fill="none" stroke="${a}" stroke-opacity="0.35" stroke-width="1.5"/>
        <path d="M0 ${height * 0.78} Q ${width * 0.3} ${height * 0.62} ${width} ${height * 0.86}"
          fill="none" stroke="${b}" stroke-opacity="0.3" stroke-width="3"/>
      </svg>`;
    const dest = path.join(dir, `test-${String(index + 1).padStart(2, '0')}.jpg`);
    await sharp(Buffer.from(svg)).jpeg({ quality: 88, mozjpeg: true }).toFile(dest);
    files.push(dest);
  }
  return files;
}
