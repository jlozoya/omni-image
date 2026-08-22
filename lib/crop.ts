import { frameToCanvas } from './canvas';
import type { ImageFrame } from './types';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropFrame(frame: ImageFrame, rect: CropRect): ImageFrame {
  const x = Math.max(0, Math.min(frame.width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(frame.height - 1, Math.round(rect.y)));
  const width = Math.max(1, Math.min(frame.width - x, Math.round(rect.width)));
  const height = Math.max(1, Math.min(frame.height - y, Math.round(rect.height)));

  const canvas = frameToCanvas(frame);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context.');
  const imageData = ctx.getImageData(x, y, width, height);
  return { width, height, data: new Uint8ClampedArray(imageData.data) };
}
