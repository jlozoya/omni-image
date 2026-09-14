const DB_NAME = 'omni-image-pending';
const STORE_NAME = 'files';
const DB_VERSION = 1;

interface StoredImage {
  id: string;
  name: string;
  type: string;
  buffer: ArrayBuffer;
  createdAt?: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Stores a file for a not-yet-opened editor tab and returns its id. */
export async function savePendingImage(file: File): Promise<string> {
  const id = crypto.randomUUID();
  const buffer = await file.arrayBuffer();
  const record: StoredImage = { id, name: file.name, type: file.type, buffer, createdAt: Date.now() };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    const cursor = tx.objectStore(STORE_NAME).openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      const stored = item.value as StoredImage;
      if (stored.createdAt && stored.createdAt < Date.now() - 24 * 60 * 60 * 1000) item.delete();
      item.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  return id;
}

/** Remove transfers only after the editor has committed its durable draft. */
export async function removePendingImages(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      ids.forEach((id) => tx.objectStore(STORE_NAME).delete(id));
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

/** Idempotent read: React StrictMode and reloads must not consume the transfer. */
export async function takePendingImage(id: string): Promise<File | null> {
  const db = await openDb();
  const record = await new Promise<StoredImage | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => resolve(getRequest.result as StoredImage | undefined);
    getRequest.onerror = () => reject(getRequest.error);
  });
  db.close();

  if (!record) return null;
  return new File([record.buffer], record.name, { type: record.type });
}
