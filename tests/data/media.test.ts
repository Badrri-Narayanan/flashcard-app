import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { resizeImage, storeImage } from '../../src/data/media';

interface Drawn {
  w: number;
  h: number;
}

function stubCanvas(srcW: number, srcH: number) {
  const drawn: Drawn[] = [];
  const toBlobTypes: Array<{ type?: string; quality?: number }> = [];
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: srcW, height: srcH, close: vi.fn() })));
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: ElementCreationOptions) => {
    if (tag !== 'canvas') return realCreate(tag, opts);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => drawn.push({ w: canvas.width, h: canvas.height }) }),
      toBlob: (cb: (b: Blob | null) => void, type?: string, quality?: number) => {
        toBlobTypes.push({ type, quality });
        cb(new Blob(['x'], { type }));
      },
    };
    return canvas as unknown as HTMLCanvasElement;
  });
  return { drawn, toBlobTypes };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resizeImage', () => {
  it('downsizes 3000x2000 to 1600x1067', async () => {
    const { drawn, toBlobTypes } = stubCanvas(3000, 2000);
    const out = await resizeImage(new Blob(['a'], { type: 'image/jpeg' }));
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1067);
    expect(drawn).toEqual([{ w: 1600, h: 1067 }]);
    expect(toBlobTypes).toEqual([{ type: 'image/jpeg', quality: 0.85 }]);
    expect(out.blob.type).toBe('image/jpeg');
  });

  it('keeps PNG input as PNG', async () => {
    const { toBlobTypes } = stubCanvas(2000, 3000);
    const out = await resizeImage(new Blob(['a'], { type: 'image/png' }));
    expect([out.width, out.height]).toEqual([1067, 1600]);
    expect(toBlobTypes[0].type).toBe('image/png');
  });

  it('returns the original blob when already small enough', async () => {
    const { drawn } = stubCanvas(800, 600);
    const input = new Blob(['a'], { type: 'image/jpeg' });
    const out = await resizeImage(input);
    expect(out.blob).toBe(input);
    expect([out.width, out.height]).toEqual([800, 600]);
    expect(drawn).toEqual([]);
  });
});

describe('storeImage', () => {
  it('saves media and returns a media: reference', async () => {
    stubCanvas(100, 50);
    const ref = await storeImage(new Blob(['a'], { type: 'image/png' }));
    expect(ref).toMatch(/^media:[0-9a-f-]{36}$/);
    const m = await repo.getMedia(ref.slice('media:'.length));
    expect(m).toMatchObject({ mime: 'image/png', width: 100, height: 50, deletedAt: null });
  });
});
