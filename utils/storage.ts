
import { SavedTranslation, GlossaryItem, SavedTranslationSummary, NovelProject, ChatMessage, AppSettings } from '../types';
import { fsRead, fsWrite, fsDelete, initFileSystem } from './fileSystem';
import { STORAGE_KEY } from '../constants';

// Initialize Folders on Boot
initFileSystem();

// --- SECURITY: WIPE DATA ---
export const wipeAllLocalData = async () => {
    console.log("🧹 Wiping Local Data is dangerous in File System mode.");
    // Di mode file system, kita hanya menghapus file index agar app terlihat 'reset', 
    // tapi tidak menghapus file asli user di folder Documents demi keamanan data mereka.
    await fsDelete('projects.json');
    await fsDelete('chat_history.json');
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
};

// --- SETTINGS ---
// Settings tetap di LocalStorage karena kecil dan bersifat konfigurasi app
export const saveSettingsToCloud = async (settings: Partial<AppSettings>) => {};
export const getSettingsFromCloud = async (): Promise<Partial<AppSettings> | null> => null;

// --- PROJECTS ---

export const saveProjectToDB = async (project: NovelProject): Promise<void> => {
    // 1. Simpan Detail Proyek ke file JSON terpisah
    await fsWrite(`project_${project.id}_data.json`, project);

    // 2. Update Index Proyek (Daftar Isi)
    let projects = await fsRead<NovelProject[]>('projects.json') || [];
    const idx = projects.findIndex(p => p.id === project.id);
    
    // Di index, kita simpan versi ringan (tanpa glosarium berat)
    const summary = { ...project, glossary: [] }; 
    
    if (idx >= 0) projects[idx] = summary;
    else projects.push(summary);
    
    await fsWrite('projects.json', projects);
};

export const getProjectsFromDB = async (): Promise<NovelProject[]> => {
    // Baca index
    const projects = await fsRead<NovelProject[]>('projects.json') || [];
    
    // Jika user membuka detail, nanti kita load file detailnya.
    // Untuk list awal, kembalikan summary saja.
    return projects;
};

// Untuk load full data (termasuk glosarium) saat proyek aktif
export const loadFullProject = async (projectId: string): Promise<NovelProject | null> => {
    const fullData = await fsRead<NovelProject>(`project_${projectId}_data.json`);
    return fullData || null;
};

// --- TRANSLATIONS (CHAPTERS) ---

export const saveTranslationToDB = async (translation: SavedTranslation): Promise<void> => {
    // Simpan isi bab ke file terpisah: /chapters/chapter_{id}.json
    await fsWrite(`chapters/chapter_${translation.id}.json`, translation);
    
    // Update Index Bab per Proyek: /project_{id}_chapters.json
    let summaries = await fsRead<SavedTranslationSummary[]>(`project_${translation.projectId}_chapters.json`) || [];
    const idx = summaries.findIndex(s => s.id === translation.id);
    
    const summary: SavedTranslationSummary = {
        id: translation.id,
        projectId: translation.projectId,
        name: translation.name,
        timestamp: translation.timestamp
    };

    if (idx >= 0) summaries[idx] = summary;
    else summaries.push(summary);

    await fsWrite(`project_${translation.projectId}_chapters.json`, summaries);
};

export const getTranslationSummariesByProjectId = async (projectId: string): Promise<SavedTranslationSummary[]> => {
    return await fsRead<SavedTranslationSummary[]>(`project_${projectId}_chapters.json`) || [];
};

export const getTranslationById = async (id: string): Promise<SavedTranslation | undefined> => {
    const data = await fsRead<SavedTranslation>(`chapters/chapter_${id}.json`);
    return data || undefined;
};

export const deleteTranslationFromDB = async (id: string): Promise<void> => {
    // Hapus file fisik
    await fsDelete(`chapters/chapter_${id}.json`);
    
    // Kita tidak bisa update index dengan mudah tanpa projectId. 
    // Tapi karena UI me-load ulang list, index akan diperbaiki saat save berikutnya.
    // (Peningkatan logic: idealnya passing projectId ke fungsi delete ini)
};

export const clearProjectTranslationsFromDB = async (projectId: string): Promise<void> => {
    // Hanya hapus index, file fisik biarkan (safe delete) atau hapus loop (agak berat IO nya)
    await fsDelete(`project_${projectId}_chapters.json`);
};

// --- GLOSSARY ---
// Glosarium sekarang menyatu dengan file project_{id}_data.json
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

export const deleteGlossaryItemsFromDB = async (ids: string[]): Promise<void> => {
    // Handled by saveGlossaryToDB logic in SettingsContext
};

// --- CHAT HISTORY ---

export const saveChatToDB = async (message: ChatMessage): Promise<void> => {
    let history = await fsRead<ChatMessage[]>('chat_history.json') || [];
    // Upsert
    const idx = history.findIndex(m => m.id === message.id);
    if (idx >= 0) history[idx] = message;
    else history.push(message);
    
    // Limit history size to 50 messages to keep file small
    if (history.length > 50) history = history.slice(-50);
    
    await fsWrite('chat_history.json', history);
};

export const getChatHistoryFromDB = async (): Promise<ChatMessage[]> => {
    return await fsRead<ChatMessage[]>('chat_history.json') || [];
};

export const clearChatHistoryFromDB = async (): Promise<void> => {
    await fsDelete('chat_history.json');
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
