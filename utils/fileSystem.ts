
import { Directory, Filesystem, Encoding } from '@capacitor/filesystem';
import { putItem, getItem, deleteItem } from './idb';

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
const isCapacitorNative = () => {
    return window.navigator.userAgent.includes('Wv') || window.location.protocol === 'capacitor:';
};

/**
 * HYBRID STORAGE ENGINE
 * Menulis ke File Fisik (Permanen) DAN IndexedDB (Cache Cepat).
 */

export const fsWrite = async (filename: string, content: string | object): Promise<void> => {
    const stringData = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    // 1. Tulis ke Cache (IndexedDB) - Selalu dilakukan untuk kecepatan UI
    await putItem('fs_cache', { id: filename, content: stringData });

    // 2. Tulis ke File Fisik (Permanen)
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
    }
};

export const fsRead = async <T>(filename: string): Promise<T | null> => {
    let raw: string | null = null;

    // A. Cek Cache (IndexedDB) - Prioritas Pertama
    const cached = await getItem('fs_cache', filename);
    if (cached) {
        raw = cached.content;
    } else {
        // B. Jika Cache Kosong, Baca dari File Fisik
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
        }
        
        // C. Jika Berhasil Baca File, Masukkan kembali ke Cache untuk loading berikutnya
        if (raw) {
            await putItem('fs_cache', { id: filename, content: raw });
        }
    }

    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return raw as unknown as T;
    }
};

export const fsDelete = async (filename: string): Promise<void> => {
    // Hapus dari Cache
    await deleteItem('fs_cache', filename);

    // Hapus dari Fisik
    if (isElectron()) {
        await window.novtlAPI!.delete(filename);
    } else if (isCapacitorNative()) {
        try {
            await Filesystem.deleteFile({
                path: `NovTL/${filename}`,
                directory: Directory.Documents
            });
        } catch (e) {}
    }
};

export const initFileSystem = async () => {
    if (isCapacitorNative()) {
        try {
            await Filesystem.mkdir({ path: 'NovTL', directory: Directory.Documents, recursive: true });
            await Filesystem.mkdir({ path: 'NovTL/chapters', directory: Directory.Documents, recursive: true });
        } catch (e) {}
    }
};
