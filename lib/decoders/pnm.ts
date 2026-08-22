import type { ImageFrame } from '../types';

function nextToken(bytes: Uint8Array, state: { i: number }): string {
  while (state.i < bytes.length) {
    const c = bytes[state.i]!;
    if (c === 35) {
      while (state.i < bytes.length && bytes[state.i] !== 10) state.i++;
    } else if (c <= 32) {
      state.i++;
    } else break;
  }
  const start = state.i;
  while (state.i < bytes.length && bytes[state.i]! > 32 && bytes[state.i] !== 35) state.i++;
  return new TextDecoder().decode(bytes.subarray(start, state.i));
}

function skipWhitespace(bytes: Uint8Array, state: { i: number }) {
  while (state.i < bytes.length && bytes[state.i]! <= 32) state.i++;
}

export function decodePnm(buffer: ArrayBuffer): ImageFrame {
  const bytes = new Uint8Array(buffer);
  const state = { i: 0 };
  const magic = nextToken(bytes, state);
  if (magic === 'P7') return decodePam(bytes, state);
  if (!['P4', 'P5', 'P6'].includes(magic)) throw new Error('Only binary PBM/PGM/PPM/PAM files are supported.');
  const width = Number(nextToken(bytes, state));
  const height = Number(nextToken(bytes, state));
  let max = 1;
  if (magic !== 'P4') max = Number(nextToken(bytes, state));
  if (!width || !height || max <= 0 || max > 255) throw new Error('Unsupported PNM dimensions or bit depth.');
  skipWhitespace(bytes, state);
  const out = new Uint8ClampedArray(width * height * 4);

  if (magic === 'P6') {
    for (let p = 0, i = state.i; p < width * height; p++, i += 3) {
      const dst = p * 4;
      out[dst] = Math.round((bytes[i] ?? 0) * 255 / max);
      out[dst + 1] = Math.round((bytes[i + 1] ?? 0) * 255 / max);
      out[dst + 2] = Math.round((bytes[i + 2] ?? 0) * 255 / max);
      out[dst + 3] = 255;
    }
  } else if (magic === 'P5') {
    for (let p = 0, i = state.i; p < width * height; p++, i++) {
      const g = Math.round((bytes[i] ?? 0) * 255 / max);
      const dst = p * 4;
      out[dst] = out[dst + 1] = out[dst + 2] = g;
      out[dst + 3] = 255;
    }
  } else {
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = ((bytes[state.i + y * rowBytes + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
        const value = bit ? 0 : 255;
        const dst = (y * width + x) * 4;
        out[dst] = out[dst + 1] = out[dst + 2] = value;
        out[dst + 3] = 255;
      }
    }
  }
  return { width, height, data: out };
}

function decodePam(bytes: Uint8Array, state: { i: number }): ImageFrame {
  let width = 0, height = 0, depth = 0, max = 255;
  while (state.i < bytes.length) {
    while (state.i < bytes.length && (bytes[state.i] === 10 || bytes[state.i] === 13)) state.i++;
    const lineStart = state.i;
    while (state.i < bytes.length && bytes[state.i] !== 10) state.i++;
    const line = new TextDecoder().decode(bytes.subarray(lineStart, state.i)).trim();
    state.i++;
    if (line === 'ENDHDR') break;
    const [key, value] = line.split(/\s+/, 2);
    if (key === 'WIDTH') width = Number(value);
    if (key === 'HEIGHT') height = Number(value);
    if (key === 'DEPTH') depth = Number(value);
    if (key === 'MAXVAL') max = Number(value);
  }
  if (!width || !height || ![1, 2, 3, 4].includes(depth) || max > 255) throw new Error('Unsupported PAM file.');
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const src = state.i + p * depth;
    const dst = p * 4;
    if (depth === 1 || depth === 2) {
      const g = Math.round((bytes[src] ?? 0) * 255 / max);
      out[dst] = out[dst + 1] = out[dst + 2] = g;
      out[dst + 3] = depth === 2 ? Math.round((bytes[src + 1] ?? max) * 255 / max) : 255;
    } else {
      out[dst] = Math.round((bytes[src] ?? 0) * 255 / max);
      out[dst + 1] = Math.round((bytes[src + 1] ?? 0) * 255 / max);
      out[dst + 2] = Math.round((bytes[src + 2] ?? 0) * 255 / max);
      out[dst + 3] = depth === 4 ? Math.round((bytes[src + 3] ?? max) * 255 / max) : 255;
    }
  }
  return { width, height, data: out };
}
