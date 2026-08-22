import { canvasToBlob, frameToCanvas } from '../canvas';
import type { ImageFrame } from '../types';

export async function encodeNative(frame: ImageFrame, mime: 'image/png' | 'image/jpeg' | 'image/webp', quality: number): Promise<Uint8Array> {
  const canvas = frameToCanvas(frame);
  const blob = await canvasToBlob(canvas, mime, quality);
  if (blob.type !== mime && mime !== 'image/jpeg') {
    throw new Error(`${mime} encoding is not supported by this browser context.`);
  }
  return new Uint8Array(await blob.arrayBuffer());
}
