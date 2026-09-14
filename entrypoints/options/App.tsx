import { useEffect, useState } from 'react';
import { Button, Input, Label, TextField } from 'react-aria-components';
import { OUTPUT_FORMATS, formatInfo } from '../../lib/formats';
import { DEFAULT_SETTINGS, getCaptureSettings, saveCaptureSettings } from '../../lib/settings';
import type { CaptureSettings, OutputFormat } from '../../lib/types';

export default function App() {
  const [settings, setSettings] = useState<CaptureSettings>(DEFAULT_SETTINGS);
  const [shortcut, setShortcut] = useState('Ctrl+Shift+Period');
  const [message, setMessage] = useState('');
  const isFirefox = navigator.userAgent.includes('Firefox');

  useEffect(() => {
    void Promise.all([getCaptureSettings(), browser.commands.getAll()]).then(([stored, commands]) => {
      setSettings(stored);
      const command = commands.find((item) => item.name === 'capture-region');
      if (command?.shortcut) setShortcut(command.shortcut);
    });
  }, []);

  async function persist(next: CaptureSettings) {
    setSettings(next);
    await saveCaptureSettings(next);
    setMessage('Configuración guardada.');
  }

  async function saveShortcut() {
    if (!isFirefox) {
      setMessage('Chrome administra los atajos desde chrome://extensions/shortcuts.');
      return;
    }
    const commands = browser.commands as unknown as {
      update?: (details: { name: string; shortcut: string }) => Promise<void>;
    };
    if (!commands.update) {
      setMessage('Este navegador no permite cambiar el atajo desde la extensión.');
      return;
    }
    try {
      await commands.update({ name: 'capture-region', shortcut });
      setMessage('Atajo actualizado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el atajo.');
    }
  }

  async function openBrowserShortcutSettings() {
    try {
      await browser.tabs.create({ url: isFirefox ? 'about:addons' : 'chrome://extensions/shortcuts' });
    } catch {
      setMessage(isFirefox ? 'Abre about:addons para administrar atajos.' : 'Abre chrome://extensions/shortcuts para administrar atajos.');
    }
  }

  const selectedInfo = formatInfo(settings.format);

  return (
    <main className="settings-page">
      <header>
        <h1>Omni Image</h1>
        <p>Configuración de capturas y descargas.</p>
      </header>

      <section className="card">
        <h2>Captura de región</h2>
        <div className="form-grid">
          <label className="field"><span>Después de capturar</span>
            <select value={settings.destination} onChange={(event) => void persist({ ...settings, destination: event.target.value as CaptureSettings['destination'] })}>
              <option value="download">Descargar directamente</option><option value="editor">Abrir en editor</option>
            </select>
          </label>
          <label className="field">
            <span>Formato predeterminado</span>
            <select value={settings.format} onChange={(e) => void persist({ ...settings, format: e.target.value as OutputFormat })}>
              {OUTPUT_FORMATS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>

          {selectedInfo.qualityControl && (
            <label className="field">
              <span>Calidad: {Math.round(settings.quality * 100)}%</span>
              <input
                type="range"
                min="1"
                max="100"
                value={Math.round(settings.quality * 100)}
                onChange={(e) => void persist({ ...settings, quality: Number(e.target.value) / 100 })}
              />
            </label>
          )}

          <TextField className="aria-field" value={settings.filenamePrefix} onChange={(value) => void persist({ ...settings, filenamePrefix: value })}>
            <Label>Prefijo de archivo</Label>
            <Input />
          </TextField>

          {!selectedInfo.alpha && (
            <label className="field">
              <span>Fondo para transparencia</span>
              <input type="color" value={settings.background} onChange={(e) => void persist({ ...settings, background: e.target.value })} />
            </label>
          )}

          {settings.format === 'ico' && (
            <TextField
              className="aria-field"
              value={settings.icoSizes.join(', ')}
              onChange={(value) => {
                const sizes = value.split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 256);
                setSettings({ ...settings, icoSizes: sizes });
              }}
              onBlur={() => void saveCaptureSettings(settings)}
            >
              <Label>Tamaños ICO (px, separados por coma)</Label>
              <Input />
            </TextField>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Atajo de teclado</h2>
        <p className="muted">Predeterminado: Ctrl + Shift + . El ejemplo Ctrl + | no es válido como comando nativo en Chrome/Firefox.</p>
        <div className="shortcut-row">
          <TextField className="aria-field grow" value={shortcut} onChange={setShortcut}>
            <Label>Combinación</Label>
            <Input />
          </TextField>
          <Button className="primary" onPress={saveShortcut}>{isFirefox ? 'Guardar atajo' : 'Ver instrucciones'}</Button>
        </div>
        <Button className="secondary" onPress={openBrowserShortcutSettings}>Abrir administrador de atajos del navegador</Button>
        {!isFirefox && <p className="muted">En Chrome, cambia el atajo en <code>chrome://extensions/shortcuts</code>.</p>}
      </section>

      <section className="card">
        <h2>Formatos</h2>
        <div className="formats-grid">
          {OUTPUT_FORMATS.map((item) => (
            <div className="format-chip" key={item.id}>
              <strong>{item.label}</strong>
              <span>{item.extension.toUpperCase()}</span>
            </div>
          ))}
        </div>
        <p className="muted">HEIC/HEIF está soportado como entrada. SVG de salida es un contenedor SVG con la imagen raster embebida, no una vectorización automática.</p>
      </section>

      {message && <div className="toast" role="status">{message}</div>}
    </main>
  );
}
