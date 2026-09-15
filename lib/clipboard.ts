import { canvasToBlob, frameToCanvas } from './canvas';
import type { ImageFrame } from './types';

export async function copyFrame(frame: ImageFrame): Promise<void> {
  const png = await canvasToBlob(frameToCanvas(frame), 'image/png');
  const firefox = browser as typeof browser & {
    clipboard?: { setImageData(data: ArrayBuffer, type: 'png'): Promise<void> };
  };
  if (navigator.userAgent.includes('Firefox') && firefox.clipboard?.setImageData)
    await firefox.clipboard.setImageData(await png.arrayBuffer(), 'png');
  else if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  else throw new Error('Este navegador no permite copiar imágenes. Usa Descargar.');
}
