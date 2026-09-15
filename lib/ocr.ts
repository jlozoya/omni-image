import { createWorker } from 'tesseract.js';
import { canvasToBlob, frameToCanvas } from './canvas';
import type { ImageFrame } from './types';

export async function recognizeText(
  frame: ImageFrame,
  language: string,
  progress: (text: string) => void,
): Promise<string> {
  const base = new URL('ocr/', browser.runtime.getURL('/')).href;
  const worker = await createWorker(language, 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base.replace(/\/$/, ''),
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: ({ status, progress: value }) =>
      progress(
        `${status === 'recognizing text' ? 'Reconociendo texto' : 'Preparando OCR'}: ${Math.round(value * 100)}%`,
      ),
  });
  try {
    const png = await canvasToBlob(frameToCanvas(frame), 'image/png');
    const { data } = await worker.recognize(png);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
