
import { Capacitor } from '@capacitor/core';
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
            readClipboard: () => Promise<string>;
            saveToDownloads: (filename: string, base64Data: string) => Promise<{ success: boolean; path?: string; error?: string }>;
            platform: string;
        };
    }
}

export const isElectron = () => !!window.novtlAPI;
export const isCapacitorNative = () => Capacitor.isNativePlatform();

/**
 * HYBRID STORAGE ENGINE
 * Mengelola penyimpanan internal aplikasi (Working Directory)
 */

export const fsWrite = async (filename: string, content: string | object): Promise<void> => {
    const stringData = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    
    // Cache ke IDB (untuk performa baca cepat)
    await putItem('fs_cache', { id: filename, content: stringData });

    if (isElectron()) {
        const res = await window.novtlAPI!.write(filename, stringData);
        if (!res.success) throw new Error(res.error || "Failed to write to disk");
    } else if (isCapacitorNative()) {
        try {
            // Simpan ke Documents internal aplikasi (Hidden/Private)
            await Filesystem.writeFile({
                path: `NovTL/${filename}`,
                data: stringData,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
                recursive: true
            });
        } catch (e: any) {
            console.error("FS Write Error:", e);
            throw new Error(`Gagal menyimpan ke penyimpanan internal: ${e.message}`);
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
 * FEATURE: DIRECT DOWNLOAD (REAL DOWNLOAD FOLDER)
 * 
 * Android: Menyimpan langsung ke folder publik "Download/NovTL" menggunakan ExternalStorage.
 * Ini membuat file langsung muncul di File Manager / Downloads app tanpa menu Share.
 * 
 * Electron: Membuka dialog save atau menyimpan ke folder Downloads OS.
 */
export const triggerDownload = async (filename: string, blob: Blob) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    
    reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        
        if (isElectron()) {
            // ELECTRON: Save to Downloads folder via Main Process
            try {
                const res = await window.novtlAPI!.saveToDownloads(filename, base64data);
                if (res.success) {
                    alert(`✅ File berhasil didownload!\n\n📂 Lokasi: ${res.path}`);
                } else {
                    alert(`❌ Gagal menyimpan: ${res.error}`);
                }
            } catch (e) {
                alert("Error saat menyimpan di Desktop.");
            }
        } 
        else if (isCapacitorNative()) {
            // ANDROID: Save to Public Download folder
            try {
                // Trik Capacitor: Directory.ExternalStorage + Path "Download/..." 
                // ini mengarah ke /storage/emulated/0/Download/NovTL/...
                const exportPath = `Download/NovTL/${filename}`;
                
                await Filesystem.writeFile({
                    path: exportPath,
                    data: base64data,
                    directory: Directory.ExternalStorage, // Akses ke root storage publik
                    recursive: true
                });

                // File di folder Download publik biasanya otomatis terindeks oleh Android MediaScanner modern
                alert(`✅ BERHASIL DIDOWNLOAD!\n\n📂 Cek File Manager Anda:\nPenyimpanan Internal > Download > NovTL > ${filename}`);

            } catch (e: any) {
                console.error("Download Error", e);
                
                // Fallback: Jika ExternalStorage gagal (misal di Android versi sangat lama atau strict)
                // Kita coba simpan ke Documents lalu beri tahu user
                try {
                     await Filesystem.writeFile({
                        path: `NovTL_Exports/${filename}`,
                        data: base64data,
                        directory: Directory.Documents,
                        recursive: true
                    });
                    alert(`⚠️ Gagal akses folder Download.\nFile disimpan di: Documents/NovTL_Exports/${filename}`);
                } catch(err2: any) {
                    alert(`❌ Gagal total menyimpan file.\nError: ${e.message}`);
                }
            }
        } else {
            // WEB Browser (Chrome/Firefox/Safari)
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link); // Required for Firefox
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    };
};

export const initFileSystem = async () => {
    if (isCapacitorNative()) {
        try {
            const perm = await Filesystem.checkPermissions();
            if (perm.publicStorage !== 'granted') {
                await Filesystem.requestPermissions();
            }

            // Init Folder Kerja (Private/App Scope)
            await Filesystem.mkdir({ path: 'NovTL', directory: Directory.Documents, recursive: true });
            
            // Coba Init Folder Export di Download (Optional, mungkin gagal kalau permission belum ada saat init)
            try {
                await Filesystem.mkdir({ path: 'Download/NovTL', directory: Directory.ExternalStorage, recursive: true });
            } catch (e) {
                // Ignore, akan dibuat otomatis saat write file dengan recursive: true
            }
        } catch (e) {
            console.warn("Init FS Warning:", e);
        }
    }
};
