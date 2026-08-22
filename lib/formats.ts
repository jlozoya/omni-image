import type { OutputFormat } from './types';

export interface FormatInfo {
  id: OutputFormat;
  label: string;
  extension: string;
  mime: string;
  lossy: boolean;
  qualityControl?: boolean;
  alpha: boolean;
  notes?: string;
}

export const OUTPUT_FORMATS: FormatInfo[] = [
  { id: 'png', label: 'PNG', extension: 'png', mime: 'image/png', lossy: false, alpha: true },
  { id: 'jpeg', label: 'JPEG / JPG', extension: 'jpg', mime: 'image/jpeg', lossy: true, qualityControl: true, alpha: false },
  { id: 'webp', label: 'WebP', extension: 'webp', mime: 'image/webp', lossy: true, qualityControl: true, alpha: true },
  { id: 'avif', label: 'AVIF', extension: 'avif', mime: 'image/avif', lossy: true, alpha: true, notes: 'WASM encoder; quality tuning can be added per codec preset' },
  { id: 'jxl', label: 'JPEG XL', extension: 'jxl', mime: 'image/jxl', lossy: true, alpha: true, notes: 'WASM encoder; quality tuning can be added per codec preset' },
  { id: 'gif', label: 'GIF', extension: 'gif', mime: 'image/gif', lossy: false, alpha: true, notes: 'Static single-frame output' },
  { id: 'bmp', label: 'BMP', extension: 'bmp', mime: 'image/bmp', lossy: false, alpha: true },
  { id: 'ico', label: 'ICO', extension: 'ico', mime: 'image/x-icon', lossy: false, alpha: true, notes: 'Multi-size Windows icon' },
  { id: 'tiff', label: 'TIFF', extension: 'tiff', mime: 'image/tiff', lossy: false, alpha: true },
  { id: 'qoi', label: 'QOI', extension: 'qoi', mime: 'image/qoi', lossy: false, alpha: true },
  { id: 'tga', label: 'TGA', extension: 'tga', mime: 'image/x-tga', lossy: false, alpha: true },
  { id: 'svg', label: 'SVG wrapper', extension: 'svg', mime: 'image/svg+xml', lossy: false, alpha: true, notes: 'Embeds the raster image; does not vectorize it' },
  { id: 'ppm', label: 'PPM', extension: 'ppm', mime: 'image/x-portable-pixmap', lossy: false, alpha: false },
  { id: 'pgm', label: 'PGM', extension: 'pgm', mime: 'image/x-portable-graymap', lossy: false, alpha: false },
  { id: 'pbm', label: 'PBM', extension: 'pbm', mime: 'image/x-portable-bitmap', lossy: false, alpha: false },
  { id: 'pam', label: 'PAM', extension: 'pam', mime: 'image/x-portable-arbitrarymap', lossy: false, alpha: true },
];

export const ACCEPTED_INPUT_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.jfif', '.webp', '.avif', '.gif', '.bmp', '.ico', '.svg',
  '.tif', '.tiff', '.heic', '.heif', '.jxl', '.qoi', '.tga', '.ppm', '.pgm', '.pbm', '.pam',
].join(',');

export function formatInfo(format: OutputFormat): FormatInfo {
  const found = OUTPUT_FORMATS.find((item) => item.id === format);
  if (!found) throw new Error(`Unsupported output format: ${format}`);
  return found;
}
