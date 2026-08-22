import * as UTIF from 'utif';
import type { ImageFrame } from '../types';

export function encodeTiff(frame: ImageFrame): Uint8Array {
  const copy = new Uint8Array(frame.data);
  const encoded = UTIF.encodeImage(copy.buffer, frame.width, frame.height);
  return new Uint8Array(encoded);
}
