import type { ImageFrame } from './types';

export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

function hasDocument(): boolean {
  return typeof document !== 'undefined';
}

export function makeCanvas(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (hasDocument()) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error('Canvas is not available in this context.');
}

export function frameToCanvas(frame: ImageFrame): CanvasLike {
  const canvas = makeCanvas(frame.width, frame.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context.');
  const imageData = new ImageData(frame.data, frame.width, frame.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export async function canvasToBlob(canvas: CanvasLike, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(`Could not encode ${type}`))), type, quality);
  });
}

export async function resizeFrame(frame: ImageFrame, width: number, height: number): Promise<ImageFrame> {
  const source = frameToCanvas(frame);
  const target = makeCanvas(width, height);
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context.');
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  return { width, height, data: new Uint8ClampedArray(data) };
}

/**
 * Places `frame` inside a width x height canvas without distorting it,
 * at a caller-chosen offset and scale (e.g. dragged/zoomed by the user).
 * Leftover space is padded (transparent, or filled with `background`
 * when the target format has no alpha channel).
 */
export async function placeFrame(
  frame: ImageFrame,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  imageScale: number,
  background: string,
  hasAlpha: boolean,
): Promise<ImageFrame> {
  const drawWidth = Math.max(1, Math.round(frame.width * imageScale));
  const drawHeight = Math.max(1, Math.round(frame.height * imageScale));

  const source = frameToCanvas(frame);
  const target = makeCanvas(width, height);
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context.');

  if (hasAlpha) {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(
    source as CanvasImageSource,
    0,
    0,
    frame.width,
    frame.height,
    Math.round(offsetX),
    Math.round(offsetY),
    drawWidth,
    drawHeight,
  );

  const data = ctx.getImageData(0, 0, width, height).data;
  return { width, height, data: new Uint8ClampedArray(data) };
}

export async function bitmapToFrame(bitmap: ImageBitmap): Promise<ImageFrame> {
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context.');
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  bitmap.close();
  return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(data) };
}

export async function blobToFrame(blob: Blob): Promise<ImageFrame> {
  const bitmap = await createImageBitmap(blob);
  return bitmapToFrame(bitmap);
}
