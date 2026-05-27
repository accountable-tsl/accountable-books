/**
 * Key-Value storage abstraction layer.
 *
 * This module provides a unified interface for storing data that:
 * 1. Tries IndexedDB first (better for larger data, async)
 * 2. Falls back to localStorage (works everywhere, sync)
 *
 * All data is stored as JSON strings.
 */

import { IDB_DATABASE_NAME, IDB_STORE_NAME, IDB_VERSION } from './keys';

// ============================================================================
// IndexedDB Implementation (preferred)
// ============================================================================

/**
 * Open the IndexedDB database, creating it if needed.
 */
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DATABASE_NAME, IDB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    // Create the object store if it doesn't exist
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
  });
}

// Cache the database connection
let dbPromise: Promise<IDBDatabase> | null = null;

function getDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openIndexedDB();
  }
  return dbPromise;
}

/**
 * Get a value from IndexedDB
 */
async function idbGet(key: string): Promise<unknown | undefined> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE_NAME, 'readonly');
    const store = transaction.objectStore(IDB_STORE_NAME);
    const request = store.get(key);

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB get failed'));
    };

    request.onsuccess = () => {
      resolve(request.result as unknown);
    };
  });
}

/**
 * Set a value in IndexedDB
 */
async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(IDB_STORE_NAME);
    const request = store.put(value, key);

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB set failed'));
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
  });
}

/**
 * Delete a value from IndexedDB
 */
async function idbDel(key: string): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(IDB_STORE_NAME);
    const request = store.delete(key);

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB delete failed'));
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
  });
}

// ============================================================================
// localStorage Implementation (fallback)
// ============================================================================

/**
 * Get a value from localStorage
 */
async function localGet(key: string): Promise<unknown | undefined> {
  const raw = localStorage.getItem(key);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Set a value in localStorage
 */
async function localSet(key: string, value: unknown): Promise<void> {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Delete a value from localStorage
 */
async function localDel(key: string): Promise<void> {
  localStorage.removeItem(key);
}

// ============================================================================
// Unified Storage Interface
// ============================================================================

type StorageDriver = {
  get: (key: string) => Promise<unknown | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
};

/**
 * Check if IndexedDB is available in this environment
 */
function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Test if IndexedDB actually works (some browsers have it but it's disabled)
 */
async function testIndexedDB(): Promise<boolean> {
  if (!isIndexedDBAvailable()) return false;

  try {
    const testKey = '__storage_test__';
    const testValue = { test: true };
    await idbSet(testKey, testValue);
    const retrieved = await idbGet(testKey);
    await idbDel(testKey);
    return retrieved !== undefined;
  } catch {
    return false;
  }
}

/**
 * Create the appropriate storage driver based on what's available
 */
async function createStorageDriver(): Promise<StorageDriver> {
  // Try IndexedDB first
  if (await testIndexedDB()) {
    return {
      get: idbGet,
      set: idbSet,
      del: idbDel,
    };
  }

  // Fall back to localStorage
  return {
    get: localGet,
    set: localSet,
    del: localDel,
  };
}

// Cache the driver so we only test once
let driverPromise: Promise<StorageDriver> | null = null;

/**
 * Get the storage driver (IndexedDB or localStorage)
 */
async function getStorageDriver(): Promise<StorageDriver> {
  if (!driverPromise) {
    driverPromise = createStorageDriver();
  }
  return driverPromise;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a value from storage
 */
export async function storageGet(key: string): Promise<unknown | undefined> {
  const driver = await getStorageDriver();
  return driver.get(key);
}

/**
 * Set a value in storage
 */
export async function storageSet(key: string, value: unknown): Promise<void> {
  const driver = await getStorageDriver();
  return driver.set(key, value);
}

/**
 * Delete a value from storage
 */
export async function storageDelete(key: string): Promise<void> {
  const driver = await getStorageDriver();
  return driver.del(key);
}
