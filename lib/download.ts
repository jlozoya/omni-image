import type { EncodedImage } from './types';

export async function downloadEncoded(encoded: EncodedImage, filename: string): Promise<number | undefined> {
  const blob = new Blob([encoded.bytes as BlobPart], { type: encoded.mime });
  const url = URL.createObjectURL(blob);
  try {
    return await browser.downloads.download({ url, filename, saveAs: false });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunkSize)));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
