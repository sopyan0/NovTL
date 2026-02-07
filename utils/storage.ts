
import { SavedTranslation, GlossaryItem, SavedTranslationSummary, NovelProject, ChatMessage, AppSettings } from '../types';
import { dbService } from '../services/DatabaseService';
import { initFileSystem } from './fileSystem';
import { STORAGE_KEY } from '../constants';

// Initialize Systems
initFileSystem();
dbService.init().catch(console.error);

// --- SECURITY: WIPE DATA ---
export const wipeAllLocalData = async () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
};

// --- PROJECTS ---

export const saveProjectToDB = async (project: NovelProject): Promise<void> => {
    await dbService.saveProject(project);
};

export const getProjectsFromDB = async (): Promise<NovelProject[]> => {
    return await dbService.getProjects();
};

export const loadFullProject = async (projectId: string): Promise<NovelProject | null> => {
    const projects = await dbService.getProjects();
    return projects.find(p => p.id === projectId) || null;
};

// --- TRANSLATIONS (CHAPTERS) ---

export const saveTranslationToDB = async (translation: SavedTranslation): Promise<void> => {
    await dbService.saveChapter(translation);
};

export const getTranslationSummariesByProjectId = async (projectId: string): Promise<SavedTranslationSummary[]> => {
    return await dbService.getChapterSummaries(projectId);
};

export const getTranslationById = async (id: string): Promise<SavedTranslation | undefined> => {
    return await dbService.getChapterById(id);
};

// NEW: Search function for AI
export const searchTranslations = async (projectId: string, query: string): Promise<SavedTranslation[]> => {
    return await dbService.searchChaptersContent(projectId, query);
};

// NEW: Context Fetcher (Mengambil akhir bab terakhir untuk konteks AI)
export const getPreviousChapterContext = async (projectId: string): Promise<string> => {
    try {
        // Ambil daftar bab, urutkan dari yang terbaru (timestamp DESC)
        const summaries = await dbService.getChapterSummaries(projectId);
        if (summaries.length === 0) return "";

        // Ambil bab paling baru yang tersimpan
        const lastChapterId = summaries[0].id;
        const fullChapter = await dbService.getChapterById(lastChapterId);

        if (!fullChapter || !fullChapter.translatedText) return "";

        // Ambil 1000 karakter terakhir untuk memberi konteks ke AI
        // (Agar AI tahu adegan terakhir berhenti di mana)
        const text = fullChapter.translatedText;
        return text.length > 1500 ? "..." + text.slice(-1500) : text;
    } catch (e) {
        console.warn("Gagal mengambil konteks bab sebelumnya:", e);
        return "";
    }
};

export const deleteTranslationFromDB = async (id: string): Promise<void> => {
    await dbService.deleteChapter(id);
};

export const clearProjectTranslationsFromDB = async (projectId: string): Promise<void> => {
    await dbService.clearProjectChapters(projectId);
};

// --- GLOSSARY ---

export const saveGlossaryToDB = async (projectId: string, glossary: GlossaryItem[]): Promise<void> => {
    const project = await loadFullProject(projectId);
    if (project) {
        project.glossary = glossary;
        await saveProjectToDB(project);
    }
};

export const getGlossaryByProjectId = async (projectId: string): Promise<GlossaryItem[]> => {
    const project = await loadFullProject(projectId);
    return project?.glossary || [];
};

// --- CHAT HISTORY ---

export const saveChatToDB = async (message: ChatMessage): Promise<void> => {
    await dbService.saveChat(message);
};

export const getChatHistoryFromDB = async (): Promise<ChatMessage[]> => {
    return await dbService.getChatHistory();
};

export const clearChatHistoryFromDB = async (): Promise<void> => {
    await dbService.clearChat();
};

// --- HELPERS ---

export const getTranslationsByIds = async (ids: string[]): Promise<SavedTranslation[]> => {
    const results: SavedTranslation[] = [];
    for (const id of ids) {
        const item = await getTranslationById(id);
        if (item) results.push(item);
    }
    return results;
};

export const getTranslationsByProjectId = async (projectId: string): Promise<SavedTranslation[]> => {
    const summaries = await getTranslationSummariesByProjectId(projectId);
    const ids = summaries.map(s => s.id);
    return await getTranslationsByIds(ids);
};

export const countTranslationsByProjectId = async (projectId: string): Promise<number> => {
    const summaries = await getTranslationSummariesByProjectId(projectId);
    return summaries.length;
};
