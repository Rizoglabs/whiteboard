// Local persistence with IndexedDB. No dependencies, promise-based.
// Stores a single document under a fixed key.

import { emptyDocument, type WhiteboardDocument } from './scene';

const DB_NAME = 'whiteboard-db';
const STORE_NAME = 'documents';
const DOC_KEY = 'main';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        let result: T;
        let requestError: unknown;
        const req = run(store);
        req.onsuccess = () => {
          result = req.result as T;
        };
        req.onerror = () => {
          requestError = req.error;
        };
        transaction.oncomplete = () => {
          db.close();
          if (requestError) reject(requestError);
          else resolve(result);
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error('IndexedDB transaction failed'));
        };
        transaction.onabort = () => {
          db.close();
          reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
        };
      }),
  );
}

function isValidDocument(value: unknown): value is WhiteboardDocument {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v['version'] === 1 && typeof v['shapes'] === 'object' && Array.isArray(v['order']);
}

export async function saveDocument(doc: WhiteboardDocument): Promise<void> {
  // Structured clone via IndexedDB keeps plain data; strip nothing.
  await tx('readwrite', (store) => store.put(doc, DOC_KEY));
}

export async function loadDocument(): Promise<WhiteboardDocument | null> {
  const value = await tx('readonly', (store) => store.get(DOC_KEY));
  if (value == null) return null;
  if (!isValidDocument(value)) return null;
  return value;
}

export async function clearDocument(): Promise<void> {
  await tx('readwrite', (store) => store.delete(DOC_KEY));
}

export function blankDocument(): WhiteboardDocument {
  return emptyDocument();
}
