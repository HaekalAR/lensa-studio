import type { Photo } from '../types';

export const STRIP_WIDTH = 1386;
export const STRIP_HEIGHT = 3024;
export const STRIP_FRAME_URL = '/strip-frame.png';

export const STRIP_SLOTS = [
  { x: 190, y: 605, width: 1055, height: 672 },
  { x: 190, y: 1301, width: 1055, height: 671 },
  { x: 190, y: 1996, width: 1055, height: 672 },
] as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Gagal memuat gambar.'));
    image.src = src;
  });
}

async function loadPhoto(src: string): Promise<CanvasImageSource> {
  const response = await fetch(src, { credentials: 'omit' });
  if (!response.ok) throw new Error('Gagal mengambil foto.');
  const blob = await response.blob();
  if ('createImageBitmap' in window) {
    return createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = 'width' in image ? Number(image.width) : 0;
  const sourceHeight = 'height' in image ? Number(image.height) : 0;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sourceX = (sourceWidth - cropWidth) / 2;
  const sourceY = (sourceHeight - cropHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
}

export async function composeStrip(photos: Photo[]): Promise<Blob> {
  const [frame, ...images] = await Promise.all([
    loadImage(STRIP_FRAME_URL),
    ...photos.slice(0, 3).map((photo) => loadPhoto(photo.previewUrl)),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = STRIP_WIDTH;
  canvas.height = STRIP_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia di browser ini.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);

  STRIP_SLOTS.forEach((slot, index) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
    const image = images[index];
    if (!image) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(slot.x, slot.y, slot.width, slot.height);
    ctx.clip();
    drawCover(ctx, image, slot.x, slot.y, slot.width, slot.height);
    ctx.restore();
  });

  ctx.drawImage(frame, 0, 0, STRIP_WIDTH, STRIP_HEIGHT);

  images.forEach((image) => {
    if ('close' in image && typeof image.close === 'function') image.close();
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal membuat file strip.'))),
      'image/jpeg',
      0.92,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
