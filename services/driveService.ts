
import { supabase } from '../utils/supabaseClient';

/**
 * Google Drive Service
 * Menangani upload dan download file teks menggunakan Access Token dari login Supabase.
 * Dilengkapi dengan Auto-Refresh Token via Vercel API Route dengan proteksi Race Condition.
 */

const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const API_URL = 'https://www.googleapis.com/drive/v3/files';

// --- SINGLETON PROMISE STATE ---
// Variabel ini hidup di luar fungsi agar bisa diakses semua request yang berjalan paralel.
let globalRefreshPromise: Promise<string> | null = null;

/**
 * Helper: Melakukan panggilan fisik ke API Vercel untuk refresh token.
 */
const performTokenRefresh = async (): Promise<string> => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("No active app session");

        const res = await fetch('/api/refresh-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || "Failed to refresh token via API");
        }

        const data = await res.json();
        console.log("✅ Token Refreshed Successfully via Singleton!");
        return data.access_token;
    } catch (error) {
        console.error("❌ Singleton Refresh failed:", error);
        throw error;
    }
};

/**
 * Helper: Melakukan fetch dengan mekanisme retry otomatis yang AMAN dari Race Condition.
 */
const fetchWithRetry = async (url: string, options: RequestInit, originalToken: string | null): Promise<Response> => {
    let response: Response | undefined;

    // 1. Percobaan Pertama (Hanya jika token awal ada)
    if (originalToken) {
        response = await fetch(url, options);
    }

    // 2. Jika Token Kosong ATAU Response 401 (Unauthorized)
    if (!originalToken || (response && response.status === 401)) {
        console.warn("🔄 Drive Token Issue (401/Missing). Checking for refresh lock...");
        
        try {
            // --- CRITICAL FIX: THUNDERING HERD PROTECTION ---
            // Jika belum ada proses refresh yang berjalan, buat promise baru.
            // Jika SUDAH ada (globalRefreshPromise != null), request ini akan ikut menunggu promise yang sama.
            if (!globalRefreshPromise) {
                console.log("⚡ Initiating NEW refresh process...");
                globalRefreshPromise = performTokenRefresh().finally(() => {
                    // Reset variable setelah selesai (sukses/gagal) agar request 401 di masa depan bisa memicu refresh baru.
                    // Delay sedikit untuk memastikan semua antrean 'await' tereksekusi.
                    setTimeout(() => { globalRefreshPromise = null; }, 1000);
                });
            } else {
                console.log("⏳ Queuing request: Waiting for existing refresh process...");
            }

            // Tunggu hasil refresh (baik dia yang memulai atau cuma 'nebeng')
            const newToken = await globalRefreshPromise;

            // Update Header dengan Token Baru
            const newHeaders = new Headers(options.headers);
            newHeaders.set('Authorization', `Bearer ${newToken}`);

            // Ulangi Request dengan token baru
            response = await fetch(url, {
                ...options,
                headers: newHeaders
            });

        } catch (refreshError) {
            // Jika refresh gagal total, kembalikan response error asli (401) agar UI bisa handle (logout)
            // Atau throw error jika dari awal tidak ada response
            if (response) return response;
            throw new Error("Authentication failed: No token and refresh failed.");
        }
    }

    if (!response) throw new Error("Network Error: No response received");
    return response;
};

export const uploadToDrive = async (accessToken: string | null, filename: string, content: string): Promise<string> => {
    const metadata = {
        name: filename,
        mimeType: 'text/plain',
    };

    const fileContent = new Blob([content], { type: 'text/plain' });
    const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });

    const form = new FormData();
    form.append('metadata', metadataBlob);
    form.append('file', fileContent);

    const response = await fetchWithRetry(UPLOAD_URL, {
        method: 'POST',
        headers: {
            'Authorization': accessToken ? `Bearer ${accessToken}` : '',
        },
        body: form
    }, accessToken);

    if (response.status === 401) {
        throw new Error("TOKEN_EXPIRED");
    }

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Drive Upload Error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.id; 
};

export const downloadFromDrive = async (accessToken: string | null, fileId: string): Promise<string> => {
    const response = await fetchWithRetry(`${API_URL}/${fileId}?alt=media`, {
        method: 'GET',
        headers: {
            'Authorization': accessToken ? `Bearer ${accessToken}` : '',
        }
    }, accessToken);

    if (response.status === 401) {
        throw new Error("TOKEN_EXPIRED");
    }

    if (!response.ok) {
        throw new Error(`Drive Download Error: ${response.statusText}`);
    }

    return await response.text();
};

export const updateDriveFile = async (accessToken: string | null, fileId: string, content: string): Promise<void> => {
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    
    const response = await fetchWithRetry(updateUrl, {
        method: 'PATCH',
        headers: {
            'Authorization': accessToken ? `Bearer ${accessToken}` : '',
            'Content-Type': 'text/plain'
        },
        body: content
    }, accessToken);

    if (response.status === 401) {
        throw new Error("TOKEN_EXPIRED");
    }

    if (!response.ok) {
        throw new Error("Failed to update Drive file");
    }
};

export const deleteFromDrive = async (accessToken: string | null, fileId: string): Promise<void> => {
    const response = await fetchWithRetry(`${API_URL}/${fileId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': accessToken ? `Bearer ${accessToken}` : '',
        }
    }, accessToken);

    if (response.status === 401) {
        throw new Error("TOKEN_EXPIRED");
    }

    if (!response.ok) {
        throw new Error("Failed to delete Drive file");
    }
};
