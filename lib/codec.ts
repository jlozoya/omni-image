import { encodeBmp } from './encoders/bmp';
import { encodeGif } from './encoders/gif';
import { encodeIco } from './encoders/ico';
import { encodeNative } from './encoders/native';
import { encodePam, encodePbm, encodePgm, encodePpm } from './encoders/pnm';
import { encodeSvgWrapper } from './encoders/svg';
import { encodeTga } from './encoders/tga';
import { encodeTiff } from './encoders/tiff';
import { encodeAvif, encodeJxl, encodeQoi } from './encoders/wasm';
import { formatInfo } from './formats';
import type { EncodeOptions, EncodedImage, ImageFrame } from './types';

export async function encodeFrame(frame: ImageFrame, options: EncodeOptions): Promise<EncodedImage> {
  const info = formatInfo(options.format);
  let bytes: Uint8Array;

  switch (options.format) {
    case 'png':
      bytes = await encodeNative(frame, 'image/png', 1);
      break;
    case 'jpeg':
      bytes = await encodeNative(flattenAlpha(frame, options.background), 'image/jpeg', options.quality);
      break;
    case 'webp':
      bytes = await encodeNative(frame, 'image/webp', options.quality);
      break;
    case 'avif':
      bytes = await encodeAvif(frame);
      break;
    case 'jxl':
      bytes = await encodeJxl(frame);
      break;
    case 'gif':
      bytes = encodeGif(frame);
      break;
    case 'bmp':
      bytes = encodeBmp(frame);
      break;
    case 'ico':
      bytes = await encodeIco(frame, options.icoSizes);
      break;
    case 'tiff':
      bytes = encodeTiff(frame);
      break;
    case 'qoi':
      bytes = await encodeQoi(frame);
      break;
    case 'tga':
      bytes = encodeTga(frame);
      break;
    case 'svg':
      bytes = await encodeSvgWrapper(frame);
      break;
    case 'ppm':
      bytes = encodePpm(flattenAlpha(frame, options.background));
      break;
    case 'pgm':
      bytes = encodePgm(flattenAlpha(frame, options.background));
      break;
    case 'pbm':
      bytes = encodePbm(flattenAlpha(frame, options.background));
      break;
    case 'pam':
      bytes = encodePam(frame);
      break;
    default:
      options.format satisfies never;
      throw new Error('Unsupported output format.');
  }

  return { bytes, mime: info.mime, extension: info.extension };
}

function flattenAlpha(frame: ImageFrame, background: string): ImageFrame {
  const [br, bg, bb] = parseHexColor(background);
  const out = new Uint8ClampedArray(frame.data.length);
  for (let i = 0; i < frame.data.length; i += 4) {
    const alpha = (frame.data[i + 3] ?? 255) / 255;
    out[i] = Math.round((frame.data[i] ?? 0) * alpha + br * (1 - alpha));
    out[i + 1] = Math.round((frame.data[i + 1] ?? 0) * alpha + bg * (1 - alpha));
    out[i + 2] = Math.round((frame.data[i + 2] ?? 0) * alpha + bb * (1 - alpha));
    out[i + 3] = 255;
  }
  return { width: frame.width, height: frame.height, data: out };
}

function parseHexColor(value: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : 'ffffff';
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}
