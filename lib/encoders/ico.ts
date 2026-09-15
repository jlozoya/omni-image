import { resizeFrame } from '../canvas';
import type { ImageFrame } from '../types';
import { encodeNative } from './native';

export async function encodeIco(frame: ImageFrame, sizes: number[]): Promise<Uint8Array> {
  const normalized = [...new Set(sizes.map((s) => Math.max(1, Math.min(256, Math.round(s)))))].sort((a, b) => a - b);
  if (normalized.length === 0) normalized.push(16, 32, 48, 256);

  const images: Uint8Array[] = [];
  for (const size of normalized) {
    const resized = frame.width === size && frame.height === size ? frame : await resizeFrame(frame, size, size);
    images.push(await encodeNative(resized, 'image/png', 1));
  }

  const headerSize = 6 + normalized.length * 16;
  const total = headerSize + images.reduce((sum, bytes) => sum + bytes.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, normalized.length, true);

  let offset = headerSize;
  normalized.forEach((size, index) => {
    const entry = 6 + index * 16;
    const png = images[index]!;
    out[entry] = size === 256 ? 0 : size;
    out[entry + 1] = size === 256 ? 0 : size;
    out[entry + 2] = 0;
    out[entry + 3] = 0;
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });

  return out;
}
