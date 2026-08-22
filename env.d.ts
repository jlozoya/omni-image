/// <reference types="wxt/client" />

declare module 'utif' {
  export function decode(buffer: ArrayBuffer): any[];
  export function decodeImage(buffer: ArrayBuffer, ifd: any): void;
  export function toRGBA8(ifd: any): Uint8Array;
  export function encodeImage(rgba: ArrayBuffer, width: number, height: number): ArrayBuffer;
}

declare module 'heic-to/csp' {
  export function heicTo(options: {
    blob: Blob;
    type: 'image/jpeg' | 'image/png' | 'bitmap';
    quality?: number;
    options?: ImageBitmapOptions;
  }): Promise<Blob | ImageBitmap>;
  export function isHeic(blob: Blob): Promise<boolean>;
}
