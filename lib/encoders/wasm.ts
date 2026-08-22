import type { ImageFrame } from '../types';

export async function encodeAvif(frame: ImageFrame): Promise<Uint8Array> {
  const { encode } = await import('@jsquash/avif');
  return new Uint8Array(await encode(new ImageData(frame.data, frame.width, frame.height)));
}

export async function encodeJxl(frame: ImageFrame): Promise<Uint8Array> {
  const { encode } = await import('@jsquash/jxl');
  return new Uint8Array(await encode(new ImageData(frame.data, frame.width, frame.height)));
}

export async function encodeQoi(frame: ImageFrame): Promise<Uint8Array> {
  const { encode } = await import('@jsquash/qoi');
  return new Uint8Array(await encode(new ImageData(frame.data, frame.width, frame.height)));
}
