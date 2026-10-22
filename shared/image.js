import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const FORMAT_TO_MIME = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function safeFilename(input) {
  const base = path.basename(String(input || 'foto.jpg'));
  const cleaned = base
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'foto.jpg';
}

export function extensionForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export async function processImage(buffer, originalFilename = 'foto.jpg') {
  if (!buffer?.length) {
    throw Object.assign(new Error('File foto kosong.'), { statusCode: 400 });
  }

  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: 120_000_000 }).metadata();
  } catch {
    throw Object.assign(new Error('File tidak bisa dibaca sebagai gambar.'), {
      statusCode: 415,
    });
  }

  if (!metadata.width || !metadata.height) {
    throw Object.assign(new Error('Dimensi foto tidak valid.'), { statusCode: 415 });
  }

  const detectedMime = FORMAT_TO_MIME[metadata.format];
  if (!detectedMime) {
    throw Object.assign(new Error('Format foto harus JPEG, PNG, atau WebP.'), {
      statusCode: 415,
    });
  }

  const rotated = metadata.orientation && metadata.orientation >= 5;
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;

  const previewBuffer = await sharp(buffer, { limitInputPixels: 120_000_000 })
    .rotate()
    .flatten({ background: '#14120f' })
    .resize({
      width: 2400,
      height: 2400,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 84, mozjpeg: true, progressive: true })
    .toBuffer();

  const thumbBuffer = await sharp(buffer, { limitInputPixels: 120_000_000 })
    .rotate()
    .flatten({ background: '#14120f' })
    .resize({
      width: 720,
      height: 720,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 76, mozjpeg: true, progressive: true })
    .toBuffer();

  return {
    width,
    height,
    previewBuffer,
    thumbBuffer,
    hash: sha256(buffer),
    filename: safeFilename(originalFilename),
    mime: detectedMime,
    extension: extensionForMime(detectedMime),
    sizeBytes: buffer.length,
  };
}

export function attachmentHeader(filename) {
  const ascii = safeFilename(filename)
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
