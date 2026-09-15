import { test as base, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';

const test = base.extend<{ context: BrowserContext; editor: Page; extensionId: string }>({
  context: async ({}, use, testInfo) => {
    const root = resolve('.test-artifacts', `run-${Date.now()}-${testInfo.testId.replace(/[^a-z0-9]/gi, '')}`);
    const extension = resolve(root, 'extension');
    await mkdir(root, { recursive: true });
    await cp(resolve('dist/chrome-mv3'), extension, { recursive: true });
    const manifestPath = resolve(extension, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(manifest.host_permissions).toBeUndefined();
    // The isolated test copy receives host access so CDP can exercise capture
    // without clicking Chrome's toolbar. The shipped manifest stays activeTab-only.
    manifest.host_permissions = ['<all_urls>'];
    await writeFile(manifestPath, JSON.stringify(manifest));
    const context = await chromium.launchPersistentContext(resolve(root, 'profile'), {
      channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
      executablePath: process.env.OMNI_CHROMIUM_PATH,
      ignoreDefaultArgs: ['--disable-extensions'],
      acceptDownloads: true, downloadsPath: resolve(root, 'downloads'),
      args: ['--enable-unsafe-extension-debugging', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await use(context); await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).hostname);
  },
  editor: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/editor.html`);
    await expect(page.getByText('No hay imágenes.', { exact: false })).toBeVisible();
    await use(page);
  },
});
const sample = { name: 'colors.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><path fill="red" d="M0 0h100v100H0z"/><path fill="blue" d="M100 0h100v100H100z"/></svg>') };
async function add(page: Page, files = [sample]) {
  await page.getByLabel('Agregar imágenes', { exact: true }).setInputFiles(files);
  await expect(page.getByRole('button', { name: 'Descargar imagen actual', exact: true })).toBeVisible();
  await expect(page.locator('canvas[aria-label="Resultado editado"]')).toBeVisible();
}
async function pixel(page: Page, x: number, y: number) {
  return page.locator('canvas[aria-label="Resultado editado"]').evaluate((canvas, p) => Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(p.x, p.y, 1, 1).data), { x, y });
}
async function latestDownload(page: Page) {
  return page.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const [item] = await api.downloads.search({ limit: 1, orderBy: ['-startTime'] });
    if (!item) throw new Error('No download');
    const bytes = Array.from(new Uint8Array(await (await fetch(item.url)).arrayBuffer()));
    return { filename: item.filename as string, bytes: bytes as number[] };
  });
}
test('placement at unchanged dimensions, undo, rotation and saved draft', async ({ editor }) => {
  await add(editor);
  await editor.getByLabel('Mantener proporción', { exact: true }).uncheck();
  await editor.getByLabel('Ajustar posición y escala', { exact: false }).check();
  await editor.getByLabel('Desplazamiento X (px)').fill('20');
  await expect.poll(() => pixel(editor, 5, 50)).toEqual([0, 0, 0, 0]);
  await editor.getByRole('button', { name: 'Descargar imagen actual', exact: true }).click();
  await expect(editor.getByText('Descarga iniciada:', { exact: false })).toBeVisible();
  const downloaded = await latestDownload(editor);
  expect(downloaded.bytes.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const exportedAlpha = await editor.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(5, 50, 1, 1).data[3];
  }, downloaded.bytes);
  expect(exportedAlpha).toBe(0);
  await editor.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect.poll(() => pixel(editor, 5, 50)).toEqual([255, 0, 0, 255]);
  await editor.getByRole('button', { name: 'Rehacer', exact: true }).click();
  await expect(editor.getByLabel('Desplazamiento X (px)')).toHaveValue('20');
  await expect(editor.getByText('Guardando borrador…', { exact: false })).toHaveCount(0);
  await editor.reload();
  await expect(editor.getByLabel('Desplazamiento X (px)')).toHaveValue('20');
  await expect.poll(() => pixel(editor, 5, 50)).toEqual([0, 0, 0, 0]);
  await editor.getByRole('button', { name: 'Girar 90°', exact: true }).click();
  await expect.poll(() => editor.locator('canvas[aria-label="Imagen para recortar"]').evaluate((c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([100, 200]);
  await editor.setViewportSize({ width: 390, height: 844 });
  expect(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('annotations are flattened and survive reload', async ({ editor }) => {
  await add(editor);
  await editor.getByLabel('Herramienta', { exact: true }).selectOption('redact');
  const stage = editor.locator('.interactive-image').last();
  await stage.scrollIntoViewIfNeeded();
  const bounds = (await stage.boundingBox())!;
  await editor.mouse.move(bounds.x + bounds.width * .1, bounds.y + bounds.height * .1);
  await editor.mouse.down(); await editor.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .7, { steps: 4 }); await editor.mouse.up();
  await expect.poll(() => pixel(editor, 40, 40)).toEqual([0, 0, 0, 255]);
  await editor.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect.poll(() => pixel(editor, 40, 40)).toEqual([255, 0, 0, 255]);
  await editor.getByRole('button', { name: 'Rehacer', exact: true }).click();
  await expect.poll(() => pixel(editor, 40, 40)).toEqual([0, 0, 0, 255]);
  await expect(editor.getByText('Guardando borrador…', { exact: false })).toHaveCount(0);
  await editor.reload(); await expect.poll(() => pixel(editor, 40, 40)).toEqual([0, 0, 0, 255]);
});
test('clipboard, partial batch failure and ZIP', async ({ editor }) => {
  await add(editor);
  await editor.getByLabel('Formato', { exact: true }).selectOption('webp');
  await editor.getByRole('button', { name: 'Copiar PNG actual', exact: true }).click();
  await expect(editor.locator('.editor-section .inline-status')).toHaveText('Imagen editada copiada como PNG.');
  await add(editor, [{ ...sample, name: 'second.svg' }]);
  await editor.getByLabel('Agregar imágenes', { exact: true }).setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken image') });
  await editor.getByRole('button', { name: 'Descargar ZIP', exact: true }).click();
  await expect(editor.getByText('2 completadas; 1 con error.', { exact: true })).toBeVisible();
  const archive = await latestDownload(editor);
  expect(archive.bytes.slice(0, 4)).toEqual([80, 75, 3, 4]);
  const members = unzipSync(new Uint8Array(archive.bytes));
  expect(Object.keys(members)).toHaveLength(2);
  expect(Object.keys(members).some((name) => name.endsWith('.webp'))).toBe(true);
  expect(Object.values(members).every((bytes) => bytes.length > 0)).toBe(true);
  await editor.getByRole('button', { name: 'Reintentar fallidas', exact: true }).click();
  await expect(editor.getByText('0 completadas; 1 con error.', { exact: true })).toBeVisible();
});
test('OCR recognizes text with network disabled', async ({ editor, context }) => {
  const remoteRequests: string[] = [];
  context.on('request', (request) => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); });
  await context.setOffline(true);
  await add(editor, [{ name: 'text.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="180"><path fill="white" d="M0 0h800v180H0z"/><text x="35" y="110" font-family="Arial" font-size="64" fill="black">HELLO OMNI 123</text></svg>') }]);
  await editor.getByRole('button', { name: 'Extraer texto del resultado', exact: true }).click();
  await expect(editor.getByLabel('Texto reconocido')).toHaveValue(/HELLO OMNI 123/, { timeout: 45000 });
  expect(remoteRequests).toEqual([]);
});
test('full-page capture stitches pixels, restores scroll, and opens editor', async ({ context, editor }) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><style>html,body{margin:0}body{height:2100px;background:linear-gradient(red,blue)}header{position:fixed;top:0;background:white;height:30px;width:100%}</style><header>Fixed header</header><p>Capture fixture</p>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const webpage = await context.newPage(); await webpage.goto(`http://127.0.0.1:${port}`);
    await webpage.evaluate(() => scrollTo(0, 250));
    await editor.evaluate(async () => { await (globalThis as any).chrome.storage.local.set({ captureSettings: { destination: 'editor', format: 'png' } }); });
    await webpage.bringToFront();
    const opened = context.waitForEvent('page');
    await editor.evaluate(async () => { await (globalThis as any).chrome.runtime.sendMessage({ type: 'START_FULL_CAPTURE' }); });
    const captureEditor = await opened;
    await expect(captureEditor.locator('canvas[aria-label="Resultado editado"]')).toBeVisible({ timeout: 20000 });
    const size = await captureEditor.locator('canvas[aria-label="Resultado editado"]').evaluate((canvas) => [(canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height]);
    expect(size[1]).toBeGreaterThanOrEqual(2100);
    expect(await webpage.evaluate(() => scrollY)).toBe(250);
    expect(await webpage.locator('header').evaluate((el) => el.style.visibility)).toBe('');
    await captureEditor.screenshot({ path: '.test-artifacts/capture-editor.png', fullPage: true });
  } finally { server.close(); }
});

test('export downloads real output', async ({ editor }) => {
  const png = await editor.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300;
    const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(400, 300);
    let seed = 12;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = seed & 255; pixels.data[i + 1] = (seed >>> 8) & 255; pixels.data[i + 2] = (seed >>> 16) & 255; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0); return canvas.toDataURL().split(',')[1]!;
  });
  await add(editor, [{ name: 'noise.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }]);
  await editor.getByLabel('Formato', { exact: true }).selectOption('jpeg');
  await editor.getByRole('button', { name: 'Descargar imagen actual', exact: true }).click();
  await expect(editor.getByText('Descarga iniciada:', { exact: false })).toBeVisible();
  const exported = await latestDownload(editor);
  expect(exported.bytes.slice(0, 3)).toEqual([255, 216, 255]);
  expect(exported.bytes.length).toBeGreaterThan(0);
});

test('every output format encodes through the shared pipeline', async ({ editor }) => {
  test.setTimeout(120000);
  await add(editor);
  for (const format of ['png', 'jpeg', 'webp', 'avif', 'jxl', 'gif', 'bmp', 'ico', 'tiff', 'qoi', 'tga', 'svg', 'ppm', 'pgm', 'pbm', 'pam']) {
    await editor.getByLabel('Formato', { exact: true }).selectOption(format);
    await editor.getByRole('button', { name: 'Descargar imagen actual', exact: true }).click();
    await expect(editor.locator('.editor-section .inline-status'), format).toContainText('Descarga iniciada:', { timeout: 30000 });
    expect((await latestDownload(editor)).bytes.length, format).toBeGreaterThan(0);
  }
});

test('popup batch runs in the editor and keeps its settings', async ({ context, extensionId }) => {
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('input[type="file"]').setInputFiles([sample, { ...sample, name: 'another.svg' }]);
  await popup.getByLabel('Formato de salida', { exact: false }).selectOption('jpeg');
  const opened = context.waitForEvent('page');
  await popup.getByRole('button', { name: 'Convertir y descargar', exact: true }).click();
  const batchEditor = await opened;
  await expect(batchEditor.getByText('2 completadas; 0 con error.', { exact: true })).toBeVisible();
  await expect(batchEditor.getByLabel('Formato', { exact: true })).toHaveValue('jpeg');
  await expect(batchEditor.getByText('Guardando borrador…', { exact: false })).toHaveCount(0);
  await batchEditor.reload();
  await expect(batchEditor.getByLabel('Formato', { exact: true })).toHaveValue('jpeg');
  await expect(batchEditor.getByRole('button', { name: 'Descargar todo (2)', exact: true })).toBeVisible();
});

test('region capture uses selected pixels; Escape restores a full-page capture', async ({ context, editor }) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><style>html,body{margin:0;background:rgb(0,128,0)}body{height:6000px}</style>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const webpage = await context.newPage(); await webpage.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    await editor.evaluate(() => (globalThis as any).chrome.storage.local.set({ captureSettings: { destination: 'editor', format: 'webp' } }));
    await webpage.bringToFront();
    await editor.evaluate(() => (globalThis as any).chrome.runtime.sendMessage({ type: 'START_CAPTURE' }));
    await expect(webpage.locator('#__omni_image_capture_overlay__')).toBeVisible();
    const opened = context.waitForEvent('page');
    await webpage.mouse.move(100, 100); await webpage.mouse.down(); await webpage.mouse.move(300, 250, { steps: 5 }); await webpage.mouse.up();
    const capture = await opened;
    await expect(capture.getByLabel('Formato', { exact: true })).toHaveValue('webp');
    await expect.poll(() => pixel(capture, 20, 20)).toEqual([0, 128, 0, 255]);
    const dimensions = await capture.locator('canvas[aria-label="Resultado editado"]').evaluate((canvas) => [(canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height]);
    expect(dimensions).toEqual([200, 150]);
    await expect.poll(() => editor.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('captureStatus')).captureStatus.message)).toBe('Captura abierta en el editor.');
    await webpage.bringToFront(); await webpage.evaluate(() => scrollTo(0, 400));
    await editor.evaluate(() => (globalThis as any).chrome.runtime.sendMessage({ type: 'START_FULL_CAPTURE' }));
    await expect.poll(() => webpage.evaluate(() => scrollY)).not.toBe(400);
    await webpage.keyboard.press('Escape');
    await expect.poll(() => webpage.evaluate(() => scrollY)).toBe(400);
    await expect.poll(() => editor.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('captureStatus')).captureStatus.ok)).toBe(false);
  } finally { server.close(); }
});
