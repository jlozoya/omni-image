import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { Button, FileTrigger } from 'react-aria-components';
import { ACCEPTED_INPUT_EXTENSIONS, OUTPUT_FORMATS, formatInfo } from '../../lib/formats';
import { DEFAULT_SETTINGS, getCaptureSettings, saveCaptureSettings } from '../../lib/settings';
import type { CaptureSettings, OutputFormat } from '../../lib/types';
import { savePendingImage } from '../../lib/pending-image';
import { isCapturableUrl } from '../../lib/utils';
import { defaultEdit } from '../../lib/editor/model';
import { writeDraft } from '../../lib/editor/store';

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<OutputFormat>('webp');
  const [quality, setQuality] = useState(90);
  const [background, setBackground] = useState('#ffffff');
  const [captureSettings, setCaptureSettings] = useState<CaptureSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [canCapture, setCanCapture] = useState(true);
  const [captureStatus, setCaptureStatus] = useState('');

  useEffect(() => {
    void browser.storage.local
      .get('captureStatus')
      .then((data) => setCaptureStatus((data.captureStatus as { message?: string } | undefined)?.message ?? ''));
    const changed = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes.captureStatus)
        setCaptureStatus((changes.captureStatus.newValue as { message?: string })?.message ?? '');
    };
    browser.storage.onChanged.addListener(changed);
    void getCaptureSettings().then(setCaptureSettings);
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setCanCapture(isCapturableUrl(tab?.url)));
    return () => browser.storage.onChanged.removeListener(changed);
  }, []);

  const selectedInfo = useMemo(() => formatInfo(format), [format]);

  async function convertSelected() {
    if (!files.length || busy) return;
    setBusy(true);
    try {
      const session = crypto.randomUUID();
      await writeDraft(
        session,
        files.map((file) => ({
          id: crypto.randomUUID(),
          file,
          edit: { ...defaultEdit(), format, quality: quality / 100, background },
        })),
      );
      await browser.tabs.create({ url: `${browser.runtime.getURL('/editor.html')}?session=${session}&batch=1` });
      window.close();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Falló la conversión.');
    } finally {
      setBusy(false);
    }
  }

  async function updateCaptureFormat(value: OutputFormat) {
    const next = { ...captureSettings, format: value };
    setCaptureSettings(next);
    await saveCaptureSettings(next);
  }

  async function startCapture() {
    await browser.runtime.sendMessage({ type: 'START_CAPTURE' });
    window.close();
  }

  async function updateDestination(destination: CaptureSettings['destination']) {
    const next = { ...captureSettings, destination };
    try {
      await saveCaptureSettings(next);
      setCaptureSettings(next);
    } catch (error) {
      setStatus(String(error));
    }
  }

  function acceptDroppedFiles(list: FileList | null) {
    if (!list?.length) return;
    const accepted = ACCEPTED_INPUT_EXTENSIONS.split(',');
    const dropped = Array.from(list).filter((file) => {
      const dot = file.name.lastIndexOf('.');
      const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
      return accepted.includes(ext);
    });
    if (dropped.length) setFiles((current) => [...current, ...dropped]);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setIsDropActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDropActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDropActive(false);
    acceptDroppedFiles(event.dataTransfer.files);
  }

  async function openEditor() {
    if (busy) return;
    setBusy(true);
    try {
      let url = browser.runtime.getURL('/editor.html');
      if (files.length) {
        const ids = await Promise.all(files.map((file) => savePendingImage(file)));
        url += `?ids=${ids.map(encodeURIComponent).join(',')}`;
      }
      await browser.tabs.create({ url });
      window.close();
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  return (
    <main className="app-shell">
      <header className="header">
        <div>
          <h1>Omni Image</h1>
          <p>Convertir y capturar, todo local.</p>
        </div>
        <Button
          className="icon-button"
          onPress={() => browser.runtime.openOptionsPage()}
          aria-label="Abrir configuración">
          ⚙
        </Button>
      </header>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Convertir imágenes</h2>
            <p>Procesamiento local. Soporta múltiples archivos.</p>
          </div>
        </div>

        <div
          className={`drop-zone${isDropActive ? ' drop-zone-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}>
          <FileTrigger
            allowsMultiple
            acceptedFileTypes={ACCEPTED_INPUT_EXTENSIONS.split(',')}
            onSelect={(list) => setFiles(list ? Array.from(list) : [])}>
            <Button className="drop-button">
              <strong>
                {files.length
                  ? `${files.length} archivo${files.length === 1 ? '' : 's'} seleccionado${files.length === 1 ? '' : 's'}`
                  : 'Seleccionar imágenes'}
              </strong>
              <span>
                {isDropActive ? 'Suelta para agregar' : 'PNG, JPG, WebP, AVIF, HEIC, TIFF, JXL, QOI, TGA, PNM…'}
              </span>
              <span className="drop-hint">o arrastra y suelta aquí</span>
            </Button>
          </FileTrigger>
        </div>

        {files.length > 0 && (
          <div className="file-list" aria-label="Archivos seleccionados">
            {files.map((file, index) => (
              <div className="file-row" key={`${file.name}-${file.size}-${index}`}>
                <span className="file-name">{file.name}</span>
                <Button className="file-remove" onPress={() => removeFile(index)} aria-label={`Quitar ${file.name}`}>
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="field-grid">
          <label className="field">
            <span>Formato de salida</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)}>
              {OUTPUT_FORMATS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {selectedInfo.qualityControl && (
            <label className="field">
              <span>Calidad: {quality}%</span>
              <input
                type="range"
                min="1"
                max="100"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </label>
          )}

          {!selectedInfo.alpha && (
            <label className="field">
              <span>Fondo para transparencia</span>
              <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
            </label>
          )}
        </div>

        {selectedInfo.notes && <p className="note">{selectedInfo.notes}</p>}

        <div className="button-row">
          <Button className="secondary-button" isDisabled={busy} onPress={() => void openEditor()}>
            {files.length === 0 ? 'Abrir editor' : files.length > 1 ? 'Editar imágenes' : 'Editar imagen'}
          </Button>
          <Button className="primary-button" isDisabled={!files.length || busy} onPress={convertSelected}>
            {busy ? 'Convirtiendo…' : 'Convertir y descargar'}
          </Button>
        </div>
      </section>

      <section className="panel compact-panel">
        <div className="section-heading capture-heading">
          <div>
            <h2>Captura de región</h2>
            <p>
              Atajo predeterminado: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>.</kbd>
            </p>
          </div>
        </div>

        <label className="field">
          <span>Después de capturar</span>
          <select
            value={captureSettings.destination}
            onChange={(event) => void updateDestination(event.target.value as CaptureSettings['destination'])}>
            <option value="download">Descargar directamente</option>
            <option value="editor">Abrir en editor</option>
          </select>
        </label>
        <label className="field">
          <span>Formato de captura</span>
          <select
            value={captureSettings.format}
            onChange={(e) => void updateCaptureFormat(e.target.value as OutputFormat)}>
            {OUTPUT_FORMATS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <Button className="secondary-button" isDisabled={!canCapture} onPress={startCapture}>
          Seleccionar área ahora
        </Button>
        <Button
          className="secondary-button"
          isDisabled={!canCapture}
          onPress={async () => {
            await browser.runtime.sendMessage({ type: 'START_FULL_CAPTURE' });
            window.close();
          }}>
          Capturar página completa
        </Button>
        <p className="note">La captura completa recorre la página. Mantén la pestaña activa; Esc cancela.</p>
        {captureStatus && (
          <p className="note" role="status">
            {captureStatus}
          </p>
        )}
        {!canCapture && (
          <p className="note">
            No se puede capturar esta pestaña (páginas internas del navegador o de otras extensiones).
          </p>
        )}
      </section>

      {status && (
        <div className="status" role="status">
          {status}
        </div>
      )}
    </main>
  );
}
