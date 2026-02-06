
import { Directory, Filesystem, Encoding } from '@capacitor/filesystem';
import { putItem, getItem, deleteItem } from './idb';

// Interface untuk Global API dari Electron (lihat preload.js)
declare global {
    interface Window {
        novtlAPI?: {
            write: (filename: string, content: string) => Promise<{ success: boolean; error?: string }>;
            read: (filename: string) => Promise<string | null>;
            list: (folder: string) => Promise<string[]>;
            delete: (filename: string) => Promise<{ success: boolean }>;
            getStoragePath: () => Promise<string>;
            platform: string;
        };
    }
}

const isElectron = () => !!window.novtlAPI;
// Deteksi apakah berjalan di dalam aplikasi Android (Native)
const isCapacitorNative = () => {
    return window.navigator.userAgent.includes('Wv') || window.location.protocol === 'capacitor:' || window.location.protocol === 'http:' && window.navigator.userAgent.includes('Android');
};

/**
 * ADAPTER PENYIMPANAN CERDAS (3 MODE)
 * 1. ELECTRON (.EXE): Simpan ke Documents/NovTL komputer.
 * 2. CAPACITOR (.APK): Simpan ke Documents/NovTL HP Android.
 * 3. WEB/PWA: Simpan ke IndexedDB Browser.
 */

export const fsWrite = async (filename: string, content: string | object): Promise<void> => {
    const stringData = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    if (isElectron()) {
        await window.novtlAPI!.write(filename, stringData);
    } else if (isCapacitorNative()) {
        try {
            await Filesystem.writeFile({
                path: `NovTL/${filename}`,
                data: stringData,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
                recursive: true
            });
        } catch (e) {
            console.error("Android Write Error:", e);
        }
    } else {
        // Fallback Web: IndexedDB
        await putItem('fs_emulation', { id: filename, content: stringData });
    }
};

export const fsRead = async <T>(filename: string): Promise<T | null> => {
    let raw: string | null = null;

    if (isElectron()) {
        raw = await window.novtlAPI!.read(filename);
    } else if (isCapacitorNative()) {
        try {
            const result = await Filesystem.readFile({
                path: `NovTL/${filename}`,
                directory: Directory.Documents,
                encoding: Encoding.UTF8
            });
            raw = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
        } catch (e) {
            return null;
        }
    } else {
        const item = await getItem('fs_emulation', filename);
        raw = item ? item.content : null;
    }

    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return raw as unknown as T;
    }
};

export const fsDelete = async (filename: string): Promise<void> => {
    if (isElectron()) {
        await window.novtlAPI!.delete(filename);
    } else if (isCapacitorNative()) {
        try {
            await Filesystem.deleteFile({
                path: `NovTL/${filename}`,
                directory: Directory.Documents
            });
        } catch (e) {}
    } else {
        await deleteItem('fs_emulation', filename);
    }
};

export const initFileSystem = async () => {
    if (isCapacitorNative()) {
        try {
            // Minta izin storage di Android (otomatis dihandle OS modern saat tulis file)
            // Buat folder dasar
            await Filesystem.mkdir({ path: 'NovTL', directory: Directory.Documents, recursive: true });
            await Filesystem.mkdir({ path: 'NovTL/chapters', directory: Directory.Documents, recursive: true });
        } catch (e) {}
    }
};
