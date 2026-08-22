import * as UTIF from 'utif';
import type { ImageFrame } from '../types';

export function decodeTiff(buffer: ArrayBuffer): ImageFrame {
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error('No image found in TIFF file.');
  const ifd = ifds[0]!;
  UTIF.decodeImage(buffer, ifd);
  const rgba = UTIF.toRGBA8(ifd);
  if (!ifd.width || !ifd.height) throw new Error('Invalid TIFF dimensions.');
  return { width: ifd.width, height: ifd.height, data: new Uint8ClampedArray(rgba) };
}
