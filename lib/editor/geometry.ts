import { clamp } from '../utils';
import type { Annotation } from './model';
import type { CropRect } from '../crop';

/** The area the crop frame may occupy. It can be larger than the image, adding canvas around it. */
export interface Bounds { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }
export interface Box { left: number; top: number; width: number; height: number }

/** Free-drawn crop: the pointer drags away from the anchor, optionally locked to a ratio. */
export function cropFromAnchor(anchor: Point, p: Point, bounds: Bounds, ratio: number): CropRect {
  let width = Math.max(1, Math.abs(p.x - anchor.x)), height = Math.max(1, Math.abs(p.y - anchor.y));
  if (ratio) {
    height = width / ratio;
    const availableY = p.y < anchor.y ? anchor.y - bounds.y : bounds.y + bounds.height - anchor.y;
    if (height > availableY) { height = availableY; width = height * ratio; }
  }
  return { x: p.x < anchor.x ? anchor.x - width : anchor.x, y: p.y < anchor.y ? anchor.y - height : anchor.y, width, height };
}

/** Drag one corner of an existing crop. With a ratio the opposite corner stays pinned. */
export function resizeCropFromCorner(base: CropRect, corner: string, p: Point, dx: number, dy: number, bounds: Bounds, ratio: number): CropRect {
  if (ratio) {
    const fixedX = corner.includes('w') ? base.x + base.width : base.x;
    const fixedY = corner.includes('n') ? base.y + base.height : base.y;
    const maxWidth = corner.includes('w') ? fixedX - bounds.x : bounds.x + bounds.width - fixedX;
    const maxHeight = corner.includes('n') ? fixedY - bounds.y : bounds.y + bounds.height - fixedY;
    let width = Math.min(Math.max(1, Math.abs(p.x - fixedX)), maxWidth);
    let height = Math.min(Math.max(1, Math.abs(p.y - fixedY)), maxHeight);
    if (width / ratio <= height) height = width / ratio;
    else width = height * ratio;
    if (height > maxHeight) { height = maxHeight; width = height * ratio; }
    if (width > maxWidth) { width = maxWidth; height = width / ratio; }
    return {
      x: corner.includes('w') ? fixedX - width : fixedX,
      y: corner.includes('n') ? fixedY - height : fixedY,
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }
  let left = base.x, right = base.x + base.width, top = base.y, bottom = base.y + base.height;
  if (corner.includes('w')) left = clamp(left + dx, bounds.x, right - 1);
  if (corner.includes('e')) right = clamp(right + dx, left + 1, bounds.x + bounds.width);
  if (corner.includes('n')) top = clamp(top + dy, bounds.y, bottom - 1);
  if (corner.includes('s')) bottom = clamp(bottom + dy, top + 1, bounds.y + bounds.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Selection box of an annotation, in 0..1 coordinates of the output canvas. */
export function annotationBounds(item: Annotation): Box {
  if (item.kind === 'text') {
    const lines = item.text.split('\n');
    const width = Math.min(Math.max(.035, Math.max(...lines.map((line) => line.length), 1) * item.size * .5), 1);
    const height = Math.min(Math.max(.035, lines.length * item.size * 1.2), 1);
    return { left: clamp(item.x, 0, 1 - width), top: clamp(item.y, 0, 1 - height), width, height };
  }
  if (item.kind === 'number') {
    const radius = Math.max(.02, item.size * .8);
    const size = Math.min(radius * 2, 1);
    return { left: clamp(item.x - radius, 0, 1 - size), top: clamp(item.y - radius, 0, 1 - size), width: size, height: size };
  }
  const left = Math.min(item.x, item.endX), right = Math.max(item.x, item.endX);
  const top = Math.min(item.y, item.endY), bottom = Math.max(item.y, item.endY);
  return { left, top, width: Math.max(.025, right - left), height: Math.max(.025, bottom - top) };
}

export function moveAnnotation(item: Annotation, dx: number, dy: number): Annotation {
  const bounds = annotationBounds(item);
  const safeDx = clamp(dx, -bounds.left, 1 - bounds.left - bounds.width);
  const safeDy = clamp(dy, -bounds.top, 1 - bounds.top - bounds.height);
  return { ...item, x: item.x + safeDx, y: item.y + safeDy, endX: item.endX + safeDx, endY: item.endY + safeDy };
}

export function resizeAnnotation(item: Annotation, mode: string, p: Point, start: Point): Annotation {
  if (item.kind === 'text' || item.kind === 'number') return moveAnnotation(item, p.x - start.x, p.y - start.y);
  const dx = p.x - start.x, dy = p.y - start.y;
  const corner = mode.replace('annotation-resize-', '');
  let left = Math.min(item.x, item.endX), right = Math.max(item.x, item.endX);
  let top = Math.min(item.y, item.endY), bottom = Math.max(item.y, item.endY);
  if (corner.includes('w')) left = clamp(left + dx, 0, right - .002);
  if (corner.includes('e')) right = clamp(right + dx, left + .002, 1);
  if (corner.includes('n')) top = clamp(top + dy, 0, bottom - .002);
  if (corner.includes('s')) bottom = clamp(bottom + dy, top + .002, 1);
  return { ...item, x: clamp(left, 0, 1), y: clamp(top, 0, 1), endX: clamp(right, 0, 1), endY: clamp(bottom, 0, 1) };
}

/** Topmost text annotation under a point, or null. */
export function textAnnotationAt(annotations: Annotation[], at: Point): number | null {
  for (let index = annotations.length - 1; index >= 0; index--) {
    const item = annotations[index];
    if (item?.kind !== 'text') continue;
    const bounds = annotationBounds(item);
    if (at.x >= bounds.left && at.x <= bounds.left + bounds.width && at.y >= bounds.top && at.y <= bounds.top + bounds.height) return index;
  }
  return null;
}
