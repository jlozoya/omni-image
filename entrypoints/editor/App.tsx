import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import { Button, FileTrigger } from 'react-aria-components';
import { ACCEPTED_INPUT_EXTENSIONS } from '../../lib/formats';
import { takePendingImage } from '../../lib/pending-image';
import ImageEditorSection from './ImageEditorSection';

interface Entry {
  id: string;
  file: File | null;
  error: string;
}

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDropActive, setIsDropActive] = useState(false);

  useEffect(() => {
    const ids = new URLSearchParams(window.location.search).get('ids');
    const idList = ids ? ids.split(',').filter(Boolean) : [];
    if (!idList.length) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void Promise.all(
      idList.map(async (id): Promise<Entry> => {
        try {
          const file = await takePendingImage(id);
          return { id, file, error: file ? '' : 'No se encontró la imagen. Ábrela de nuevo desde el popup de la extensión.' };
        } catch (err) {
          return { id, file: null, error: err instanceof Error ? err.message : 'No se pudo abrir la imagen.' };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setEntries(results);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function addFiles(list: FileList | Iterable<File> | null) {
    if (!list) return;
    const accepted = ACCEPTED_INPUT_EXTENSIONS.split(',');
    const picked = Array.from(list).filter((file) => {
      const dot = file.name.lastIndexOf('.');
      const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
      return accepted.includes(ext);
    });
    if (!picked.length) return;
    setEntries((current) => [...current, ...picked.map((file) => ({ id: crypto.randomUUID(), file, error: '' }))]);
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
    addFiles(event.dataTransfer.files);
  }

  function removeEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }

  return (
    <main className="editor-page">
      <header>
        <h1>Editar imágenes</h1>
        <p>{entries.length ? `${entries.length} ${entries.length === 1 ? 'imagen' : 'imágenes'} para editar` : 'Omni Image'}</p>
      </header>

      {loading && (
        <div className="card">
          <p className="note">Cargando…</p>
        </div>
      )}

      {!loading && !entries.length && (
        <div className="card">
          <div
            className={`drop-zone${isDropActive ? ' drop-zone-active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <FileTrigger allowsMultiple acceptedFileTypes={ACCEPTED_INPUT_EXTENSIONS.split(',')} onSelect={(list) => addFiles(list)}>
              <Button className="drop-button">
                <strong>Seleccionar imágenes</strong>
                <span>{isDropActive ? 'Suelta para agregar' : 'PNG, JPG, WebP, AVIF, HEIC, TIFF, JXL, QOI, TGA, PNM…'}</span>
                <span className="drop-hint">o arrastra y suelta aquí</span>
              </Button>
            </FileTrigger>
          </div>
        </div>
      )}

      {entries.map((entry) =>
        entry.file ? (
          <ImageEditorSection key={entry.id} file={entry.file} onRemove={() => removeEntry(entry.id)} />
        ) : (
          <section className="editor-section" key={entry.id}>
            <div className="card section-header">
              <p className="note error">{entry.error}</p>
              <Button className="section-remove" onPress={() => removeEntry(entry.id)} aria-label="Quitar">
                ✕
              </Button>
            </div>
          </section>
        ),
      )}
    </main>
  );
}
