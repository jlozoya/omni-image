import type { ImageFrame } from '../types';
import { encodeNative } from './native';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function encodeSvgWrapper(frame: ImageFrame): Promise<Uint8Array> {
  const png = await encodeNative(frame, 'image/png', 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}"><image width="100%" height="100%" href="data:image/png;base64,${bytesToBase64(png)}"/></svg>`;
  return new TextEncoder().encode(svg);
}
