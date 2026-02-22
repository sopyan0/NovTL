
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
import { FilePicker } from '@capawesome/capacitor-file-picker';

export const pickExportDirectory = async (): Promise<string | null> => {
    if (!isCapacitorNative()) return null;
    try {
        console.log("Opening Directory Picker...");
        const result = await (FilePicker as any).pickDirectory();
        console.log("Picker Result:", result);
        return result.path || null;
    } catch (e: any) {
        console.error("Pick Directory Error:", e);
        alert(`Gagal membuka pemilih folder: ${e.message || 'Unknown Error'}`);
        return null;
    }
};

export const triggerDownload = async (filename: string, blob: Blob) => {
    // 1. ROBUST SANITIZATION (Point 4)
    let safeFilename = filename
        .replace(/[<>:"/\\|?*]/g, '_') 
        .replace(/[\x00-\x1F\x7F]/g, '') 
        .replace(/^\.+/, '') 
        .replace(/[ .]+$/, '') 
        .trim();

    const ext = filename.includes('.') ? `.${filename.split('.').pop()}` : '';
    if (!safeFilename.endsWith(ext) && ext !== '.') {
        safeFilename += ext;
    }

    if (safeFilename.length > 150) {
        const namePart = safeFilename.replace(ext, '');
        safeFilename = namePart.slice(0, 140) + ext;
    }

    if (!safeFilename || safeFilename === '.epub' || safeFilename === '.txt') {
        safeFilename = `novtl_export_${Date.now()}${ext || '.txt'}`;
    }

    // 2. WEB FALLBACK
    if (!isElectron() && !isCapacitorNative()) {
        try {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = safeFilename;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 15000); 
            return;
        } catch (e) {
            alert("Gagal memicu download di browser.");
            return;
        }
    }

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    
    reader.onloadend = async () => {
        const result = reader.result as string;
        if (!result || !result.includes(',')) {
            alert("❌ Gagal memproses data file (Base64 error).");
            return;
        }
        const base64data = result.split(',')[1];
        
        if (isElectron()) {
            try {
                const res = await window.novtlAPI!.saveToDownloads(safeFilename, base64data);
                if (res.success) {
                    alert(`✅ File berhasil didownload!\n\n📂 Lokasi: ${res.path}`);
                } else {
                    alert(`❌ Gagal menyimpan: ${res.error}`);
                }
            } catch (e: any) {
                alert(`❌ Error Desktop: ${e.message}`);
            }
        } 
        else if (isCapacitorNative()) {
            try {
                const { getSettings } = await import('./storage');
                const settings = await getSettings();
                
                // --- STRATEGY: TRY DIRECT WRITE, FALLBACK TO SHARE ---
                let directory = Directory.ExternalStorage;
                let folderPath = 'Download/NovTL';

                if (settings.storagePreference === 'documents') {
                    directory = Directory.Documents;
                    folderPath = 'NovTL';
                }

                // SAF Handling
                if (settings.storagePreference === 'saf' && settings.safTreeUri) {
                    // Standard Filesystem plugin doesn't support SAF URIs well for writing
                    // We force Share fallback for SAF to ensure it works
                    throw new Error("SAF_REDIRECT_TO_SHARE"); 
                }

                const exportPath = `${folderPath}/${safeFilename}`; 
                
                await Filesystem.writeFile({
                    path: exportPath,
                    data: base64data,
                    directory: directory,
                    recursive: true
                });
                
                const locationName = settings.storagePreference === 'documents' ? 'Documents' : 'Download';
                alert(`✅ BERHASIL!\n\n📂 File disimpan di:\n${locationName}/NovTL/${safeFilename}`);

            } catch (e: any) {
                console.warn("Direct write failed, using Share fallback", e);
                try {
                    // Save to Cache first so we can share the URI
                    const tempPath = `NovTL_Export_${Date.now()}_${safeFilename}`;
                    const writeResult = await Filesystem.writeFile({
                        path: tempPath,
                        data: base64data,
                        directory: Directory.Cache
                    });

                    await Share.share({
                        title: safeFilename,
                        text: `NovTL Export: ${safeFilename}`,
                        url: writeResult.uri,
                        dialogTitle: 'Simpan atau Bagikan File'
                    });
                } catch (shareErr: any) {
                    const errorDetail = e.message === "SAF_REDIRECT_TO_SHARE" ? "" : `\n\nDetail: ${e.message}`;
                    alert(`❌ Gagal menyimpan secara langsung.${errorDetail}\n\nSilakan gunakan menu 'Bagikan' yang muncul setelah ini.`);
                }
            }
        }
    };
};


export const initFileSystem = async () => {
    if (isCapacitorNative()) {
        try {
            // Request multiple permissions for Android 11+
            const perm = await Filesystem.checkPermissions();
            if (perm.publicStorage !== 'granted') {
                await Filesystem.requestPermissions();
            }
            
            // Also check for media permissions if available
            if ((Filesystem as any).requestMediaLibraryPermissions) {
                await (Filesystem as any).requestMediaLibraryPermissions();
            }

            // Init Folder Kerja (Private/App Scope) di Documents (Point 3)
            await Filesystem.mkdir({ path: 'NovTL', directory: Directory.Documents, recursive: true });
        } catch (e) {
            console.warn("Init FS Warning:", e);
        }
    }
};
