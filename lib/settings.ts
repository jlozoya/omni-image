import type { CaptureSettings } from './types';

export const DEFAULT_SETTINGS: CaptureSettings = {
  format: 'webp',
  quality: 0.9,
  filenamePrefix: 'capture',
  background: '#ffffff',
  icoSizes: [16, 24, 32, 48, 64, 128, 256],
};

const STORAGE_KEY = 'captureSettings';

export async function getCaptureSettings(): Promise<CaptureSettings> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] as Partial<CaptureSettings> | undefined) };
}

export async function saveCaptureSettings(settings: CaptureSettings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}
