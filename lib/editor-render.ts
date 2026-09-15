import { frameToCanvas, makeCanvas, placeFrame, resizeFrame } from './canvas';
import { cropFrame } from './crop';
import { encodeFrame } from './codec';
import { formatInfo } from './formats';
import type { Annotation, EditState } from './editor-model';
import type { ImageFrame } from './types';

export function validateDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 ||
      width > 32767 || height > 32767 || width * height > 40_000_000) {
    throw new Error('La imagen debe medir entre 1 y 32767 px por lado y como máximo 40 megapíxeles.');
  }
}
export function transformFrame(frame: ImageFrame, edit: EditState): ImageFrame {
  if (!edit.rotation && !edit.flipX && !edit.flipY) return frame;
  const swap = edit.rotation % 180 !== 0;
  const canvas = makeCanvas(swap ? frame.height : frame.width, swap ? frame.width : frame.height);
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(edit.flipX ? -1 : 1, edit.flipY ? -1 : 1);
  ctx.rotate(edit.rotation * Math.PI / 180);
  ctx.drawImage(frameToCanvas(frame), -frame.width / 2, -frame.height / 2);
  return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
}
export function drawAnnotations(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, annotations: Annotation[], width: number, height: number) {
  for (const a of annotations) {
    const x = a.x * width, y = a.y * height, ex = a.endX * width, ey = a.endY * height;
    const size = Math.max(4, a.size * Math.min(width, height));
    const isRedaction = a.kind === 'redact';
    ctx.save(); ctx.strokeStyle = a.color; ctx.fillStyle = a.color;
    ctx.globalAlpha = isRedaction ? 1 : Math.min(1, Math.max(.1, a.opacity ?? 1));
    ctx.lineWidth = Math.max(2, size / 4); ctx.lineCap = 'round';
    const left = Math.min(x, ex), top = Math.min(y, ey), w = Math.abs(ex - x), h = Math.abs(ey - y);
    if (a.kind === 'rect' || a.kind === 'redact') {
      if (a.kind === 'redact') { ctx.fillStyle = '#000000'; ctx.fillRect(Math.floor(left), Math.floor(top), Math.ceil(w) + 1, Math.ceil(h) + 1); }
      else ctx.strokeRect(left, top, w, h);
    } else if (a.kind === 'line') {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    } else if (a.kind === 'ellipse') {
      ctx.beginPath(); ctx.ellipse(left + w / 2, top + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2); ctx.stroke();
    } else if (a.kind === 'triangle') {
      drawPolygon(ctx, [[left + w / 2, top], [left + w, top + h], [left, top + h]]);
    } else if (a.kind === 'diamond') {
      drawPolygon(ctx, [[left + w / 2, top], [left + w, top + h / 2], [left + w / 2, top + h], [left, top + h / 2]]);
    } else if (a.kind === 'pentagon' || a.kind === 'hexagon') {
      drawRegularPolygon(ctx, left + w / 2, top + h / 2, w / 2, h / 2, a.kind === 'pentagon' ? 5 : 6, -Math.PI / 2);
    } else if (a.kind === 'star') {
      drawStar(ctx, left + w / 2, top + h / 2, w / 2, h / 2);
    } else if (a.kind === 'bubble') {
      drawBubble(ctx, left, top, w, h, size);
    } else if (a.kind === 'arrow') {
      const angle = Math.atan2(ey - y, ex - x);
      // Shrink the head on short drags so it never outgrows its own shaft.
      const head = Math.max(2, Math.min(size, Math.hypot(ex - x, ey - y) * .8));
      const halfWidth = head * .48;
      const baseX = ex - Math.cos(angle) * head, baseY = ey - Math.sin(angle) * head;
      const perpX = -Math.sin(angle), perpY = Math.cos(angle);
      // Stop the shaft at the head's base: a round cap taken to the tip pokes past the point.
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(baseX, baseY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex, ey);
      ctx.lineTo(baseX + perpX * halfWidth, baseY + perpY * halfWidth);
      ctx.lineTo(baseX - perpX * halfWidth, baseY - perpY * halfWidth); ctx.closePath(); ctx.fill();
    } else {
      ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.textBaseline = 'top';
      if (a.kind === 'number') {
        ctx.beginPath(); ctx.arc(x, y, size * .8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      }
      a.text.split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.2));
    }
    ctx.restore();
  }
}

function drawPolygon(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, points: Array<[number, number]>) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.stroke();
}

function drawRegularPolygon(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, sides: number, start: number) {
  const points: Array<[number, number]> = Array.from({ length: sides }, (_, index) => {
    const angle = start + index * Math.PI * 2 / sides;
    return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
  });
  drawPolygon(ctx, points);
}

function drawStar(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  const points: Array<[number, number]> = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 ? .45 : 1;
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    return [cx + Math.cos(angle) * rx * radius, cy + Math.sin(angle) * ry * radius];
  });
  drawPolygon(ctx, points);
}

function drawBubble(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, left: number, top: number, width: number, height: number, size: number) {
  const radius = Math.min(width, height, size * .7) / 2;
  const tail = Math.min(width * .22, height * .24, size * 1.2);
  const right = left + width, bottom = top + height - tail;
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(right - radius, top);
  ctx.quadraticCurveTo(right, top, right, top + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(left + width * .62, bottom);
  ctx.lineTo(left + width * .48, bottom + tail);
  ctx.lineTo(left + width * .42, bottom);
  ctx.lineTo(left + radius, bottom);
  ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.stroke();
}
export async function renderEdit(source: ImageFrame, edit: EditState): Promise<ImageFrame> {
  const transformed = transformFrame(source, edit);
  const cropped = edit.crop ? cropFrame(transformed, edit.crop, formatInfo(edit.format).alpha ? undefined : edit.background) : transformed;
  const width = Math.round(edit.width || (edit.height ? edit.height * cropped.width / cropped.height : cropped.width));
  const height = Math.round(edit.height || (edit.width ? edit.width * cropped.height / cropped.width : cropped.height));
  validateDimensions(width, height);
  let output: ImageFrame;
  if (edit.placement) {
    const scale = Math.min(width / cropped.width, height / cropped.height) * edit.zoom;
    output = await placeFrame(cropped, width, height,
      (width - cropped.width * scale) / 2 + edit.offsetX,
      (height - cropped.height * scale) / 2 + edit.offsetY,
      scale, edit.background, formatInfo(edit.format).alpha);
  } else output = width === cropped.width && height === cropped.height ? cropped : await resizeFrame(cropped, width, height);
  if (!edit.annotations.length) return output;
  const canvas = frameToCanvas(output), ctx = canvas.getContext('2d')!;
  drawAnnotations(ctx, edit.annotations, width, height);
  return { width, height, data: new Uint8ClampedArray(ctx.getImageData(0, 0, width, height).data) };
}
export async function encodeEdit(source: ImageFrame, edit: EditState, progress?: (message: string) => void) {
  const frame = await renderEdit(source, edit);
  const quality = edit.quality;
  const encoded = await encodeFrame(frame, edit);
  progress?.('Archivo preparado.');
  return { encoded, width: frame.width, height: frame.height, quality };
}
