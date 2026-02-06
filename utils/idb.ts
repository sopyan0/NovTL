
/**
 * IndexedDB Wrapper for NovTL (Cache Layer)
 */
const DB_NAME = 'NovTL_Hybrid_Cache';
const DB_VERSION = 3;

export const initIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Store untuk Cache File (Mirroring Filesystem)
      if (!db.objectStoreNames.contains('fs_cache')) {
        db.createObjectStore('fs_cache', { keyPath: 'id' });
      }
      // Store untuk data aplikasi lainnya
      const stores = ['projects', 'chapters', 'chat_history', 'app_state', 'epub_files'];
      stores.forEach(s => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      });
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

export const clearCacheOnly = async () => {
  const db = await initIDB();
  const stores = ['fs_cache', 'chapters', 'chat_history'];
  const promises = stores.map(s => {
    return new Promise((resolve) => {
        const tx = db.transaction(s, 'readwrite');
        tx.objectStore(s).clear().onsuccess = () => resolve(true);
    });
  });
  await Promise.all(promises);
};
