import type { EditorEntry } from './model';
export interface DraftSummary {
  id: string;
  name: string;
  count: number;
  updatedAt: number;
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('omni-image-drafts', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('sessions')) request.result.createObjectStore('sessions');
      if (!request.result.objectStoreNames.contains('summaries')) request.result.createObjectStore('summaries');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readDraft(id: string): Promise<EditorEntry[] | undefined> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('sessions').objectStore('sessions').get(id);
      request.onsuccess = () => resolve(request.result?.entries);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function writeDraft(id: string, entries: EditorEntry[]): Promise<void> {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['sessions', 'summaries'], 'readwrite');
      if (entries.length) {
        const updatedAt = Date.now();
        tx.objectStore('sessions').put({ entries, updatedAt }, id);
        tx.objectStore('summaries').put({ id, name: entries[0]!.file.name, count: entries.length, updatedAt }, id);
      } else {
        tx.objectStore('sessions').delete(id);
        tx.objectStore('summaries').delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar el borrador.'));
    });
  } finally {
    db.close();
  }
}

export async function listDrafts(): Promise<DraftSummary[]> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('summaries').objectStore('summaries').getAll();
      request.onsuccess = () => resolve((request.result as DraftSummary[]).sort((a, b) => b.updatedAt - a.updatedAt));
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
