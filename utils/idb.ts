
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
  // REVISI: Menghapus database secara total agar benar-benar bersih
  // Browser/Webview akan membuat ulang DB baru saat halaman direload
  if (window.indexedDB) {
      return new Promise((resolve) => {
          // Tutup koneksi aktif jika ada (best effort)
          initIDB().then(db => db.close()).catch(() => {});
          
          const req = window.indexedDB.deleteDatabase(DB_NAME);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
          req.onblocked = () => {
              console.warn("Delete DB blocked, reloading anyway might fix it.");
              resolve(false);
          };
      });
  }
};
