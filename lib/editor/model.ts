import type { CropRect } from '../crop';
import type { EncodeOptions } from '../types';

export interface Annotation {
  kind: 'arrow' | 'line' | 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' | 'bubble' | 'redact' | 'text' | 'number';
  x: number; y: number; endX: number; endY: number;
  color: string; text: string; size: number; opacity?: number;
}
export interface EditState extends EncodeOptions {
  crop: CropRect | null;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  width: number;
  height: number;
  lockAspect: boolean;
  placement: boolean;
  offsetX: number;
  offsetY: number;
  zoom: number;
  annotations: Annotation[];
}
export interface EditorEntry { id: string; file: File; edit: EditState }
export const defaultEdit = (): EditState => ({
  format: 'png', quality: .9, background: '#ffffff', icoSizes: [16, 32, 48, 64, 128, 256],
  crop: null, rotation: 0, flipX: false, flipY: false, width: 0, height: 0,
  lockAspect: true, placement: false, offsetX: 0, offsetY: 0, zoom: 1, annotations: [],
});
