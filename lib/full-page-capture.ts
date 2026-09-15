import { makeCanvas } from './canvas';
import { validateDimensions } from './editor/render';
import type { ImageFrame } from './types';

export async function assertActiveTab(tabId: number, windowId: number) {
  const [active] = await browser.tabs.query({ active: true, windowId });
  if (active?.id !== tabId) throw new Error('La pestaña cambió durante la captura. Vuelve a intentarlo.');
}
export async function captureFullPage(tabId: number, windowId: number): Promise<ImageFrame> {
  const invoke = async (action: 'begin' | 'step' | 'end', x = 0, y = 0, hideFixed = false) => {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: scrollPage,
      args: [action, x, y, hideFixed],
    });
    if (!result?.result) throw new Error('No se pudo preparar la página.');
    return result.result;
  };
  try {
    const page = await invoke('begin');
    const columns = Math.ceil(page.width / page.viewportWidth),
      rows = Math.ceil(page.height / page.viewportHeight);
    if (columns * rows > 80) throw new Error('La página requiere más de 80 capturas. Usa una región más pequeña.');
    let canvas: ReturnType<typeof makeCanvas> | undefined;
    let scaleX = 1,
      scaleY = 1;
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        await assertActiveTab(tabId, windowId);
        const current = await invoke('step', column * page.viewportWidth, row * page.viewportHeight, row + column > 0);
        // At most two screenshots per second; also let lazy content paint.
        await new Promise((resolve) => setTimeout(resolve, 650));
        await assertActiveTab(tabId, windowId);
        const check = await invoke('step', current.x, current.y, row + column > 0);
        if (
          check.viewportWidth !== page.viewportWidth ||
          check.viewportHeight !== page.viewportHeight ||
          check.x !== current.x ||
          check.y !== current.y
        )
          throw new Error('La página cambió de tamaño durante la captura.');
        const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
        await assertActiveTab(tabId, windowId);
        await invoke('step', current.x, current.y, row + column > 0);
        const bitmap = await createImageBitmap(await fetch(dataUrl).then((response) => response.blob()));
        try {
          if (!canvas) {
            scaleX = bitmap.width / current.innerWidth;
            scaleY = bitmap.height / current.innerHeight;
            const width = Math.round(page.width * scaleX),
              height = Math.round(page.height * scaleY);
            validateDimensions(width, height);
            canvas = makeCanvas(width, height);
          }
          const ctx = canvas.getContext('2d')!;
          const x = Math.round(current.x * scaleX),
            y = Math.round(current.y * scaleY);
          const width = Math.min(Math.round(current.viewportWidth * scaleX), canvas.width - x);
          const height = Math.min(Math.round(current.viewportHeight * scaleY), canvas.height - y);
          ctx.drawImage(bitmap, 0, 0, width, height, x, y, width, height);
        } finally {
          bitmap.close();
        }
      }
    if (!canvas) throw new Error('La página está vacía.');
    return {
      width: canvas.width,
      height: canvas.height,
      data: new Uint8ClampedArray(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data),
    };
  } finally {
    await invoke('end').catch(() => {});
  }
}

// Injected function: intentionally self-contained, with a timeout to restore the page
// even if the extension's background context is terminated.
async function scrollPage(action: 'begin' | 'step' | 'end', x: number, y: number, hideFixed: boolean) {
  type CaptureState = {
    x: number;
    y: number;
    style: HTMLStyleElement;
    hidden: { element: HTMLElement; value: string; priority: string }[];
    restore: () => void;
    timer: number;
    cancelled: boolean;
  };
  const host = window as typeof window & { __omniFullCapture?: CaptureState };
  if (action === 'begin') {
    host.__omniFullCapture?.restore();
    const style = document.createElement('style');
    style.textContent =
      'html,body,* { scroll-behavior:auto!important; scroll-snap-type:none!important; overflow-anchor:none!important; }';
    document.documentElement.appendChild(style);
    const state: CaptureState = {
      x: scrollX,
      y: scrollY,
      style,
      hidden: [],
      timer: 0,
      cancelled: false,
      restore: () => {},
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        state.cancelled = true;
        state.restore();
      }
    };
    state.restore = () => {
      clearTimeout(state.timer);
      state.hidden.forEach(({ element, value, priority }) =>
        value ? element.style.setProperty('visibility', value, priority) : element.style.removeProperty('visibility'),
      );
      window.scrollTo(state.x, state.y);
      style.remove();
      document.removeEventListener('keydown', cancel, true);
      delete host.__omniFullCapture;
    };
    document.addEventListener('keydown', cancel, true);
    host.__omniFullCapture = state;
    state.timer = window.setTimeout(state.restore, 15000);
  }
  const state = host.__omniFullCapture;
  if (action === 'step') {
    if (!state || state.cancelled) throw new Error('Captura cancelada (Esc) o sesión caducada.');
    clearTimeout(state.timer);
    state.timer = window.setTimeout(state.restore, 15000);
    if (hideFixed && !state.hidden.length) {
      for (const element of document.querySelectorAll<HTMLElement>('body *')) {
        const position = getComputedStyle(element).position;
        if (position === 'fixed' || position === 'sticky') {
          state.hidden.push({
            element,
            value: element.style.getPropertyValue('visibility'),
            priority: element.style.getPropertyPriority('visibility'),
          });
          element.style.setProperty('visibility', 'hidden', 'important');
        }
      }
    }
    window.scrollTo(x, y);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  if (action === 'end') state?.restore();
  return {
    width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    innerWidth: innerWidth,
    innerHeight: innerHeight,
    x: scrollX,
    y: scrollY,
  };
}
