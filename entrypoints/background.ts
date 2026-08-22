import { makeCanvas } from '../lib/canvas';
import { encodeFrame } from '../lib/codec';
import { bytesToDataUrl } from '../lib/download';
import { getCaptureSettings } from '../lib/settings';
import type { ExtensionMessage } from '../lib/messages';
import type { ImageFrame, RegionRect } from '../lib/types';
import { safeFilenamePart, timestampForFilename } from '../lib/utils';

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'capture-region') return;
    await startRegionSelection();
  });

  browser.runtime.onMessage.addListener((message: ExtensionMessage, sender) => {
    if (message?.type === 'START_CAPTURE') {
      void startRegionSelection();
      return;
    }
    if (message?.type === 'REGION_SELECTED') {
      void captureSelectedRegion(message.rect, sender.tab?.windowId);
    }
  });
});

async function startRegionSelection(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectedRegionSelector,
    });
  } catch (error) {
    console.error('Could not inject region selector:', error);
  }
}

async function captureSelectedRegion(rect: RegionRect, windowId?: number): Promise<void> {
  try {
    // Give the page one paint after removing the selection overlay.
    await new Promise((resolve) => setTimeout(resolve, 40));
    const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
    const screenshot = await fetch(dataUrl).then((response) => response.blob());
    const bitmap = await createImageBitmap(screenshot);

    const scaleX = bitmap.width / rect.viewportWidth;
    const scaleY = bitmap.height / rect.viewportHeight;
    const sx = Math.max(0, Math.round(rect.x * scaleX));
    const sy = Math.max(0, Math.round(rect.y * scaleY));
    const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round(rect.width * scaleX)));
    const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round(rect.height * scaleY)));

    const canvas = makeCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create capture canvas.');
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, sw, sh).data;
    const frame: ImageFrame = { width: sw, height: sh, data: new Uint8ClampedArray(pixels) };

    const settings = await getCaptureSettings();
    const encoded = await encodeFrame(frame, {
      format: settings.format,
      quality: settings.quality,
      background: settings.background,
      icoSizes: settings.icoSizes,
    });
    const filename = `${safeFilenamePart(settings.filenamePrefix)}-${timestampForFilename()}.${encoded.extension}`;
    await browser.downloads.download({
      url: bytesToDataUrl(encoded.bytes, encoded.mime),
      filename,
      saveAs: false,
    });
  } catch (error) {
    console.error('Capture failed:', error);
  }
}

function injectedRegionSelector(): void {
  const api = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? chrome;
  const existing = document.getElementById('__omni_image_capture_overlay__');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = '__omni_image_capture_overlay__';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
    background: 'rgba(0, 0, 0, 0.10)',
    userSelect: 'none',
  });

  const hint = document.createElement('div');
  hint.textContent = 'Arrastra para seleccionar · Esc para cancelar';
  Object.assign(hint.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 12px',
    borderRadius: '8px',
    background: 'rgba(20, 20, 20, 0.88)',
    color: '#fff',
    font: '13px/1.2 system-ui, sans-serif',
    pointerEvents: 'none',
  });
  overlay.appendChild(hint);

  const selection = document.createElement('div');
  Object.assign(selection.style, {
    position: 'fixed',
    display: 'none',
    border: '2px solid white',
    outline: '1px solid rgba(0,0,0,.75)',
    background: 'rgba(255,255,255,.08)',
    boxSizing: 'border-box',
    pointerEvents: 'none',
  });
  overlay.appendChild(selection);

  let startX = 0;
  let startY = 0;
  let dragging = false;

  const cleanup = () => {
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cleanup();
      void api.runtime.sendMessage({ type: 'REGION_CANCELLED' });
    }
  };

  overlay.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    selection.style.display = 'block';
    selection.style.left = `${startX}px`;
    selection.style.top = `${startY}px`;
    selection.style.width = '0px';
    selection.style.height = '0px';
  });

  overlay.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    const x = Math.min(startX, event.clientX);
    const y = Math.min(startY, event.clientY);
    const width = Math.abs(event.clientX - startX);
    const height = Math.abs(event.clientY - startY);
    selection.style.left = `${x}px`;
    selection.style.top = `${y}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;
  });

  overlay.addEventListener('mouseup', (event) => {
    if (!dragging || event.button !== 0) return;
    dragging = false;
    const x = Math.min(startX, event.clientX);
    const y = Math.min(startY, event.clientY);
    const width = Math.abs(event.clientX - startX);
    const height = Math.abs(event.clientY - startY);
    cleanup();
    if (width < 2 || height < 2) return;
    void api.runtime.sendMessage({
      type: 'REGION_SELECTED',
      rect: {
        x,
        y,
        width,
        height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
    });
  });

  document.addEventListener('keydown', onKeyDown, true);
  document.documentElement.appendChild(overlay);
}
