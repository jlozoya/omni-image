import type { ImageFrame } from '../types';

export function encodeBmp(frame: ImageFrame): Uint8Array {
  const pixelBytes = frame.width * frame.height * 4;
  const fileSize = 14 + 40 + pixelBytes;
  const out = new Uint8Array(fileSize);
  const view = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, frame.width, true);
  view.setInt32(22, -frame.height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(34, pixelBytes, true);

  let dst = 54;
  for (let i = 0; i < frame.data.length; i += 4) {
    out[dst++] = frame.data[i + 2] ?? 0;
    out[dst++] = frame.data[i + 1] ?? 0;
    out[dst++] = frame.data[i] ?? 0;
    out[dst++] = frame.data[i + 3] ?? 255;
  }
  return out;
}
