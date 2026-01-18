import { IDB_DB_NAME, IDB_DB_VERSION, IDB_STORE_NAME } from './keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function getDb() {
  dbPromise ??= openDb();
  return dbPromise;
}

export async function idbGet(key: string): Promise<unknown | undefined> {
  const db = await getDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const store = tx.objectStore(IDB_STORE_NAME);
    const req = store.get(key);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
    req.onsuccess = () => resolve(req.result as unknown);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    const req = store.put(value, key);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB put failed'));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

export async function idbDel(key: string): Promise<void> {
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    const req = store.delete(key);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

