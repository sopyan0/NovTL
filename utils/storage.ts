
import { SavedTranslation, GlossaryItem, SavedTranslationSummary, NovelProject, ChatMessage, AppSettings } from '../types';
import { dbService } from '../services/DatabaseService';
import { initFileSystem } from './fileSystem';
import { STORAGE_KEY } from '../constants';

// --- INITIALIZATION GUARD (FIX RACE CONDITION) ---
let isDbReady = false;
let initPromise: Promise<void> | null = null;

export const ensureDbReady = async () => {
    if (isDbReady) return;
    
    // Cegah inisialisasi ganda
    if (!initPromise) {
        initPromise = (async () => {
            try {
                // Set timeout 10 detik agar tidak stuck selamanya (terutama di Android jika permission error)
                const timeout = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Database Initialization Timed Out (10s)")), 10000)
                );

                console.log("Starting System Init...");
                
                await Promise.race([
                    (async () => {
                        await initFileSystem();
                        await dbService.init();
                    })(),
                    timeout
                ]);

                isDbReady = true;
                console.log("✅ Database & FileSystem Ready!");
            } catch (err) {
                console.error("❌ Critical System Init Failed:", err);
                throw err;
            }
        })();
    }
    
    await initPromise;
};

// Trigger init segera (tapi jangan ditunggu di top-level)
ensureDbReady().catch(console.error);

// --- SECURITY: WIPE DATA (SQLITE + LOCALSTORAGE) ---
export const wipeAllLocalData = async () => {
    try {
        console.log("Initiating full wipe...");
        
        // 1. Pastikan DB siap (opsional, untuk memastikan instance sqlite ada)
        try { await ensureDbReady(); } catch(e) {}
        
        // 2. Hapus database (Native/Electron)
        await dbService.wipeAllData();
        
        // 3. Hapus LocalStorage
        localStorage.clear();
        
        console.log("System wipe complete. Reloading...");
        
        // 4. Reload aplikasi untuk reset state total
        window.location.reload();
    } catch (err) {
        console.error("Failed to wipe data cleanly:", err);
        // Fallback tetap reload jika gagal
        localStorage.clear();
        window.location.reload();
    }
};

// --- PROJECTS ---

export const saveProjectToDB = async (project: NovelProject): Promise<void> => {
    await ensureDbReady();
    await dbService.saveProject(project);
};

export const getProjectsFromDB = async (): Promise<NovelProject[]> => {
    await ensureDbReady();
    return await dbService.getProjects();
};

export const loadFullProject = async (projectId: string): Promise<NovelProject | null> => {
    await ensureDbReady();
    const projects = await dbService.getProjects();
    return projects.find(p => p.id === projectId) || null;
};

// --- TRANSLATIONS (CHAPTERS) ---

export const saveTranslationToDB = async (translation: SavedTranslation): Promise<void> => {
    await ensureDbReady();
    await dbService.saveChapter(translation);
};

export const getTranslationSummariesByProjectId = async (projectId: string): Promise<SavedTranslationSummary[]> => {
    await ensureDbReady();
    return await dbService.getChapterSummaries(projectId);
};

export const getTranslationById = async (id: string): Promise<SavedTranslation | undefined> => {
    await ensureDbReady();
    return await dbService.getChapterById(id);
};

// NEW: Search function for AI
export const searchTranslations = async (projectId: string, query: string): Promise<SavedTranslation[]> => {
    await ensureDbReady();
    return await dbService.searchChaptersContent(projectId, query);
};

// NEW: Context Fetcher
export const getPreviousChapterContext = async (projectId: string): Promise<string> => {
    await ensureDbReady();
    try {
        const summaries = await dbService.getChapterSummaries(projectId);
        if (summaries.length === 0) return "";

        const lastChapterId = summaries[0].id;
        const fullChapter = await dbService.getChapterById(lastChapterId);

        if (!fullChapter || !fullChapter.translatedText) return "";

        const text = fullChapter.translatedText;
        return text.length > 1500 ? "..." + text.slice(-1500) : text;
    } catch (e) {
        console.warn("Gagal mengambil konteks bab sebelumnya:", e);
        return "";
    }
};

export const deleteTranslationFromDB = async (id: string): Promise<void> => {
    await ensureDbReady();
    await dbService.deleteChapter(id);
};

export const clearProjectTranslationsFromDB = async (projectId: string): Promise<void> => {
    await ensureDbReady();
    await dbService.clearProjectChapters(projectId);
};

// --- GLOSSARY ---

export const saveGlossaryToDB = async (projectId: string, glossary: GlossaryItem[]): Promise<void> => {
    await ensureDbReady();
    const project = await loadFullProject(projectId);
    if (project) {
        project.glossary = glossary;
        await saveProjectToDB(project);
    }
};

export const getGlossaryByProjectId = async (projectId: string): Promise<GlossaryItem[]> => {
    await ensureDbReady();
    const project = await loadFullProject(projectId);
    return project?.glossary || [];
};

// --- CHAT HISTORY ---

export const saveChatToDB = async (message: ChatMessage): Promise<void> => {
    await ensureDbReady();
    await dbService.saveChat(message);
};

export const getChatHistoryFromDB = async (): Promise<ChatMessage[]> => {
    await ensureDbReady();
    return await dbService.getChatHistory();
};

export const clearChatHistoryFromDB = async (): Promise<void> => {
    await ensureDbReady();
    await dbService.clearChat();
};

// --- HELPERS ---

export const getTranslationsByIds = async (ids: string[]): Promise<SavedTranslation[]> => {
    await ensureDbReady();
    const results: SavedTranslation[] = [];
    for (const id of ids) {
        const item = await getTranslationById(id);
        if (item) results.push(item);
    }
    return results;
};

export const getTranslationsByProjectId = async (projectId: string): Promise<SavedTranslation[]> => {
    await ensureDbReady();
    const summaries = await getTranslationSummariesByProjectId(projectId);
    const ids = summaries.map(s => s.id);
    return await getTranslationsByIds(ids);
};

export const countTranslationsByProjectId = async (projectId: string): Promise<number> => {
    await ensureDbReady();
    const summaries = await getTranslationSummariesByProjectId(projectId);
    return summaries.length;
};
