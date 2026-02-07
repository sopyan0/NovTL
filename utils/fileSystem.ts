
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { putItem, getItem, deleteItem } from './idb';

declare global {
    interface Window {
        novtlAPI?: {
            write: (filename: string, content: string) => Promise<{ success: boolean; error?: string }>;
            read: (filename: string) => Promise<string | null>;
            list: (folder: string) => Promise<string[]>;
            delete: (filename: string) => Promise<{ success: boolean }>;
            getStoragePath: () => Promise<string>;
            readClipboard: () => Promise<string>;
            platform: string;
        };
    }
}

export const isElectron = () => !!window.novtlAPI;

// FIXED: Gunakan Capacitor Core untuk deteksi platform yang akurat.
// Regex lama gagal karena Capacitor Android modern menggunakan scheme 'https://', sehingga dianggap Web biasa.
export const isCapacitorNative = () => Capacitor.isNativePlatform();

/**
 * HYBRID STORAGE ENGINE
 */

export const fsWrite = async (filename: string, content: string | object): Promise<void> => {
    const stringData = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    
    // 1. Simpan ke Cache (IDB) dulu agar UI cepat
    await putItem('fs_cache', { id: filename, content: stringData });

    // 2. Simpan ke File Fisik (Storage Persisten)
    if (isElectron()) {
        const res = await window.novtlAPI!.write(filename, stringData);
        if (!res.success) throw new Error(res.error || "Failed to write to disk");
    } else if (isCapacitorNative()) {
        try {
            await Filesystem.writeFile({
                path: `NovTL/${filename}`,
                data: stringData,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
                recursive: true
            });
        } catch (e: any) {
            console.error("FS Write Error:", e);
            // CRITICAL: Jangan diam saja jika gagal tulis file!
            // Lempar error agar UI tahu bahwa penyimpanan fisik gagal.
            throw new Error(`Gagal menyimpan ke penyimpanan internal: ${e.message}. Pastikan izin penyimpanan aktif.`);
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
 * FIXED: Gunakan 'Share API' untuk Android.
 * Ini memicu dialog sistem "Simpan ke..." atau "Kirim ke...", 
 * yang 100% berhasil di Android 11+ tanpa masalah permission Download folder.
 */
export const triggerDownload = async (filename: string, blob: Blob) => {
    if (isCapacitorNative()) {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64data = (reader.result as string).split(',')[1];
            try {
                // 1. Tulis ke Cache sementara
                const tempPath = `temp_export/${filename}`;
                const writeResult = await Filesystem.writeFile({
                    path: tempPath,
                    data: base64data,
                    directory: Directory.Cache, // Gunakan Cache directory yang selalu boleh ditulis
                    recursive: true
                });

                // 2. Panggil Share Dialog
                await Share.share({
                    title: 'Export NovTL',
                    text: `Berikut adalah file export Anda: ${filename}`,
                    files: [writeResult.uri],
                    dialogTitle: 'Simpan atau Bagikan File'
                });

            } catch (e: any) {
                alert(`Export Error: ${e.message}`);
            }
        };
    } else {
        // Desktop / Web behavior
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
            // REQUEST PERMISSION SECARA EKSPLISIT SAAT INIT
            const perm = await Filesystem.checkPermissions();
            if (perm.publicStorage !== 'granted') {
                await Filesystem.requestPermissions();
            }

            // Buat folder kerja
            await Filesystem.mkdir({ path: 'NovTL', directory: Directory.Documents, recursive: true });
            await Filesystem.mkdir({ path: 'NovTL/chapters', directory: Directory.Documents, recursive: true });
        } catch (e) {
            console.warn("Init FS Warning:", e);
        }
    }
};
