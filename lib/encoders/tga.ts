import type { ImageFrame } from '../types';

export function encodeTga(frame: ImageFrame): Uint8Array {
  const out = new Uint8Array(18 + frame.width * frame.height * 4);
  const view = new DataView(out.buffer);
  out[2] = 2; // uncompressed true-color
  view.setUint16(12, frame.width, true);
  view.setUint16(14, frame.height, true);
  out[16] = 32;
  out[17] = 0x28; // 8-bit alpha + top-left origin
  let dst = 18;
  for (let i = 0; i < frame.data.length; i += 4) {
    out[dst++] = frame.data[i + 2] ?? 0;
    out[dst++] = frame.data[i + 1] ?? 0;
    out[dst++] = frame.data[i] ?? 0;
    out[dst++] = frame.data[i + 3] ?? 255;
  }
  return out;
}
