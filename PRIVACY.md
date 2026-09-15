# Privacy Policy — Omni Image Converter & Capture

_Last updated: 2026-09-12_

Omni Image processes images, screenshots and OCR on your device. It does not upload images or recognized text, collect analytics, use accounts, or contact a remote service. All executable code, codecs and the Spanish/English OCR models are bundled in the extension.

## Local data

- `browser.storage.local` stores capture preferences and the last capture status.
- IndexedDB stores editor drafts: original image files, edits and annotations. Drafts survive reloads and can be reopened through **Recuperar otro borrador**. **Vaciar borrador** deletes the current draft. To delete another draft, open it and empty it. Uninstalling the extension removes its browser storage.
- Popup-to-editor transfers use a separate IndexedDB store. Transfers are removed after the editor saves a draft. Abandoned transfers older than 24 hours are cleaned when another image is transferred.
- OCR results remain in the current editor component's memory and are not included in drafts. Copying an image or text explicitly writes it to the system clipboard. Downloads remain in the folder managed by your browser and are not deleted when a draft is cleared.

Drafts include original images, even when the exported result contains opaque redaction blocks. The exported image flattens those blocks into pixels. Clear the draft if you no longer want to retain its original image locally.

## Permissions

| Permission       | Purpose                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`      | Temporary access to the active webpage after you invoke the extension.                                                                                                          |
| `scripting`      | Region selection, or scrolling and temporarily hiding fixed/sticky elements during a requested full-page capture. The page's scroll position and styles are restored afterward. |
| `downloads`      | Save converted images, captures and ZIP archives after your action.                                                                                                             |
| `storage`        | Local preferences.                                                                                                                                                              |
| `clipboardWrite` | Copy edited images or OCR text when you press Copy.                                                                                                                             |

There is no `<all_urls>` host permission or clipboard-read permission. Pasting images uses the browser's paste event after you press Ctrl/Cmd+V. Full-page capture operates on the current document, including what it renders, and requires that tab to remain active.

## Third-party libraries

The bundled codecs (`@jsquash/*`, `heic-to`, `gifenc`, `utif`), ZIP library (`fflate`), OCR engine (`tesseract.js` / `tesseract.js-core`) and language data (`@tesseract.js-data/eng`, `@tesseract.js-data/spa`) run locally. Their respective licenses apply. OCR is configured with extension-local worker, core and language paths; it does not download models from a CDN at runtime.

## Contact and changes

Changes to this policy are tracked in the repository. Questions can be raised through [GitHub Issues](https://github.com/jlozoya/omni-image/issues).

---

# Política de privacidad — Omni Image Converter & Capture

_Última actualización: 2026-09-12_

Omni Image procesa imágenes, capturas y OCR en tu dispositivo. No sube imágenes ni texto reconocido, no recopila analítica, no usa cuentas ni contacta servicios remotos. Todo el código, los códecs y los modelos OCR de español e inglés se incluyen en la extensión.

## Datos locales

- `browser.storage.local` guarda preferencias de captura y el último estado de captura.
- IndexedDB guarda borradores del editor: archivos originales, ajustes y anotaciones. Sobreviven a una recarga y se pueden abrir desde **Recuperar otro borrador**. **Vaciar borrador** elimina el borrador actual. Para borrar otro, ábrelo y vacíalo. Desinstalar la extensión elimina su almacenamiento del navegador.
- Los traspasos del popup al editor usan otro almacén IndexedDB. Se eliminan después de guardar el borrador. Los traspasos abandonados con más de 24 horas se limpian al transferir otra imagen.
- El texto OCR permanece en la memoria del componente de edición actual y no se guarda en el borrador. Copiar una imagen o texto lo escribe explícitamente en el portapapeles del sistema. Las descargas permanecen en la carpeta administrada por el navegador y no se borran al vaciar un borrador.

Los borradores incluyen la imagen original, aunque el resultado exportado tenga bloques opacos para ocultar datos. El archivo exportado integra esos bloques en los píxeles. Vacía el borrador si ya no quieres conservar el original localmente.

## Permisos

| Permiso          | Propósito                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`      | Acceso temporal a la página activa después de invocar la extensión.                                                                                                           |
| `scripting`      | Seleccionar una región o desplazar la página y ocultar temporalmente elementos fijos durante una captura completa solicitada. Después se restauran la posición y los estilos. |
| `downloads`      | Guardar imágenes, capturas y archivos ZIP tras tu acción.                                                                                                                     |
| `storage`        | Preferencias locales.                                                                                                                                                         |
| `clipboardWrite` | Copiar la imagen editada o el texto OCR al pulsar Copiar.                                                                                                                     |

No se solicita `<all_urls>` ni permiso para leer el portapapeles. Pegar imágenes utiliza el evento del navegador después de pulsar Ctrl/Cmd+V. La captura completa actúa sobre el documento actual y su contenido renderizado; requiere mantener activa esa pestaña.

## Librerías de terceros

Los códecs incluidos (`@jsquash/*`, `heic-to`, `gifenc`, `utif`), la librería ZIP (`fflate`), el motor OCR (`tesseract.js` / `tesseract.js-core`) y los modelos (`@tesseract.js-data/eng`, `@tesseract.js-data/spa`) se ejecutan localmente y conservan sus licencias. El OCR usa rutas de la propia extensión para el worker, el motor y los idiomas; no descarga modelos de un CDN durante su uso.

## Contacto y cambios

Los cambios de esta política quedan registrados en el repositorio. Puedes plantear preguntas en [GitHub Issues](https://github.com/jlozoya/omni-image/issues).
