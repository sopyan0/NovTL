
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

export const isElectron = () => !!window.novtlAPI;
export const isCapacitorNative = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && (window.location.protocol === 'capacitor:' || window.location.protocol === 'http:');
};

/**
 * HYBRID STORAGE ENGINE
 */

export const fsWrite = async (filename: string, content: string | object): Promise<void> => {
    const stringData = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await putItem('fs_cache', { id: filename, content: stringData });

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
            console.error("FS Write Error:", e);
        }
    }
};

export const fsRead = async <T>(filename: string): Promise<T | null> => {
    let raw: string | null = null;
    const cached = await getItem('fs_cache', filename);
    if (cached) {
        raw = cached.content;
    } else {
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
            } catch (e) { return null; }
        }
        if (raw) await putItem('fs_cache', { id: filename, content: raw });
    }

    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
};

export const fsDelete = async (filename: string): Promise<void> => {
    await deleteItem('fs_cache', filename);
    if (isElectron()) {
        await window.novtlAPI!.delete(filename);
    } else if (isCapacitorNative()) {
        try {
            await Filesystem.deleteFile({ path: `NovTL/${filename}`, directory: Directory.Documents });
        } catch (e) {}
    }
};

/**
 * FIXED: Download ke folder 'Download' Android (Directory.External)
 */
export const triggerDownload = async (filename: string, blob: Blob) => {
    if (isCapacitorNative()) {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64data = (reader.result as string).split(',')[1];
            try {
                // 'Directory.External' pada Android mengarah ke root /storage/emulated/0/
                // Kita buat folder 'Download/NovTL_Export' agar terlihat di File Manager
                await Filesystem.writeFile({
                    path: `Download/NovTL_Export/${filename}`,
                    data: base64data,
                    directory: Directory.External,
                    recursive: true
                });
                alert(`✅ BERHASIL!\n\nFile tersimpan di:\n📁 Folder Download > NovTL_Export\n\nNama file: ${filename}`);
            } catch (e) {
                // Fallback jika permission External Storage gagal
                try {
                    await Filesystem.writeFile({
                        path: `NovTL_Export/${filename}`,
                        data: base64data,
                        directory: Directory.Documents,
                        recursive: true
                    });
                    alert(`✅ Tersimpan di Documents!\n\nKarena izin folder Download ditolak, file disimpan di:\n📁 Documents > NovTL_Export`);
                } catch (e2) {
                    alert("❌ Gagal mendownload. Harap aktifkan izin penyimpanan di pengaturan aplikasi.");
                }
            }
        };
    } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
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
