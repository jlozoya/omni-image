# Omni Image Converter & Capture

Chrome and Firefox WebExtension built from one WXT + React + React Aria codebase.

The extension converts local image files entirely in the browser and can capture a rectangular region of the active webpage, encode it to the configured format, and save it through the browser Downloads API with `saveAs: false`.

## Features

- Local conversion; images are not uploaded to a server.
- Multiple-file conversion from the popup.
- Drag-and-drop file selection, in addition to the file picker.
- Full-tab editor with per-image settings, crop, rotation, flips, manual placement, annotations and undo/redo.
- Batch downloads, ZIP archives and per-file error/retry handling.
- Paste images with Ctrl/Cmd+V and copy edited results as PNG.
- Persistent local drafts, including originals and edits, with reopening and explicit deletion.
- Offline Spanish/English OCR with bundled models.
- Region capture from the toolbar or keyboard shortcut.
- Full-page scrolling capture from the popup; send either capture mode to the editor or directly to Downloads.
- Default capture shortcut: `Ctrl+Shift+Period` (`Ctrl+Shift+.`), `Command+Shift+Period` on macOS.
- Output goes to the browser's configured downloads directory.
- Configurable capture format, filename prefix, background color and ICO sizes.
- Firefox shortcut can be updated from the options page. Chrome shortcut customization is handled by Chrome's extension shortcut settings.
- Uses `activeTab` + `scripting` instead of persistent `<all_urls>` host access.
- Manifest V3 for both Chrome and Firefox.

## Output formats

| Format | Output | Alpha | Notes |
| --- | --- | --- | --- |
| PNG | Yes | Yes | Native Canvas encoder |
| JPEG / JPG | Yes | No | Configurable quality |
| WebP | Yes | Yes | Configurable quality |
| AVIF | Yes | Yes | jSquash WebAssembly encoder |
| JPEG XL / JXL | Yes | Yes | jSquash WebAssembly encoder |
| GIF | Yes | Yes | Static single-frame GIF |
| BMP | Yes | Yes | 32-bit BMP encoder |
| ICO | Yes | Yes | Multi-resolution Windows icon; configurable sizes |
| TIFF | Yes | Yes | UTIF encoder; uncompressed output |
| QOI | Yes | Yes | jSquash WebAssembly encoder |
| TGA | Yes | Yes | Uncompressed 32-bit TGA |
| SVG | Yes | Yes | Raster image embedded in an SVG wrapper; not vector tracing |
| PPM | Yes | No | Binary P6 |
| PGM | Yes | No | Binary P5 grayscale |
| PBM | Yes | No | Binary P4 monochrome |
| PAM | Yes | Yes | P7 RGBA |

## Accepted inputs

The file picker accepts:

- PNG, JPEG/JPG/JFIF, WebP, AVIF, GIF, BMP, ICO, SVG
- TIFF/TIF
- HEIC/HEIF
- JPEG XL/JXL
- QOI
- TGA
- PPM, PGM, PBM, PAM

Decoding strategy:

- Browser-native decoders are used where available.
- AVIF, JXL and QOI have WebAssembly fallbacks/codecs.
- HEIC/HEIF is decoded with `heic-to` and is **input-only** in this version.
- TIFF, TGA and PNM-family files have dedicated decoders.

### Why HEIC/HEIF is input-only

HEIC output normally requires an HEVC encoder. Shipping an HEVC encoder in a browser extension adds substantial codec, binary-size and licensing/distribution considerations. AVIF provides a modern high-efficiency output format without making HEIC encoding a hidden dependency. The architecture leaves room for a separately reviewed HEIC encoder later.

## Animation behavior

This release is designed around a single decoded RGBA frame. When a browser decoder opens an animated GIF/WebP/AVIF, conversion is therefore a static-image conversion rather than animation transcoding. GIF output is also a single-frame GIF.

A future animation pipeline should explicitly decode frame timing/disposal and use animated GIF/WebP/AVIF encoders rather than silently pretending to preserve animation.

## Image editor

Select images in the popup and press **Editar imagen(es)**, or open the editor directly and use **Agregar imágenes**, drag files onto the page or paste with Ctrl/Cmd+V. The image list switches between independent edits, keeping only the active image decoded for editing.

The editor can open with no images. The file picker remains available while editing. **Convertir y descargar** in the popup transfers the configured batch to the editor and starts it there, so closing the popup does not interrupt conversion.

Per image:

1. Drag the crop box or its bottom-right handle, or enter numeric coordinates. Fixed ratios include 1:1, 4:3, 16:9 and 9:16. Rotate in 90-degree steps or flip either axis.
2. Set output dimensions. A zero dimension is automatic; with **Mantener proporción**, entering one dimension calculates the other. Disable the lock and enable manual placement to position/scale the source inside an output canvas, even when its dimensions match the original.
3. Add arrows, rectangles, opaque black redaction blocks, text or numbered markers on the result. Text is typed in place: click where the note belongs and an editor opens there, matching the exported font size and colour. Clicking an existing note reopens it for editing, and clearing its text deletes it. Esc discards the edit; clicking elsewhere or Ctrl/Cmd+Enter commits it. Annotation coordinates are relative to the output canvas. **Deshacer/Rehacer** remembers up to 40 local edits while that image remains selected; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z work outside text fields.
4. Choose format/quality/background. Copy uses PNG at the edited dimensions.
5. Download individually or as a batch. The batch toolbar has its own format selector that overrides every image's format for that run; left on **Formato de cada imagen** each image keeps its own. Batch downloads continue past failed images and provide a retry button. ZIP names have numeric prefixes to avoid collisions. Stopping a batch finishes the current image and keeps completed results.

The popup hands files off through IndexedDB (`lib/pending-image.ts`). Reads are idempotent, including React StrictMode's double mount. Transfers are deleted only after the editor commits its durable draft; abandoned transfers older than 24 hours are cleaned on the next transfer. The editor replaces transfer IDs in its URL with a session ID. Drafts autosave locally after a short debounce and survive reloads. **Recuperar otro borrador** opens a previous draft, and **Vaciar borrador** deletes the current one. Drafts retain original pixels even after adding redactions; exported images contain flattened annotations.

`lib/editor-render.ts` is the shared pipeline for preview, exports, batches, clipboard and OCR. **Extraer texto del resultado** runs Tesseract.js with bundled Spanish/English models, including offline. Recognized text is editable and copyable; it is not persisted in drafts. WXT's public-assets hook bundles workers, WASM and language data without runtime CDN requests. See [Tesseract local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).

## Region capture

1. Press `Ctrl+Shift+.` or click **Seleccionar área ahora**.
2. Drag over the visible part of the webpage.
3. Release the pointer.
4. The overlay is removed.
5. The extension captures the visible tab, maps CSS viewport coordinates to screenshot pixels, crops the rectangle and either downloads it in the configured format or opens a lossless PNG in the editor.
6. Press `Esc` to cancel selection.

Region selection covers the visible viewport. **Capturar página completa** instead scrolls the main document horizontally and vertically, stitches screenshots and restores the original scroll position. Fixed/sticky elements are hidden after the first tile and restored afterward. Keep the source tab active; Esc cancels. A cleanup watchdog restores page styles if the background context is interrupted. Full-page capture is bounded to the document size measured at the start; infinite feeds, nested scrollers and content that changes while capturing may not produce a faithful result.

Capture buttons are disabled on internal browser pages, extension pages and extension stores. Failed captures, including shortcut failures, set a visible **!** badge, an action tooltip and a status message in the popup. Switching tabs during capture aborts instead of intentionally capturing the other tab.

## Shortcut notes

The WebExtensions `commands` manifest supports a restricted set of named keys. `Ctrl+|` is not a portable valid native command shortcut, so the default is `Ctrl+Shift+Period`.

- Chrome: customize from `chrome://extensions/shortcuts`.
- Firefox: the options page calls `commands.update()`; Firefox's extension shortcut UI is also available from `about:addons`.

## Install dependencies

Requires Node.js LTS and Bun (the repository uses `bun.lock`).

```bash
bun install --frozen-lockfile
```

## Development

Chrome:

```bash
bun run dev:chrome
```

Firefox:

```bash
bun run dev:firefox
```

`bun run dev` is an alias for `bun run dev:chrome` (Chrome is the default WXT target).

## Production builds

Chrome:

```bash
bun run build:chrome
bun run zip:chrome
```

Firefox:

```bash
bun run build:firefox
bun run zip:firefox
```

`bun run build` / `bun run zip` are aliases for the `:chrome` variants.

WXT writes browser-specific artifacts under `dist/`.

## Manual unpacked installation

After a production build:

- Chrome/Chromium: open the Extensions page, enable Developer mode, choose **Load unpacked**, and select the generated Chrome directory under `dist/`.
- Firefox: use `about:debugging` → **This Firefox** → **Load Temporary Add-on** and select the generated manifest from the Firefox output directory.

## Background script bundling

The background entrypoint is declared as an ES module background (`defineBackground({ type: 'module', ... })` in `entrypoints/background.ts`), rather than the default classic/IIFE service worker. This lets the bundler code-split the background output instead of inlining every dependency it can reach (including the AVIF/JXL WASM encoders used during region capture) into one file — `background.js` is a few KB instead of tens of megabytes. Module-type MV3 background scripts are supported by current Chrome and by Firefox 101+ (this extension already targets `strict_min_version: "128.0"`).

## Permissions

```text
activeTab  - temporary access to the active page after an explicit user action
scripting  - injects the temporary region-selection UI
downloads  - saves converted/captured files
storage    - stores capture preferences
clipboardWrite - copies edited PNG images and recognized text on request
```

There is intentionally no `<all_urls>` host permission.

## WebAssembly CSP

AVIF, JPEG XL, QOI and HEIC/HEIF decoding use WebAssembly-based packages. Manifest V3 requires the extension-page Content Security Policy to explicitly allow WebAssembly compilation, so the generated manifest includes `wasm-unsafe-eval` while retaining `script-src 'self'`.

## Project structure

```text
entrypoints/
  background.ts       capture command, injection, screenshot and download
  popup/              converter + quick capture controls
  editor/             image workspace, annotations, OCR and batch export
  options/            capture and keyboard settings
lib/
  codec.ts            output dispatch
  decode.ts           input dispatch
  canvas.ts           bitmap/canvas helpers, resize
  crop.ts             crop helper
  pending-image.ts    hands a File off from the popup to the editor tab
  editor-store.ts     durable image/edit drafts and their summaries
  editor-model.ts     shared edit state
  editor-render.ts    transforms, annotations and target-size export
  full-page-capture.ts scrolling capture and page cleanup
  clipboard.ts       PNG clipboard output
  ocr.ts             offline text recognition
  encoders/           format encoders
  decoders/           dedicated format decoders
  settings.ts         browser.storage preferences
  formats.ts          format registry
public/                extension icons
wxt.config.ts          WXT/manifest configuration
```

## Privacy

The conversion pipeline operates locally. No analytics, accounts, telemetry, remote API, image upload endpoint, or external host permission is included in the source. See [PRIVACY.md](PRIVACY.md) for the full policy (English and Spanish).

## Known limitations

- Static-frame conversion only; animated frame preservation is not implemented.
- Full-page capture handles the main document, not nested scrollers or infinite feeds. Maximum 80 tiles, 40 megapixels and 32767 pixels on either axis. Edited output uses the same pixel/dimension limits.
- ZIP output is limited to 200 MB of encoded files. Use smaller batches or individual downloads for larger work.
- OCR accuracy depends on text size, contrast and language. Only Spanish and English models ship in this version.
- Clipboard image output is PNG; browsers may still restrict clipboard operations.
- SVG output embeds raster pixels; it does not perform vectorization.
- HEIC/HEIF output is deliberately not shipped.
- Browser-native decoding varies by browser/version for some source formats; dedicated decoders/fallbacks cover the formats listed above where implemented.

## License

MIT. Third-party packages retain their own licenses; review them before distribution through browser stores, especially codec-related packages.
