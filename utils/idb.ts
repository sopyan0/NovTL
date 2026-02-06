
/**
 * Simple IndexedDB Wrapper for NovTL
 * Handles offline storage for projects, chapters, and glossaries.
 */

const DB_NAME = 'NovTL_Offline_DB';
const DB_VERSION = 2; // Naikkan versi untuk migrasi store baru

export const initIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chapters')) {
        db.createObjectStore('chapters', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('glossaries')) {
        db.createObjectStore('glossaries', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chat_history')) {
        db.createObjectStore('chat_history', { keyPath: 'id' });
      }
      // NEW: Store untuk status aplikasi (scroll, active EPUB metadata)
      if (!db.objectStoreNames.contains('app_state')) {
        db.createObjectStore('app_state', { keyPath: 'id' });
      }
      // NEW: Store khusus binary file EPUB agar tidak hilang saat navigasi
      if (!db.objectStoreNames.contains('epub_files')) {
        db.createObjectStore('epub_files', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const putItem = async (storeName: string, item: any) => {
  const db = await initIDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getAllItems = async (storeName: string): Promise<any[]> => {
  const db = await initIDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getItem = async (storeName: string, id: string): Promise<any> => {
  const db = await initIDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deleteItem = async (storeName: string, id: string) => {
  const db = await initIDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const clearStore = async (storeName: string) => {
  const db = await initIDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
