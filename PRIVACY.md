# Privacy Policy — Omni Image Converter & Capture

_Last updated: 2026-08-22_

## Summary

Omni Image does not collect, store, or transmit any personal data. It has no accounts, no analytics, no telemetry, and no remote servers. Every image conversion, crop, resize, and region capture happens entirely on your device, inside your browser.

## What the extension does

- Converts image files you select into another format (PNG, JPEG, WebP, AVIF, HEIC/HEIF input, TIFF, JPEG XL, QOI, TGA, GIF, BMP, ICO, SVG, PPM/PGM/PBM/PAM).
- Lets you crop and resize an image in a dedicated editor tab before converting it.
- Captures a rectangular region of the currently active tab and saves it as an image.

All of this is done using the browser's own Canvas and WebAssembly APIs, running locally. No image, file, screenshot, or any other data is ever uploaded to a server operated by the developer or by any third party.

## Data the extension stores

The extension uses `chrome.storage.local` (browser-local storage, not synced to any account or server) for exactly two things:

1. **Capture preferences** — your chosen output format, quality, filename prefix, background color, and ICO sizes for region captures, so they're remembered between sessions.
2. **A short-lived local handoff** — when you send an image from the popup to the full-tab editor, the file is temporarily saved in an IndexedDB store on your device (see `lib/pending-image.ts`) so it can be picked up by the editor tab. Each entry is read exactly once and deleted immediately after.

None of this data ever leaves your browser. There is no cloud sync, no backend, and no third party with access to it.

## Permissions and why they're needed

| Permission | Purpose |
| --- | --- |
| `activeTab` | Grants temporary access to the tab you're currently viewing, only after you click the extension icon or trigger the capture shortcut — never in the background. |
| `scripting` | Injects a small, self-removing overlay script into the active tab so you can drag-select a region to capture. It runs only after your explicit action and removes itself when the selection is made or cancelled. |
| `downloads` | Saves the images you convert or capture to your browser's configured Downloads folder. Nothing is downloaded without you initiating a conversion or capture. |
| `storage` | Stores the local preferences and short-lived image handoff described above. |

The extension intentionally does **not** request broad host permissions (no `<all_urls>`) — it only ever touches the one tab you're actively working with.

## Third-party code

Image decoding/encoding for some formats (AVIF, JPEG XL, QOI, HEIC/HEIF) is handled by open-source WebAssembly libraries (`@jsquash/*`, `heic-to`, `gifenc`, `utif`) that are bundled directly into the extension at build time. They run locally and do not make network requests or send data anywhere.

## No remote code

All code that runs in this extension ships inside the extension package itself. Nothing is fetched or executed from a remote server or CDN at runtime.

## Children's privacy

The extension does not knowingly collect any information from anyone, including children, because it does not collect information from anyone at all.

## Changes to this policy

Any change to this policy will be made through a commit to this public repository, visible in its commit history.

## Contact

This project is open source. Questions or concerns can be raised via [GitHub Issues](https://github.com/jlozoya/omni-image/issues) on this repository.

---

# Política de privacidad — Omni Image Converter & Capture

_Última actualización: 2026-08-22_

## Resumen

Omni Image no recopila, almacena ni transmite ningún dato personal. No tiene cuentas, ni analítica, ni telemetría, ni servidores remotos. Toda conversión de imágenes, recorte, redimensión y captura de región ocurre completamente en tu dispositivo, dentro del navegador.

## Qué hace la extensión

- Convierte archivos de imagen que selecciones a otro formato (PNG, JPEG, WebP, AVIF, HEIC/HEIF como entrada, TIFF, JPEG XL, QOI, TGA, GIF, BMP, ICO, SVG, PPM/PGM/PBM/PAM).
- Permite recortar y redimensionar una imagen en una pestaña de edición dedicada antes de convertirla.
- Captura una región rectangular de la pestaña activa y la guarda como imagen.

Todo esto se hace usando las APIs de Canvas y WebAssembly del propio navegador, de forma local. Ninguna imagen, archivo, captura de pantalla u otro dato se sube jamás a un servidor del desarrollador ni de terceros.

## Datos que almacena la extensión

La extensión usa `chrome.storage.local` (almacenamiento local del navegador, no sincronizado a ninguna cuenta ni servidor) para exactamente dos cosas:

1. **Preferencias de captura** — el formato de salida elegido, calidad, prefijo de nombre de archivo, color de fondo y tamaños ICO para las capturas de región, para recordarlos entre sesiones.
2. **Un traspaso local temporal** — cuando envías una imagen del popup a la pestaña del editor, el archivo se guarda temporalmente en un almacén IndexedDB de tu dispositivo (ver `lib/pending-image.ts`) para que la pestaña del editor pueda recogerlo. Cada entrada se lee una sola vez y se elimina de inmediato.

Ninguno de estos datos sale nunca de tu navegador. No hay sincronización en la nube, ni backend, ni terceros con acceso a ellos.

## Permisos y por qué son necesarios

| Permiso | Propósito |
| --- | --- |
| `activeTab` | Otorga acceso temporal a la pestaña que estás viendo, solo después de hacer clic en el ícono de la extensión o activar el atajo de captura — nunca en segundo plano. |
| `scripting` | Inyecta un pequeño script de superposición, que se elimina a sí mismo, en la pestaña activa para que puedas arrastrar y seleccionar una región a capturar. Solo se ejecuta tras tu acción explícita y se elimina al hacer o cancelar la selección. |
| `downloads` | Guarda las imágenes que conviertes o capturas en la carpeta de descargas configurada del navegador. No se descarga nada sin que tú inicies una conversión o captura. |
| `storage` | Almacena las preferencias locales y el traspaso temporal de imágenes descritos arriba. |

La extensión intencionalmente **no** solicita permisos amplios de host (sin `<all_urls>`) — solo interactúa con la pestaña que estás usando activamente.

## Código de terceros

La decodificación/codificación de algunos formatos (AVIF, JPEG XL, QOI, HEIC/HEIF) la manejan librerías de código abierto en WebAssembly (`@jsquash/*`, `heic-to`, `gifenc`, `utif`), empaquetadas directamente en la extensión al momento de compilarla. Se ejecutan localmente y no hacen solicitudes de red ni envían datos a ningún lado.

## Sin código remoto

Todo el código que se ejecuta en esta extensión viaja dentro del propio paquete de la extensión. No se descarga ni ejecuta nada desde un servidor remoto o CDN en tiempo de ejecución.

## Privacidad de menores

La extensión no recopila conscientemente información de nadie, incluyendo menores, porque no recopila información de nadie en absoluto.

## Cambios a esta política

Cualquier cambio a esta política se hará mediante un commit a este repositorio público, visible en su historial.

## Contacto

Este proyecto es de código abierto. Preguntas o inquietudes pueden plantearse a través de [GitHub Issues](https://github.com/jlozoya/omni-image/issues) de este repositorio.
