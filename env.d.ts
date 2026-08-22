/// <reference types="wxt/client" />

// Minimal ambient shape for the `chrome` global available in the injected
// content-script world (entrypoints/background.ts's injectedRegionSelector),
// which runs outside the webextension-polyfill `browser` bindings.
declare const chrome: {
  runtime: {
    sendMessage: (message: unknown) => void;
  };
};

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

declare module 'gifenc' {
  export type GifPaletteColor = [number, number, number, number] | [number, number, number];
  export type GifPalette = GifPaletteColor[];

  export function quantize(
    data: Uint8ClampedArray | Uint8Array,
    maxColors: number,
    options?: { format?: 'rgb565' | 'rgba4444' | 'rgb444'; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number },
  ): GifPalette;

  export function applyPalette(
    data: Uint8ClampedArray | Uint8Array,
    palette: GifPalette,
    format?: 'rgb565' | 'rgba4444' | 'rgb444',
  ): Uint8Array;

  export interface GifWriteFrameOptions {
    palette?: GifPalette;
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GifEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, options?: GifWriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(options?: { auto?: boolean }): GifEncoderInstance;
}
