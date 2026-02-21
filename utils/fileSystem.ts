
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem, Encoding } from '@capacitor/filesystem';

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

    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
};

export const fsDelete = async (filename: string): Promise<void> => {
    if (isElectron()) {
        await window.novtlAPI!.delete(filename);
    } else if (isCapacitorNative()) {
        try {
            await Filesystem.deleteFile({ path: `NovTL/${filename}`, directory: Directory.Documents });
        } catch (e) {}
    }
};

/**
 * FEATURE: DIRECT DOWNLOAD
 */
import { Share } from '@capacitor/share';

export const triggerDownload = async (filename: string, blob: Blob) => {
    // 1. ROBUST SANITIZATION
    // Remove forbidden characters for Windows/Linux/macOS
    let safeFilename = filename
        .replace(/[<>:"/\\|?*]/g, '_') // Forbidden Windows chars
        .replace(/[\x00-\x1F\x7F]/g, '') // Control characters
        .replace(/^\.+/, '') // No leading dots
        .replace(/[ .]+$/, '') // No trailing spaces or dots
        .trim();

    // Ensure extension is preserved if it was stripped
    if (!safeFilename.includes('.') && filename.includes('.')) {
        const ext = filename.split('.').pop();
        if (ext) safeFilename += `.${ext}`;
    }

    // Truncate to avoid path length limits (safe limit ~150 chars)
    if (safeFilename.length > 150) {
        const parts = safeFilename.split('.');
        const ext = parts.length > 1 ? `.${parts.pop()}` : '';
        safeFilename = parts.join('.').slice(0, 140) + ext;
    }

    // Fallback for empty or invalid names
    if (!safeFilename || safeFilename === '.epub' || safeFilename === '.txt') {
        const timestamp = Date.now();
        const ext = filename.endsWith('.epub') ? '.epub' : '.txt';
        safeFilename = `novtl_export_${timestamp}${ext}`;
    }

    // WEB Browser branch - Execute immediately
    if (!isElectron() && !isCapacitorNative()) {
        try {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = safeFilename;
            document.body.appendChild(link);
            link.click();
            
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 15000); 
            return;
        } catch (e) {
            console.error("Web Download Error:", e);
            alert("Gagal memicu download di browser.");
            return;
        }
    }

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    
    reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        
        if (isElectron()) {
            try {
                const res = await window.novtlAPI!.saveToDownloads(safeFilename, base64data);
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
            try {
                // Get settings to check preference
                const { getSettings } = await import('./storage');
                const settings = await getSettings();
                
                let directory = Directory.ExternalStorage;
                let folderPath = 'Download/NovTL';

                if (settings.storagePreference === 'documents') {
                    directory = Directory.Documents;
                    folderPath = 'NovTL';
                }

                const exportPath = `${folderPath}/${safeFilename}`; 
                
                await Filesystem.writeFile({
                    path: exportPath,
                    data: base64data,
                    directory: directory,
                    recursive: true
                });
                
                alert(`✅ BERHASIL!\n\n📂 File disimpan di:\n${settings.storagePreference === 'documents' ? 'Internal/Documents' : 'Internal/Download'}/NovTL/${safeFilename}`);

            } catch (e: any) {
                console.warn("Download failed", e);
                alert(`❌ Gagal menyimpan file: ${e.message}\n\nPastikan izin penyimpanan sudah diberikan di pengaturan HP.`);
            }
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

            // Init Folder Kerja (Private/App Scope) di Documents
            // JANGAN MEMBUAT FOLDER DI EXTERNAL STORAGE SAAT INIT untuk menghindari permission error
            await Filesystem.mkdir({ path: 'NovTL', directory: Directory.Documents, recursive: true });
        } catch (e) {
            console.warn("Init FS Warning:", e);
        }
    }
};
