#!/usr/bin/env node
/**
 * Lensa Local Uploader
 * Memantau folder hasil kamera, membuat preview/thumbnail dengan Sharp,
 * lalu mengunggah tiga aset ke Cloudflare Worker + R2.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { processImage } from '../shared/image.js';

const ROOT = path.resolve(import.meta.dirname);
const CONFIG_PATH = path.join(ROOT, 'config.json');
const STATE_PATH = path.join(ROOT, '.state.json');
const VERSION = '2.0.0';
const HEARTBEAT_MS = 10_000;
const SCAN_MS = 2_000;
const RETRY_MS = 8_000;

function stamp() {
  return new Date().toLocaleTimeString('id-ID', { hour12: false });
}

function log(message) {
  console.log(`[${stamp()}] ${message}`);
}

function logError(message, error) {
  console.error(`[${stamp()}] ${message}${error ? ` — ${error.message || error}` : ''}`);
}

async function loadConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(await fsp.readFile(CONFIG_PATH, 'utf8'));
    } catch (error) {
      throw new Error(`watcher/config.json tidak valid: ${error.message}`);
    }
  } else {
    throw new Error(
      'watcher/config.json belum ada. Salin watcher/config.example.json lalu isi serverUrl, ingestToken, dan watchDir.',
    );
  }

  const serverUrl = String(
    process.env.LENSA_SERVER_URL || fileConfig.serverUrl || '',
  ).replace(/\/+$/, '');
  const ingestToken = String(process.env.LENSA_INGEST_TOKEN || fileConfig.ingestToken || '');
  const watchDirRaw = String(process.env.LENSA_WATCH_DIR || fileConfig.watchDir || '');
  const agentName = String(
    process.env.LENSA_AGENT_NAME || fileConfig.agentName || 'Uploader Lensa',
  ).slice(0, 80);
  const stabilitySeconds = Math.max(
    1,
    Number(fileConfig.stabilitySeconds || process.env.LENSA_STABILITY_SECONDS || 2),
  );

  if (!serverUrl || !/^https?:\/\//i.test(serverUrl)) {
    throw new Error('serverUrl wajib berupa http:// atau https://.');
  }
  if (!ingestToken || ingestToken.length < 16) {
    throw new Error('ingestToken belum diisi (ambil dari secret server).');
  }
  if (!watchDirRaw) {
    throw new Error('watchDir belum diisi.');
  }
  const watchDir = path.resolve(watchDirRaw);
  const stat = await fsp.stat(watchDir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Folder pantau tidak ditemukan: ${watchDir}`);
  }

  return {
    serverUrl,
    ingestToken,
    watchDir,
    agentName,
    stabilityMs: stabilitySeconds * 1000,
  };
}

async function loadState() {
  try {
    const parsed = JSON.parse(await fsp.readFile(STATE_PATH, 'utf8'));
    if (parsed?.version === 1 && parsed.files && typeof parsed.files === 'object') {
      return parsed;
    }
  } catch {
    // state baru
  }
  return { version: 1, files: {} };
}

let state = await loadState();
let saveTimer = null;

function uploadKey(filePath, size, mtimeMs) {
  return `${filePath}|${size}|${Math.round(mtimeMs)}`;
}

function rebuildUploadedIndex() {
  if (!state.uploaded || typeof state.uploaded !== 'object') state.uploaded = {};
  for (const [key, entry] of Object.entries(state.files || {})) {
    if (entry?.status !== 'uploaded') continue;
    if (entry.filePath && entry.size != null && entry.mtimeMs != null) {
      state.uploaded[uploadKey(entry.filePath, entry.size, entry.mtimeMs)] = true;
      continue;
    }
    const first = key.indexOf('|');
    if (first < 0) continue;
    const rest = key.slice(first + 1);
    const last = rest.lastIndexOf('|');
    const previous = last < 0 ? -1 : rest.lastIndexOf('|', last - 1);
    if (previous < 0) continue;
    state.uploaded[uploadKey(rest.slice(0, previous), rest.slice(previous + 1, last), rest.slice(last + 1))] = true;
  }
}

rebuildUploadedIndex();

function scheduleStateSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      const entries = Object.entries(state.files || {});
      if (entries.length > 4000) {
        state.files = Object.fromEntries(entries.slice(-3500));
      }
      const temp = `${STATE_PATH}.tmp`;
      await fsp.writeFile(temp, JSON.stringify(state, null, 2));
      await fsp.rename(temp, STATE_PATH);
    } catch (error) {
      logError('Gagal menyimpan state uploader', error);
    }
  }, 400);
  saveTimer.unref?.();
}

function stateKey(sessionId, filePath, stat) {
  return `${sessionId || 'none'}|${filePath}|${stat.size}|${Math.round(stat.mtimeMs)}`;
}

function alreadyHandled(sessionId, filePath, stat) {
  return Boolean(state.files[stateKey(sessionId, filePath, stat)]);
}

function uploadedBefore(filePath, stat) {
  return Boolean(state.uploaded?.[uploadKey(filePath, stat.size, stat.mtimeMs)]);
}

function markHandled(sessionId, filePath, stat, status, extra = {}) {
  const entry = {
    status,
    at: new Date().toISOString(),
    name: path.basename(filePath),
    filePath,
    size: stat.size,
    mtimeMs: Math.round(stat.mtimeMs),
    ...extra,
  };
  state.files[stateKey(sessionId, filePath, stat)] = entry;
  if (status === 'uploaded') {
    if (!state.uploaded || typeof state.uploaded !== 'object') state.uploaded = {};
    state.uploaded[uploadKey(filePath, stat.size, stat.mtimeMs)] = true;
  }
  scheduleStateSave();
}

function isImageName(name) {
  return /\.(jpe?g|jfif)$/i.test(name);
}

async function listImages(dir, depth = 0) {
  if (depth > 4) return [];
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '@eaDir' || entry.name === 'System Volume Information') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listImages(fullPath, depth + 1)));
    } else if (entry.isFile() && isImageName(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const config = await loadConfig();
const pending = new Map();
const queue = [];
let activeSession = null;
let processing = false;
let lastSessionNotice = '';
let lastNoSessionLog = 0;
let lastServerError = 0;
let heartbeatTimer = null;
let scanTimer = null;
let stopped = false;

async function request(pathname, options = {}) {
  const response = await fetch(`${config.serverUrl}${pathname}`, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    headers: {
      Authorization: `Bearer ${config.ingestToken}`,
      'X-Lensa-Agent': config.agentName,
      ...(options.headers || {}),
    },
  });
  return response;
}

async function heartbeat({ initial = false } = {}) {
  try {
    const response = await request('/api/ingest/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName: config.agentName }),
      timeoutMs: 15_000,
    });
    if (response.status === 401) {
      throw Object.assign(new Error('Token uploader ditolak server (401). Periksa ingestToken.'), {
        fatal: true,
      });
    }
    if (!response.ok) {
      throw new Error(`Heartbeat gagal (HTTP ${response.status}).`);
    }
    const data = await response.json();
    const next = data.activeSession || null;
    const previousId = activeSession?.id || null;
    activeSession = next;
    if (next && next.id !== previousId) {
      const notice = `${next.id}|${next.title}`;
      if (notice !== lastSessionNotice) {
        lastSessionNotice = notice;
        log(`Sesi aktif: ${next.title} (berakhir ${formatTime(next.endsAt)}).`);
      }
    } else if (!next && previousId) {
      log('Sesi selesai. Uploader menunggu sesi baru.');
      lastSessionNotice = '';
    } else if (!next && initial) {
      log('Belum ada sesi aktif. Uploader siap; klik New Session di dashboard.');
    }
    return data;
  } catch (error) {
    if (error.fatal) throw error;
    const now = Date.now();
    if (now - lastServerError > 30_000) {
      lastServerError = now;
      logError(`Tidak bisa menghubungi server (${config.serverUrl})`, error);
    }
    return null;
  }
}

function formatTime(value) {
  try {
    return new Date(value).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '-';
  }
}

async function abortUpload(photoId) {
  if (!photoId) return;
  try {
    await request('/api/ingest/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId }),
      timeoutMs: 15_000,
    });
  } catch {
    // orphan cleanup di server; jangan gagalkan upload utama
  }
}

async function uploadAsset(photoId, kind, data, mime) {
  const response = await request('/api/ingest/asset', {
    method: 'POST',
    headers: {
      'X-Lensa-Photo-Id': photoId,
      'X-Lensa-Kind': kind,
      'Content-Type': mime,
      'Content-Length': String(data.length),
    },
    body: data,
    timeoutMs: 120_000,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Upload ${kind} gagal (HTTP ${response.status}).`);
  }
}

async function uploadPhoto(filePath, stat, session) {
  const filename = path.basename(filePath);
  const buffer = await fsp.readFile(filePath);
  const processed = await processImage(buffer, filename);

  const prepare = await request('/api/ingest/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sha256: processed.hash,
      filename: processed.filename,
      mime: processed.mime,
      sizeBytes: processed.sizeBytes,
      width: processed.width,
      height: processed.height,
    }),
    timeoutMs: 30_000,
  });

  if (prepare.status === 401) {
    throw Object.assign(new Error('Token uploader ditolak server (401). Periksa ingestToken.'), {
      fatal: true,
    });
  }
  if (prepare.status === 409) {
    activeSession = null;
    const now = Date.now();
    if (now - lastNoSessionLog > 30_000) {
      lastNoSessionLog = now;
      log('Server belum punya sesi aktif; foto ditahan dan akan dicoba lagi.');
    }
    return { retry: true };
  }
  if (prepare.status === 422) {
    const payload = await prepare.json().catch(() => ({}));
    markHandled(session.id, filePath, stat, 'skipped', { reason: payload.error || 'old' });
    log(`Dilewati (foto lama): ${filename}`);
    return { ok: true };
  }
  if (!prepare.ok) {
    const payload = await prepare.json().catch(() => ({}));
    throw new Error(payload.message || `Persiapan upload gagal (HTTP ${prepare.status}).`);
  }

  const prepared = await prepare.json();
  if (prepared.duplicate) {
    markHandled(session.id, filePath, stat, 'uploaded', {
      duplicate: true,
      photoId: prepared.photo?.id,
    });
    log(`Sudah ada: ${filename}`);
    return { ok: true };
  }

  const photoId = prepared.photoId;
  if (!photoId) throw new Error('Server tidak mengembalikan photoId.');

  try {
    await uploadAsset(photoId, 'original', buffer, processed.mime);
    await uploadAsset(photoId, 'preview', processed.previewBuffer, 'image/jpeg');
    await uploadAsset(photoId, 'thumb', processed.thumbBuffer, 'image/jpeg');

    const commit = await request('/api/ingest/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId }),
      timeoutMs: 30_000,
    });
    if (!commit.ok) {
      const payload = await commit.json().catch(() => ({}));
      throw new Error(payload.message || `Commit upload gagal (HTTP ${commit.status}).`);
    }
    const payload = await commit.json();

    markHandled(session.id, filePath, stat, 'uploaded', {
      duplicate: Boolean(payload.duplicate),
      photoId,
    });
    log(`Terunggah: ${filename}`);
    return { ok: true };
  } catch (error) {
    await abortUpload(photoId);
    throw error;
  }
}

async function drainQueue() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length && !stopped) {
      const item = queue.shift();
      if (!activeSession) break;
      if (activeSession.id !== item.sessionId) continue;
      if (alreadyHandled(item.sessionId, item.filePath, item.stat)) continue;
      try {
        const result = await uploadPhoto(item.filePath, item.stat, activeSession);
        if (result.retry) {
          queue.unshift(item);
          break;
        }
        pending.delete(item.filePath);
      } catch (error) {
        if (error.fatal) throw error;
        logError(`Gagal upload ${path.basename(item.filePath)}; dicoba lagi`, error);
        setTimeout(() => {
          if (!queue.some((queued) => queued.filePath === item.filePath)) queue.push(item);
          drainQueue().catch(() => undefined);
        }, RETRY_MS).unref?.();
        break;
      }
    }
  } finally {
    processing = false;
  }
}

async function scan() {
  if (stopped) return;
  const now = Date.now();
  const files = await listImages(config.watchDir);
  const seen = new Set();

  for (const filePath of files) {
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size < 1024) continue;
    seen.add(filePath);

    const previous = pending.get(filePath);
    if (!previous || previous.size !== stat.size || previous.mtimeMs !== stat.mtimeMs) {
      pending.set(filePath, { size: stat.size, mtimeMs: stat.mtimeMs, since: now });
      continue;
    }
    if (now - previous.since < config.stabilityMs) continue;

    if (!activeSession) continue;
    if (alreadyHandled(activeSession.id, filePath, stat)) {
      pending.delete(filePath);
      continue;
    }

    // Tanggal file tidak dipakai: kamera bisa belum di-set. Cegah duplikat
    // dengan catatan file yang sudah pernah diunggah, bukan dengan mtime.
    if (uploadedBefore(filePath, stat)) {
      markHandled(activeSession.id, filePath, stat, 'skipped', { reason: 'already_uploaded' });
      pending.delete(filePath);
      continue;
    }

    if (!queue.some((item) => item.filePath === filePath)) {
      queue.push({
        filePath,
        stat: { size: stat.size, mtimeMs: stat.mtimeMs },
        sessionId: activeSession.id,
      });
    }
  }

  for (const filePath of pending.keys()) {
    if (!seen.has(filePath)) pending.delete(filePath);
  }
  drainQueue().catch((error) => {
    if (error.fatal) {
      logError(error.message);
      shutdown(1);
    } else {
      logError('Antrean upload error', error);
    }
  });
}

function shutdown(code = 0) {
  if (stopped) return;
  stopped = true;
  clearInterval(heartbeatTimer);
  clearInterval(scanTimer);
  if (saveTimer) clearTimeout(saveTimer);
  fsp
    .writeFile(STATE_PATH, JSON.stringify(state, null, 2))
    .catch(() => undefined)
    .finally(() => {
      log('Uploader berhenti.');
      process.exit(code);
    });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('unhandledRejection', (error) => {
  logError('Unhandled rejection', error);
});

log(`Uploader Lensa v${VERSION}`);
log(`Folder   ${config.watchDir}`);
log(`Server   ${config.serverUrl}`);
log(`Agen     ${config.agentName}`);

try {
  await heartbeat({ initial: true });
} catch (error) {
  logError(error.message);
  process.exit(1);
}

heartbeatTimer = setInterval(() => {
  heartbeat().catch((error) => {
    if (error.fatal) {
      logError(error.message);
      shutdown(1);
    }
  });
}, HEARTBEAT_MS);
scanTimer = setInterval(() => {
  scan().catch((error) => logError('Scan folder gagal', error));
}, SCAN_MS);
scan().catch((error) => logError('Scan folder gagal', error));
