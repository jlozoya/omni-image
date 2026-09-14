import type { CropRect } from './crop';
import type { EncodeOptions } from './types';

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
export type ExportProfile = Pick<EditState, 'format' | 'quality' | 'background' | 'icoSizes' | 'width' | 'height' | 'lockAspect'>;
export interface SavedProfile { id: string; name: string; options: ExportProfile }
export const defaultEdit = (): EditState => ({
  format: 'png', quality: .9, background: '#ffffff', icoSizes: [16, 32, 48, 64, 128, 256],
  crop: null, rotation: 0, flipX: false, flipY: false, width: 0, height: 0,
  lockAspect: true, placement: false, offsetX: 0, offsetY: 0, zoom: 1, annotations: [],
});
export function exportProfile(edit: EditState): ExportProfile {
  const { format, quality, background, icoSizes, width, height, lockAspect } = edit;
  return { format, quality, background, icoSizes, width, height, lockAspect };
}
export function profileForImage(edit: EditState, profile: ExportProfile): EditState {
  // A proportional profile uses its width as an anchor for each source image.
  return { ...edit, ...profile, height: profile.lockAspect && profile.width ? 0 : profile.height };
}
