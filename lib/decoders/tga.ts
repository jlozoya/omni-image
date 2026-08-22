import type { ImageFrame } from '../types';

export function decodeTga(buffer: ArrayBuffer): ImageFrame {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const idLength = bytes[0] ?? 0;
  const colorMapType = bytes[1] ?? 0;
  const imageType = bytes[2] ?? 0;
  if (colorMapType !== 0 || imageType !== 2) throw new Error('Only uncompressed true-color TGA is supported.');
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const depth = bytes[16] ?? 0;
  const descriptor = bytes[17] ?? 0;
  if (depth !== 24 && depth !== 32) throw new Error('Only 24-bit and 32-bit TGA are supported.');
  const topOrigin = (descriptor & 0x20) !== 0;
  const srcBpp = depth / 8;
  const offset = 18 + idLength;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = topOrigin ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const src = offset + (sourceY * width + x) * srcBpp;
      const dst = (y * width + x) * 4;
      out[dst] = bytes[src + 2] ?? 0;
      out[dst + 1] = bytes[src + 1] ?? 0;
      out[dst + 2] = bytes[src] ?? 0;
      out[dst + 3] = srcBpp === 4 ? (bytes[src + 3] ?? 255) : 255;
    }
  }
  return { width, height, data: out };
}
