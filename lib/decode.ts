import { blobToFrame, bitmapToFrame } from './canvas';
import { decodePnm } from './decoders/pnm';
import { decodeTga } from './decoders/tga';
import { decodeTiff } from './decoders/tiff';
import type { ImageFrame } from './types';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export async function decodeImageFile(file: File): Promise<ImageFrame> {
  const ext = extensionOf(file.name);
  const buffer = await file.arrayBuffer();

  if (ext === 'tif' || ext === 'tiff') return decodeTiff(buffer);
  if (ext === 'tga') return decodeTga(buffer);
  if (['ppm', 'pgm', 'pbm', 'pam'].includes(ext)) return decodePnm(buffer);

  if (ext === 'heic' || ext === 'heif') {
    const { heicTo } = await import('heic-to/csp');
    const result = await heicTo({ blob: file, type: 'bitmap' });
    if (!(result instanceof ImageBitmap)) throw new Error('HEIC decoder did not return a bitmap.');
    return bitmapToFrame(result);
  }

  if (ext === 'jxl') {
    const { decode } = await import('@jsquash/jxl');
    const image = await decode(buffer);
    return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  }

  if (ext === 'qoi') {
    const { decode } = await import('@jsquash/qoi');
    const image = await decode(buffer);
    return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  }

  try {
    return await blobToFrame(file);
  } catch (nativeError) {
    if (ext === 'avif') {
      const { decode } = await import('@jsquash/avif');
      const image = await decode(buffer);
      return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
    }
    throw new Error(`Could not decode ${file.name}. ${nativeError instanceof Error ? nativeError.message : ''}`.trim());
  }
}
