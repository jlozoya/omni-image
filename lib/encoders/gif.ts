import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { ImageFrame } from '../types';

export function encodeGif(frame: ImageFrame): Uint8Array {
  const format = 'rgba4444' as const;
  const palette = quantize(frame.data, 256, { format, oneBitAlpha: 127 });
  const index = applyPalette(frame.data, palette, format);
  const transparentIndex = palette.findIndex((color) => color.length === 4 && (color[3] ?? 255) === 0);
  const gif = GIFEncoder();
  gif.writeFrame(index, frame.width, frame.height, {
    palette,
    transparent: transparentIndex >= 0,
    transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
  });
  gif.finish();
  return gif.bytes();
}
