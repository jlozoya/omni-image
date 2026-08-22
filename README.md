# Omni Image Converter & Capture

Chrome and Firefox WebExtension built from one WXT + React + React Aria codebase.

The extension converts local image files entirely in the browser and can capture a rectangular region of the active webpage, encode it to the configured format, and save it through the browser Downloads API with `saveAs: false`.

## Features

- Local conversion; images are not uploaded to a server.
- Multiple-file conversion from the popup.
- Drag-and-drop file selection, in addition to the file picker.
- Built-in editor for a single image, opened in its own browser tab for more room: crop (draggable/resizable selection) and resize to an exact width/height, then convert and download.
- Region capture from the toolbar or keyboard shortcut.
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

Select one or more images in the popup and press **Editar imagen(es)**. The files are handed off to a full browser tab (`editor.html`) so there's more room to work than the popup allows. Each selected image gets its own independent section (crop, size, format, quality/background, and its own **Aplicar y descargar**) stacked on the same page.

The editor tab can also be opened with no images at all (e.g. `editor.html` with no `ids` in the URL, or after clearing every pending id) — in that case it shows a file picker (supports drag-and-drop) so images can be selected directly from the tab instead of the popup.

Per image:

1. Drag the crop box or its corner handles over the preview to select the region to keep.
2. Set the final output width/height (in pixels). Toggle **Mantener proporción** to keep the crop's aspect ratio while typing either dimension.
3. Pick the output format (and quality/background, when applicable).
4. Press **Aplicar y descargar** to crop, resize and encode that image, then save it through the Downloads API. The tab stays open so you can adjust and export again.

The popup hands each `File` off to the editor tab through a short-lived IndexedDB entry (`lib/pending-image.ts`), keyed by a random id; the tab is opened once with all ids joined in its URL (`editor.html?ids=id1,id2,...`), since a `File`/blob URL can't be passed directly between an extension popup (which closes as soon as the tab opens) and a new tab. Each entry is read once and deleted immediately. Images picked directly in the editor tab (empty-state file picker) skip this hand-off entirely, since they're already in that page's context.

Cropping and resizing both run on the decoded `ImageFrame` (`lib/crop.ts`, `resizeFrame` in `lib/canvas.ts`) before the existing per-format encoders run, so the editor supports every output format already listed above.

## Region capture

1. Press `Ctrl+Shift+.` or click **Seleccionar área ahora**.
2. Drag over the visible part of the webpage.
3. Release the pointer.
4. The overlay is removed.
5. The extension captures the visible tab, maps CSS viewport coordinates to the actual screenshot pixel dimensions, crops the requested rectangle, encodes it, and downloads it.
6. Press `Esc` to cancel selection.

The current implementation captures a region of the **visible viewport**. It does not stitch a scrolling/full-page selection.

**Seleccionar área ahora** is disabled in the popup (with an explanatory note) when the active tab is one where `browser.scripting.executeScript` can't inject the selection overlay: browser-internal pages (`chrome://`, `edge://`, `about:`, `devtools://`, …), other extensions' pages (`chrome-extension://`, `moz-extension://`), and extension/add-on store pages. The keyboard shortcut is unaffected by this check and still fails silently (logged to the console) on those same tabs, since `commands.onCommand` fires without popup context. See `isCapturableUrl` in `lib/utils.ts`.

## Shortcut notes

The WebExtensions `commands` manifest supports a restricted set of named keys. `Ctrl+|` is not a portable valid native command shortcut, so the default is `Ctrl+Shift+Period`.

- Chrome: customize from `chrome://extensions/shortcuts`.
- Firefox: the options page calls `commands.update()`; Firefox's extension shortcut UI is also available from `about:addons`.

## Install dependencies

Requires a current Node.js LTS and npm.

```bash
npm install
```

## Development

Chrome:

```bash
npm run dev:chrome
```

Firefox:

```bash
npm run dev:firefox
```

`npm run dev` is an alias for `npm run dev:chrome` (Chrome is the default WXT target).

## Production builds

Chrome:

```bash
npm run build:chrome
npm run zip:chrome
```

Firefox:

```bash
npm run build:firefox
npm run zip:firefox
```

`npm run build` / `npm run zip` are aliases for the `:chrome` variants.

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
```

There is intentionally no `<all_urls>` host permission.

## WebAssembly CSP

AVIF, JPEG XL, QOI and HEIC/HEIF decoding use WebAssembly-based packages. Manifest V3 requires the extension-page Content Security Policy to explicitly allow WebAssembly compilation, so the generated manifest includes `wasm-unsafe-eval` while retaining `script-src 'self'`.

## Project structure

```text
entrypoints/
  background.ts       capture command, injection, screenshot and download
  popup/              converter + quick capture controls
  editor/             crop/resize editor (its own tab), one section per image
  options/            capture and keyboard settings
lib/
  codec.ts            output dispatch
  decode.ts           input dispatch
  canvas.ts           bitmap/canvas helpers, resize
  crop.ts             crop helper
  pending-image.ts    hands a File off from the popup to the editor tab
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
- Region capture is limited to the visible viewport, not scrolling screenshots.
- SVG output embeds raster pixels; it does not perform vectorization.
- HEIC/HEIF output is deliberately not shipped.
- Browser-native decoding varies by browser/version for some source formats; dedicated decoders/fallbacks cover the formats listed above where implemented.

## License

MIT. Third-party packages retain their own licenses; review them before distribution through browser stores, especially codec-related packages.
