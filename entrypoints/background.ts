import { makeCanvas } from '../lib/canvas';
import { encodeFrame } from '../lib/codec';
import { bytesToDataUrl } from '../lib/download';
import { getCaptureSettings } from '../lib/settings';
import type { ExtensionMessage } from '../lib/messages';
import type { ImageFrame, RegionRect } from '../lib/types';
import { safeFilenamePart, timestampForFilename } from '../lib/utils';
import { captureFullPage, assertActiveTab } from '../lib/full-page-capture';
import { writeDraft } from '../lib/editor/store';
import { defaultEdit } from '../lib/editor/model';

let capturing = false;
let selectedTab: number | undefined;

async function reportCapture(ok: boolean, message: string) {
  await browser.storage.local.set({ captureStatus: { ok, message, time: Date.now() } });
  await browser.action.setBadgeText({ text: ok ? '' : '!' });
  if (!ok) await browser.action.setBadgeBackgroundColor({ color: '#b3261e' });
  await browser.action.setTitle({ title: message });
}

async function deliverCapture(frame: ImageFrame) {
  const settings = await getCaptureSettings();
  const filename = `${safeFilenamePart(settings.filenamePrefix)}-${timestampForFilename()}`;
  if (settings.destination === 'editor') {
    const encoded = await encodeFrame(frame, { ...settings, format: 'png' });
    const id = crypto.randomUUID();
    await writeDraft(id, [{ id, file: new File([encoded.bytes as BlobPart], `${filename}.png`, { type: 'image/png' }),
      edit: { ...defaultEdit(), format: settings.format, quality: settings.quality, background: settings.background, icoSizes: settings.icoSizes } }]);
    await browser.tabs.create({ url: `${browser.runtime.getURL('/editor.html')}?session=${encodeURIComponent(id)}` });
    await reportCapture(true, 'Captura abierta en el editor.');
  } else {
    const encoded = await encodeFrame(frame, settings);
    await browser.downloads.download({ url: bytesToDataUrl(encoded.bytes, encoded.mime), filename: `${filename}.${encoded.extension}`, saveAs: false });
    await reportCapture(true, 'Descarga de captura iniciada.');
  }
}

async function startFullCapture() {
  if (capturing) {
    await reportCapture(false, 'Ya hay una captura en curso. Espera a que termine o pulsa Esc para cancelarla.');
    return;
  }
  capturing = true;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No hay una pestaña activa.');
    await reportCapture(true, 'Capturando página completa… Mantén la pestaña activa. Esc para cancelar.');
    const frame = await captureFullPage(tab.id, tab.windowId);
    await deliverCapture(frame);
  } catch (error) { await reportCapture(false, error instanceof Error ? error.message : 'Falló la captura completa.'); }
  finally { capturing = false; }
}

export default defineBackground({
  type: 'module',
  main() {
    browser.commands.onCommand.addListener(async (command) => {
      if (command !== 'capture-region') return;
      await startRegionSelection();
    });

    browser.runtime.onMessage.addListener((message: ExtensionMessage, sender) => {
      if (sender.id !== browser.runtime.id) return;
      if (message?.type === 'START_FULL_CAPTURE') { void startFullCapture(); return; }
      if (message?.type === 'START_CAPTURE') {
        void startRegionSelection();
        return;
      }
      if (message?.type === 'REGION_SELECTED') {
        if (sender.tab?.id !== selectedTab || !sender.tab?.id) return;
        selectedTab = undefined;
        void captureSelectedRegion(message.rect, sender.tab.id, sender.tab.windowId);
      }
      if (message?.type === 'REGION_CANCELLED') selectedTab = undefined;
    });
  },
});

async function startRegionSelection(): Promise<void> {
  if (capturing) {
    await reportCapture(false, 'Ya hay una captura en curso. Espera a que termine o pulsa Esc para cancelarla.');
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    selectedTab = tab.id;
    await reportCapture(true, 'Selecciona una región. Esc para cancelar.');
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectedRegionSelector,
    });
  } catch (error) {
    selectedTab = undefined;
    await reportCapture(false, 'No se puede capturar esta pestaña. Abre una página web normal y vuelve a intentarlo.');
  }
}

async function captureSelectedRegion(rect: RegionRect, tabId: number, windowId: number): Promise<void> {
  if (capturing) return;
  capturing = true;
  try {
    if (![rect.x, rect.y, rect.width, rect.height, rect.viewportWidth, rect.viewportHeight].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || rect.viewportWidth <= 0 || rect.viewportHeight <= 0) throw new Error('Región de captura inválida.');
    // Give the page one paint after removing the selection overlay.
    await new Promise((resolve) => setTimeout(resolve, 40));
    await assertActiveTab(tabId, windowId);
    const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
    await assertActiveTab(tabId, windowId);
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

    await deliverCapture(frame);
  } catch (error) {
    await reportCapture(false, error instanceof Error ? error.message : 'Falló la captura.');
  } finally { capturing = false; }
}

function injectedRegionSelector(): void {
  const host = globalThis as typeof globalThis & { __omniRegionCleanup?: () => void };
  host.__omniRegionCleanup?.();
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

  const dimensionLabel = document.createElement('div');
  Object.assign(dimensionLabel.style, {
    position: 'fixed',
    display: 'none',
    padding: '3px 7px',
    borderRadius: '5px',
    background: 'rgba(20, 20, 20, 0.88)',
    color: '#fff',
    font: '11px/1.2 system-ui, sans-serif',
    fontWeight: '600',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  });
  overlay.appendChild(dimensionLabel);

  const updateDimensionLabel = (x: number, y: number, width: number, height: number) => {
    dimensionLabel.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
    dimensionLabel.style.display = 'block';
    const labelRect = dimensionLabel.getBoundingClientRect();
    const left = Math.max(4, Math.min(x + width - labelRect.width - 6, window.innerWidth - labelRect.width - 4));
    const top = Math.max(4, Math.min(y + height - labelRect.height - 6, window.innerHeight - labelRect.height - 4));
    dimensionLabel.style.left = `${left}px`;
    dimensionLabel.style.top = `${top}px`;
  };

  let startX = 0;
  let startY = 0;
  let dragging = false;

  const cleanup = () => {
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    delete host.__omniRegionCleanup;
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
    updateDimensionLabel(startX, startY, 0, 0);
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
    updateDimensionLabel(x, y, width, height);
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
  host.__omniRegionCleanup = cleanup;
  document.documentElement.appendChild(overlay);
}
