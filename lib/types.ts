export type OutputFormat =
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'avif'
  | 'jxl'
  | 'gif'
  | 'bmp'
  | 'ico'
  | 'tiff'
  | 'qoi'
  | 'tga'
  | 'svg'
  | 'ppm'
  | 'pgm'
  | 'pbm'
  | 'pam';

export interface ImageFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export interface EncodeOptions {
  format: OutputFormat;
  quality: number;
  background: string;
  icoSizes: number[];
}

export interface EncodedImage {
  bytes: Uint8Array;
  mime: string;
  extension: string;
}

export interface CaptureSettings {
  destination: 'download' | 'editor';
  format: OutputFormat;
  quality: number;
  filenamePrefix: string;
  background: string;
  icoSizes: number[];
}

export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}
