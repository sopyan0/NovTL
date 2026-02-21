
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
        const result = await FilePicker.pickDirectory();
        return result.path || null;
    } catch (e) {
        console.error("Pick Directory Error:", e);
        return null;
    }
};

export const triggerDownload = async (filename: string, blob: Blob) => {
    // 1. ROBUST SANITIZATION (Point 4)
    // Remove forbidden characters: < > : " / \ | ? *
    let safeFilename = filename
        .replace(/[<>:"/\\|?*]/g, '_') 
        .replace(/[\x00-\x1F\x7F]/g, '') // Control characters
        .replace(/^\.+/, '') // No leading dots
        .replace(/[ .]+$/, '') // No trailing spaces or dots
        .trim();

    // Ensure extension is preserved
    const ext = filename.includes('.') ? `.${filename.split('.').pop()}` : '';
    if (!safeFilename.endsWith(ext) && ext !== '.') {
        safeFilename += ext;
    }

    // Truncate to avoid path length limits (safe limit ~150 chars)
    if (safeFilename.length > 150) {
        const namePart = safeFilename.replace(ext, '');
        safeFilename = namePart.slice(0, 140) + ext;
    }

    // Fallback for empty or invalid names
    if (!safeFilename || safeFilename === '.epub' || safeFilename === '.txt') {
        safeFilename = `novtl_export_${Date.now()}${ext || '.txt'}`;
    }

    // 2. WEB FALLBACK (Point 5)
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
        // 3. CAPACITOR EXPORT (Point 2)
        else if (isCapacitorNative()) {
            try {
                const { getSettings } = await import('./storage');
                const settings = await getSettings();
                
                let directory = Directory.ExternalStorage;
                let folderPath = 'Download/NovTL';

                // Handle SAF / Custom Directory
                if (settings.storagePreference === 'saf' && settings.safTreeUri) {
                    // Note: On Android 11+, writing to a SAF URI requires a specific plugin.
                    // If the user's workflow installs @capawesome/capacitor-file-picker,
                    // we assume they have a way to write or that the path is bridged.
                    // For now, we try to write to the path returned by the picker.
                    try {
                        await Filesystem.writeFile({
                            path: `${settings.safTreeUri}/${safeFilename}`,
                            data: base64data,
                            // When using a full path from SAF, we might not need a directory constant
                            // but Capacitor Filesystem usually requires one. 
                            // This is a limitation of the standard plugin.
                            recursive: true
                        });
                        alert(`✅ BERHASIL!\n\n📂 File disimpan di folder pilihan Anda:\n${safeFilename}`);
                        return;
                    } catch (safErr) {
                        console.warn("SAF Write failed, falling back to Share", safErr);
                        // Fallback to Share if SAF write fails
                        await Share.share({
                            title: safeFilename,
                            url: (await Filesystem.writeFile({
                                path: `temp_${safeFilename}`,
                                data: base64data,
                                directory: Directory.Cache
                            })).uri
                        });
                        return;
                    }
                }

                if (settings.storagePreference === 'documents') {
                    directory = Directory.Documents;
                    folderPath = 'NovTL';
                }

                const exportPath = `${folderPath}/${safeFilename}`; 
                
                // Note: writeFile with recursive: true handles folder creation (Point 3)
                await Filesystem.writeFile({
                    path: exportPath,
                    data: base64data,
                    directory: directory,
                    recursive: true
                });
                
                const locationName = settings.storagePreference === 'documents' ? 'Documents' : 'Download';
                alert(`✅ BERHASIL!\n\n📂 File disimpan di:\n${locationName}/NovTL/${safeFilename}`);

            } catch (e: any) {
                console.warn("Download failed", e);
                const msg = e.message?.toLowerCase().includes('permission') 
                    ? "Gagal akses folder. Coba ganti lokasi simpan ke 'Documents' atau gunakan 'Pilih Folder' di Pengaturan."
                    : `Gagal menyimpan file: ${e.message}`;
                alert(`❌ ${msg}`);
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

            // Init Folder Kerja (Private/App Scope) di Documents (Point 3)
            // JANGAN MEMBUAT FOLDER DI EXTERNAL STORAGE SAAT INIT
            await Filesystem.mkdir({ path: 'NovTL', directory: Directory.Documents, recursive: true });
        } catch (e) {
            console.warn("Init FS Warning:", e);
        }
    }
};
