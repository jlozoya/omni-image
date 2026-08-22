import type { ImageFrame } from '../types';
import { ascii, concatBytes } from '../utils';

export function encodePpm(frame: ImageFrame): Uint8Array {
  const pixels = new Uint8Array(frame.width * frame.height * 3);
  let p = 0;
  for (let i = 0; i < frame.data.length; i += 4) {
    pixels[p++] = frame.data[i] ?? 0;
    pixels[p++] = frame.data[i + 1] ?? 0;
    pixels[p++] = frame.data[i + 2] ?? 0;
  }
  return concatBytes([ascii(`P6\n${frame.width} ${frame.height}\n255\n`), pixels]);
}

export function encodePgm(frame: ImageFrame): Uint8Array {
  const pixels = new Uint8Array(frame.width * frame.height);
  let p = 0;
  for (let i = 0; i < frame.data.length; i += 4) {
    const r = frame.data[i] ?? 0;
    const g = frame.data[i + 1] ?? 0;
    const b = frame.data[i + 2] ?? 0;
    pixels[p++] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  return concatBytes([ascii(`P5\n${frame.width} ${frame.height}\n255\n`), pixels]);
}

export function encodePbm(frame: ImageFrame): Uint8Array {
  const rowBytes = Math.ceil(frame.width / 8);
  const pixels = new Uint8Array(rowBytes * frame.height);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const src = (y * frame.width + x) * 4;
      const r = frame.data[src] ?? 0;
      const g = frame.data[src + 1] ?? 0;
      const b = frame.data[src + 2] ?? 0;
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (gray < 128) pixels[y * rowBytes + (x >> 3)]! |= 1 << (7 - (x & 7));
    }
  }
  return concatBytes([ascii(`P4\n${frame.width} ${frame.height}\n`), pixels]);
}

export function encodePam(frame: ImageFrame): Uint8Array {
  const header = ascii(`P7\nWIDTH ${frame.width}\nHEIGHT ${frame.height}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`);
  return concatBytes([header, new Uint8Array(frame.data)]);
}
