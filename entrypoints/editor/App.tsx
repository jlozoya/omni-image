import { useEffect, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { ACCEPTED_INPUT_EXTENSIONS, OUTPUT_FORMATS } from '../../lib/formats';
import { takePendingImage, removePendingImages } from '../../lib/pending-image';
import { readDraft, writeDraft, listDrafts } from '../../lib/editor-store';
import type { DraftSummary } from '../../lib/editor-store';
import { defaultEdit } from '../../lib/editor-model';
import type { EditorEntry } from '../../lib/editor-model';
import type { OutputFormat } from '../../lib/types';
import { decodeImageFile } from '../../lib/decode';
import { encodeEdit } from '../../lib/editor-render';
import { downloadEncoded } from '../../lib/download';
import { basenameWithoutExtension, safeFilenamePart } from '../../lib/utils';
import ImageEditorSection from './ImageEditorSection';

const params = new URLSearchParams(location.search);
const pendingIds = (params.get('ids') ?? '').split(',').filter(Boolean);
const sessionId = params.get('session') ?? (pendingIds.length ? `import-${pendingIds.join('-')}` : 'default');
// Stable across StrictMode mounts. Reading the transfer must be idempotent.
let initialLoad: Promise<EditorEntry[]> | undefined;
async function loadEntries() {
  const draft = await readDraft(sessionId);
  if (draft) return draft;
  const entries: EditorEntry[] = [];
  for (const id of pendingIds) {
    const file = await takePendingImage(id);
    if (!file) throw new Error('No se encontró una imagen transferida. Vuelve a abrirla desde el popup.');
    entries.push({ id, file, edit: defaultEdit() });
  }
  return entries;
}
interface Result { id: string; name: string; ok: boolean; message: string }
export default function App() {
  const [entries, setEntries] = useState<EditorEntry[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [batchFormat, setBatchFormat] = useState<OutputFormat>('png');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const cancelled = useRef(false);
  const saveQueue = useRef(Promise.resolve());
  const autoStarted = useRef(false);
  const draftPromoted = useRef(false);

  useEffect(() => {
    let live = true;
    initialLoad ??= loadEntries();
    initialLoad.then((items) => { if (live) { setEntries(items); setSelected(items[0]?.id ?? ''); setLoading(false); } })
      .catch((error) => { if (live) { setStatus(String(error)); setLoading(false); setLoadFailed(true); } });
    // Drops profiles saved by earlier versions; the feature no longer exists.
    void browser.storage.local.remove('exportProfiles').catch(() => {});
    void listDrafts().then((items) => { if (live) setDrafts(items); }).catch((error) => { if (live) setStatus(String(error)); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (loading || loadFailed) return;
    let obsolete = false;
    setSaving(true);
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => writeDraft(sessionId, entries));
      void saveQueue.current.then(async () => {
        if (!draftPromoted.current && pendingIds.length) {
          draftPromoted.current = true;
          const url = new URL(location.href); url.searchParams.delete('ids'); url.searchParams.set('session', sessionId); history.replaceState(null, '', url);
          await removePendingImages(pendingIds);
        }
        const nextDrafts = await listDrafts();
        if (!obsolete) { setDrafts(nextDrafts); setSaving(false); }
      }).catch((error) => { if (!obsolete) { setSaving(false); setStatus(`No se guardó el borrador: ${String(error)}`); } });
    }, 400);
    return () => { obsolete = true; clearTimeout(timer); };
  }, [entries, loading, loadFailed]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) { if (saving || busy) { event.preventDefault(); event.returnValue = ''; } }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [saving, busy]);

  function addFiles(list: Iterable<File> | null) {
    if (!list || loading || busy || loadFailed) return;
    const accepted = ACCEPTED_INPUT_EXTENSIONS.split(',');
    const all = Array.from(list);
    const files = all.filter((file) => accepted.includes(file.name.slice(file.name.lastIndexOf('.')).toLowerCase()) || file.type.startsWith('image/'));
    const additions = files.map((file) => ({ id: crypto.randomUUID(), file, edit: defaultEdit() }));
    setEntries((items) => [...items, ...additions]);
    if (additions[0]) setSelected(additions[0].id);
    setStatus(all.length !== files.length ? `${all.length - files.length} archivo(s) no admitido(s).` : 'Imágenes agregadas.');
  }
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length || busy || loading) return;
      event.preventDefault(); addFiles(files);
    }
    window.addEventListener('paste', paste); return () => window.removeEventListener('paste', paste);
  }, [busy, loading]);
  async function batch(zip: boolean, retry = false) {
    if (busy) return;
    setBusy(true); cancelled.current = false;
    const queue = retry ? entries.filter((entry) => results.some((result) => result.id === entry.id && !result.ok)) : [...entries];
    const output: Record<string, Uint8Array> = {};
    const report: Result[] = [];
    let totalBytes = 0;
    try {
      for (const [index, entry] of queue.entries()) {
        if (cancelled.current) break;
        setStatus(`Procesando ${index + 1}/${queue.length}: ${entry.file.name}`);
        try {
          const source = await decodeImageFile(entry.file);
          const { encoded } = await encodeEdit(source, { ...entry.edit, format: batchFormat });
          const name = `${String(index + 1).padStart(3, '0')}-${safeFilenamePart(basenameWithoutExtension(entry.file.name))}.${encoded.extension}`;
          if (zip) {
            if (totalBytes + encoded.bytes.length > 200 * 1024 * 1024) throw new Error('El ZIP supera 200 MB. Divide el lote o descarga archivos individuales.');
            output[name] = encoded.bytes; totalBytes += encoded.bytes.length;
          } else await downloadEncoded(encoded, name);
          report.push({ id: entry.id, name: entry.file.name, ok: true, message: zip ? 'Incluida en ZIP' : 'Descarga iniciada' });
        } catch (error) { report.push({ id: entry.id, name: entry.file.name, ok: false, message: error instanceof Error ? error.message : String(error) }); }
        setResults([...report]);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (zip && Object.keys(output).length) {
        setStatus('Preparando ZIP…');
        const bytes = zipSync(output, { level: 0 });
        await downloadEncoded({ bytes, mime: 'application/zip', extension: 'zip' }, 'omni-images.zip');
      }
      setStatus(`${cancelled.current ? 'Lote detenido. ' : ''}${report.filter((item) => item.ok).length} completadas; ${report.filter((item) => !item.ok).length} con error.`);
    } catch (error) {
      setResults(report.map((item) => item.ok && zip ? { ...item, ok: false, message: 'No se pudo descargar el ZIP. Reintenta.' } : item));
      setStatus(String(error));
    } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!loading && entries.length && params.get('batch') === '1' && !autoStarted.current) {
      autoStarted.current = true;
      const url = new URL(location.href); url.searchParams.delete('batch'); history.replaceState(null, '', url);
      void batch(false);
    }
  }, [loading]);
  const active = entries.find((entry) => entry.id === selected) ?? entries[0];
  return <main className="editor-page" onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
    <header><h1>Omni Image · Editor</h1><p>Imágenes, capturas y texto. Todo se procesa en tu dispositivo.</p></header>
    <section className="card workspace-panel">
      <div className="workspace-header">
        <div>
          <h2>Imágenes</h2>
          <p className="muted">{saving ? 'Guardando borrador...' : 'Borrador guardado'} · {entries.length} {entries.length === 1 ? 'imagen' : 'imágenes'}</p>
        </div>
        <div className="workspace-actions">
          <label className="upload-action" title="Agregar imágenes">
            <input className="visually-hidden" aria-label="Agregar imágenes" type="file" multiple accept={ACCEPTED_INPUT_EXTENSIONS} disabled={busy || loading || loadFailed} onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
            <span aria-hidden="true">＋</span> Agregar
          </label>
          <button className="soft-danger" disabled={!entries.length || busy} onClick={() => { setEntries([]); setResults([]); setSelected(''); }}>Vaciar</button>
        </div>
      </div>
      {drafts.some((draft) => draft.id !== sessionId) && <label className="field draft-picker">Recuperar borrador<select value="" disabled={saving || busy} onChange={(event) => { if (event.target.value) location.href = `${browser.runtime.getURL('/editor.html')}?session=${encodeURIComponent(event.target.value)}`; }}><option value="">Elegir borrador local</option>{drafts.filter((draft) => draft.id !== sessionId).map((draft) => <option value={draft.id} key={draft.id}>{draft.name} · {draft.count} imagen(es)</option>)}</select></label>}
      {loading && <p role="status">Cargando borrador…</p>}
      {loadFailed && <div className="toolbar"><button onClick={() => location.reload()}>Reintentar carga</button><button onClick={() => { location.href = `${browser.runtime.getURL('/editor.html')}?session=${crypto.randomUUID()}`; }}>Abrir borrador nuevo</button></div>}
      {!loading && !entries.length && <p>No hay imágenes. Agrega archivos o pega una captura para comenzar.</p>}
      {!!entries.length && <>
        <div className="image-list" aria-label="Imágenes del borrador">{entries.map((entry, index) => <div key={entry.id} className={entry.id === active?.id ? 'image-tab selected' : 'image-tab'}>
          <button className="image-tab-main" aria-pressed={entry.id === active?.id} onClick={() => setSelected(entry.id)} disabled={busy}><span aria-hidden="true">{index + 1}</span>{entry.file.name}</button>
          <button className="image-tab-remove" aria-label={`Quitar ${entry.file.name}`} title="Quitar imagen" disabled={busy} onClick={() => setEntries((items) => items.filter((item) => item.id !== entry.id))}>×</button>
        </div>)}</div>
        <div className="workspace-commandbar">
          <div className="batch-actions">
            <label className="field batch-format">Formato de descarga<select aria-label="Formato del lote" value={batchFormat} disabled={busy} onChange={(event) => setBatchFormat(event.target.value as OutputFormat)}>
              {OUTPUT_FORMATS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <button className="primary" disabled={busy} onClick={() => void batch(false)}>Descargar todo ({entries.length})</button>
            <button disabled={busy} onClick={() => void batch(true)}>Descargar ZIP del lote</button>
            {results.some((result) => !result.ok) && <button disabled={busy} onClick={() => void batch(false, true)}>Reintentar fallidas</button>}
            {busy && <button onClick={() => { cancelled.current = true; setStatus('Se detendrá al terminar la imagen actual.'); }}>Detener lote</button>}
          </div>
        </div>
      </>}
    </section>
    {status && <p className="inline-status toast" role="status">{status}</p>}
    {!!results.length && <details className="card" open><summary>Resultados del lote</summary><ul>{results.map((result) => <li key={result.id} className={result.ok ? '' : 'note error'}>{result.name}: {result.message}</li>)}</ul></details>}
    {active && <ImageEditorSection key={active.id} entry={active} disabled={busy}
      onChange={(edit) => setEntries((items) => items.map((item) => item.id === active.id ? { ...item, edit } : item))} />}
  </main>;
}
