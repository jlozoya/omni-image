import { frameToCanvas, makeCanvas } from './canvas';
import type { ImageFrame } from './types';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The rect may reach past the frame: whatever falls outside becomes canvas,
 * filled with `background` or left transparent when the format keeps alpha.
 */
export function cropFrame(frame: ImageFrame, rect: CropRect, background?: string): ImageFrame {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  if (x >= 0 && y >= 0 && x + width <= frame.width && y + height <= frame.height) {
    const canvas = frameToCanvas(frame);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create 2D canvas context.');
    const imageData = ctx.getImageData(x, y, width, height);
    return { width, height, data: new Uint8ClampedArray(imageData.data) };
  }

  const target = makeCanvas(width, height);
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context.');
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
  ctx.drawImage(frameToCanvas(frame) as CanvasImageSource, -x, -y);
  return { width, height, data: new Uint8ClampedArray(ctx.getImageData(0, 0, width, height).data) };
}
