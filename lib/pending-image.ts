const DB_NAME = 'omni-image-pending';
const STORE_NAME = 'files';
const DB_VERSION = 1;

interface StoredImage {
  id: string;
  name: string;
  type: string;
  buffer: ArrayBuffer;
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
  const record: StoredImage = { id, name: file.name, type: file.type, buffer };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  return id;
}

/** Reads and removes a pending file by id (single use). */
export async function takePendingImage(id: string): Promise<File | null> {
  const db = await openDb();
  const record = await new Promise<StoredImage | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => resolve(getRequest.result as StoredImage | undefined);
    getRequest.onerror = () => reject(getRequest.error);
    store.delete(id);
  });
  db.close();

  if (!record) return null;
  return new File([record.buffer], record.name, { type: record.type });
}
