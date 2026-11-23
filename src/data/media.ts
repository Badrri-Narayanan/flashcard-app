import { baseRecord } from '../domain/ids';
import { repo } from './repo';

const JPEG_QUALITY = 0.85;

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), type, type === 'image/jpeg' ? JPEG_QUALITY : undefined);
  });
}

/** Scales the longest side down to maxDim; PNG stays PNG, everything else becomes JPEG. */
export async function resizeImage(file: Blob, maxDim = 1600): Promise<ResizedImage> {
  const { source, width, height, release } = await decode(file);
  try {
    if (width <= maxDim && height <= maxDim) return { blob: file, width, height };
    const scale = maxDim / Math.max(width, height);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(source, 0, 0, w, h);
    const blob = await toBlob(canvas, file.type === 'image/png' ? 'image/png' : 'image/jpeg');
    return { blob, width: w, height: h };
  } finally {
    release();
  }
}

/** Resizes and persists an image; returns the Markdown-ready `media:<id>` reference. */
export async function storeImage(file: Blob): Promise<string> {
  const { blob, width, height } = await resizeImage(file);
  const record = { ...baseRecord(), blob, mime: blob.type, width, height };
  await repo.putMedia(record);
  return `media:${record.id}`;
}
