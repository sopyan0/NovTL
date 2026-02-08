
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { NovelProject, SavedTranslation, SavedTranslationSummary, ChatMessage } from '../types';
import { generateId } from '../utils/id';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    sourceLanguage TEXT,
    targetLanguage TEXT,
    translationInstruction TEXT,
    last_modified INTEGER
);

CREATE TABLE IF NOT EXISTS glossary (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    original TEXT NOT NULL,
    translated TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapter_contents (
    id TEXT PRIMARY KEY NOT NULL,
    chapter_id TEXT NOT NULL,
    line_index INTEGER NOT NULL,
    text_content TEXT,
    FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_history (
    id TEXT PRIMARY KEY NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);
`;

class DatabaseService {
    private sqlite: SQLiteConnection | null = null;
    private db: SQLiteDBConnection | null = null;
    private isNative: boolean = false;
    private dbName: string = 'novtl_db_v2'; 

    constructor() {
        this.isNative = Capacitor.isNativePlatform();
    }

    async init(): Promise<void> {
        if (this.isNative) {
            try {
                this.sqlite = new SQLiteConnection(CapacitorSQLite);
                
                // CRITICAL: Cek koneksi eksisting untuk mencegah error "Connection already open"
                const checkConn = await this.sqlite.checkConnectionsConsistency();
                const isConn = await this.sqlite.isConnection(this.dbName, false);

                if (isConn.result && checkConn.result) {
                    this.db = await this.sqlite.retrieveConnection(this.dbName, false);
                } else {
                    this.db = await this.sqlite.createConnection(this.dbName, false, "no-encryption", 1, false);
                }

                await this.db.open();

                // PERBAIKAN: Hapus WAL Mode yang menyebabkan crash "cannot change into wal mode from within a transaction"
                // Cukup aktifkan Foreign Key saja agar data konsisten.
                await this.db.execute('PRAGMA foreign_keys = ON;');
                
                await this.db.execute(SCHEMA);
                
                await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_contents_chapter_id ON chapter_contents(chapter_id);`);
                
                console.log("🔥 SQLite Native Initialized (Stable Mode)");
            } catch (e) {
                console.error("SQLite Init Error:", e);
                throw e; 
            }
        } else {
            await this.initWebDB();
        }
    }

    // --- WEB/ELECTRON FALLBACK (IndexedDB) ---
    private async initWebDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 6); // Version bumped
            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('chat')) db.createObjectStore('chat', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('glossary')) db.createObjectStore('glossary', { keyPath: 'id' });
            };
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    private async getWebDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 6);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // --- DANGER ZONE: WIPE ALL DATA ---
    async wipeAllData(): Promise<void> {
        if (this.isNative && this.sqlite) {
            try {
                const isConn = await this.sqlite.isConnection(this.dbName, false);
                if (isConn.result) {
                    const connection = await this.sqlite.retrieveConnection(this.dbName, false);
                    await connection.close();
                    await this.sqlite.closeConnection(this.dbName, false);
                }
                await CapacitorSQLite.deleteDatabase({ database: this.dbName });
                console.log("💣 SQLite Database wiped successfully");
            } catch (e) {
                console.error("Error wiping SQLite:", e);
            }
        } else {
            return new Promise((resolve, reject) => {
                const req = indexedDB.deleteDatabase(this.dbName);
                req.onsuccess = () => {
                    console.log("💣 IndexedDB wiped successfully");
                    resolve();
                };
                req.onerror = () => reject(req.error);
                req.onblocked = () => resolve(); 
            });
        }
    }

    // --- CRUD PROJECTS ---
    async saveProject(project: NovelProject): Promise<void> {
        if (this.isNative && this.db) {
            // FIX: Gunakan executeSet (Atomic Transaction) untuk mencegah crash "no transaction active"
            const statements = [
                {
                    statement: `INSERT OR REPLACE INTO projects (id, name, sourceLanguage, targetLanguage, translationInstruction, last_modified) VALUES (?, ?, ?, ?, ?, ?)`,
                    values: [project.id, project.name, project.sourceLanguage, project.targetLanguage, project.translationInstruction, Date.now()]
                },
                {
                    statement: `DELETE FROM glossary WHERE project_id = ?`,
                    values: [project.id]
                }
            ];

            if (project.glossary.length > 0) {
                project.glossary.forEach(item => {
                    statements.push({
                        statement: `INSERT INTO glossary (id, project_id, original, translated) VALUES (?, ?, ?, ?)`,
                        values: [item.id, project.id, item.original, item.translated]
                    });
                });
            }

            await this.db.executeSet(statements);
        } else {
            const db = await this.getWebDB();
            const tx = db.transaction(['projects', 'glossary'], 'readwrite');
            
            tx.objectStore('projects').put(project);
            
            const glosStore = tx.objectStore('glossary');
            project.glossary.forEach(g => glosStore.put({ ...g, project_id: project.id }));
        }
    }

    async getProjects(): Promise<NovelProject[]> {
        if (this.isNative && this.db) {
            // Optimasi N+1 Query
            const projectsRes = await this.db.query(`SELECT * FROM projects ORDER BY last_modified DESC`);
            const projects = projectsRes.values || [];
            
            if (projects.length === 0) return [];

            const glossaryRes = await this.db.query(`SELECT * FROM glossary`);
            const allGlossaries = glossaryRes.values || [];

            return projects.map((p: any) => {
                const projectGlossary = allGlossaries
                    .filter((g: any) => g.project_id === p.id)
                    .map((g: any) => ({
                        id: g.id, 
                        original: g.original, 
                        translated: g.translated, 
                        sourceLanguage: 'auto'
                    }));

                return {
                    id: p.id,
                    name: p.name,
                    sourceLanguage: p.sourceLanguage,
                    targetLanguage: p.targetLanguage,
                    translationInstruction: p.translationInstruction,
                    glossary: projectGlossary
                };
            });
        } else {
            const db = await this.getWebDB();
            return new Promise((resolve) => {
                const req = db.transaction('projects', 'readonly').objectStore('projects').getAll();
                req.onsuccess = () => resolve(req.result || []);
            });
        }
    }

    // --- CRUD CHAPTERS ---
    async saveChapter(chapter: SavedTranslation): Promise<void> {
        if (this.isNative && this.db) {
            // FIX: Gunakan executeSet agar transaksi aman dan tidak tabrakan dengan auto-save
            const statements = [
                {
                    statement: `INSERT OR REPLACE INTO chapters (id, project_id, name, timestamp) VALUES (?, ?, ?, ?)`,
                    values: [chapter.id, chapter.projectId, chapter.name, chapter.timestamp]
                },
                {
                    statement: `DELETE FROM chapter_contents WHERE chapter_id = ?`,
                    values: [chapter.id]
                },
                {
                    statement: `INSERT INTO chapter_contents (id, chapter_id, line_index, text_content) VALUES (?, ?, ?, ?)`,
                    values: [generateId(), chapter.id, 0, chapter.translatedText]
                }
            ];

            await this.db.executeSet(statements);
        } else {
            const db = await this.getWebDB();
            const tx = db.transaction('chapters', 'readwrite');
            tx.objectStore('chapters').put(chapter);
        }
    }

    async getChapterSummaries(projectId: string): Promise<SavedTranslationSummary[]> {
        if (this.isNative && this.db) {
            const res = await this.db.query(`SELECT id, project_id as projectId, name, timestamp FROM chapters WHERE project_id = ? ORDER BY timestamp DESC`, [projectId]);
            return res.values as SavedTranslationSummary[] || [];
        } else {
            const db = await this.getWebDB();
            return new Promise((resolve) => {
                const tx = db.transaction('chapters', 'readonly');
                const req = tx.objectStore('chapters').getAll();
                req.onsuccess = () => {
                    const all = req.result as SavedTranslation[];
                    resolve(all.filter(c => c.projectId === projectId).map(c => ({
                        id: c.id, projectId: c.projectId, name: c.name, timestamp: c.timestamp
                    })));
                };
            });
        }
    }

    async getChapterById(id: string): Promise<SavedTranslation | undefined> {
        if (this.isNative && this.db) {
            const resMeta = await this.db.query(`SELECT * FROM chapters WHERE id = ?`, [id]);
            if (!resMeta.values || resMeta.values.length === 0) return undefined;
            const meta = resMeta.values[0];

            const resContent = await this.db.query(`SELECT text_content FROM chapter_contents WHERE chapter_id = ? ORDER BY line_index ASC`, [id]);
            const fullText = (resContent.values || []).map((row: any) => row.text_content).join('\n');

            return {
                id: meta.id, projectId: meta.project_id, name: meta.name, translatedText: fullText, timestamp: meta.timestamp
            };
        } else {
            const db = await this.getWebDB();
            return new Promise((resolve) => {
                const req = db.transaction('chapters', 'readonly').objectStore('chapters').get(id);
                req.onsuccess = () => resolve(req.result);
            });
        }
    }

    async searchChaptersContent(projectId: string, query: string): Promise<SavedTranslation[]> {
        if (this.isNative && this.db) {
            const sql = `
                SELECT DISTINCT c.id 
                FROM chapter_contents cc
                JOIN chapters c ON c.id = cc.chapter_id
                WHERE c.project_id = ? AND cc.text_content LIKE ?
                LIMIT 5
            `;
            const res = await this.db.query(sql, [projectId, `%${query}%`]);
            
            const results: SavedTranslation[] = [];
            for (const row of res.values || []) {
                const fullData = await this.getChapterById(row.id);
                if (fullData) results.push(fullData);
            }
            return results;
        } else {
            const db = await this.getWebDB();
            return new Promise((resolve) => {
                const req = db.transaction('chapters', 'readonly').objectStore('chapters').getAll();
                req.onsuccess = () => {
                    const all = req.result as SavedTranslation[];
                    const matches = all
                        .filter(c => c.projectId === projectId && c.translatedText.toLowerCase().includes(query.toLowerCase()))
                        .slice(0, 5);
                    resolve(matches);
                };
            });
        }
    }

    async deleteChapter(id: string): Promise<void> {
        if (this.isNative && this.db) {
            await this.db.run(`DELETE FROM chapters WHERE id = ?`, [id]);
        } else {
            const db = await this.getWebDB();
            const tx = db.transaction('chapters', 'readwrite');
            tx.objectStore('chapters').delete(id);
        }
    }

    async clearProjectChapters(projectId: string): Promise<void> {
        if (this.isNative && this.db) {
            await this.db.run(`DELETE FROM chapters WHERE project_id = ?`, [projectId]);
        } else {
             const db = await this.getWebDB();
             const tx = db.transaction('chapters', 'readwrite');
             const store = tx.objectStore('chapters');
             const req = store.openCursor();
             req.onsuccess = (e: any) => {
                 const cursor = e.target.result;
                 if (cursor) {
                     if (cursor.value.projectId === projectId) cursor.delete();
                     cursor.continue();
                 }
             };
        }
    }

    async saveChat(message: ChatMessage): Promise<void> {
        if (this.isNative && this.db) {
            const text = JSON.stringify(message);
            await this.db.run(`INSERT OR REPLACE INTO chat_history (id, role, text, timestamp) VALUES (?, ?, ?, ?)`, 
                [message.id, message.role, text, message.timestamp]);
        } else {
            const db = await this.getWebDB();
            db.transaction('chat', 'readwrite').objectStore('chat').put(message);
        }
    }

    async getChatHistory(): Promise<ChatMessage[]> {
        if (this.isNative && this.db) {
            const res = await this.db.query(`SELECT * FROM chat_history ORDER BY timestamp ASC`);
            return (res.values || []).map((row: any) => {
                try {
                    return JSON.parse(row.text);
                } catch {
                    return { id: row.id, role: row.role, text: row.text, timestamp: row.timestamp };
                }
            });
        } else {
            const db = await this.getWebDB();
            return new Promise((resolve) => {
                const req = db.transaction('chat', 'readonly').objectStore('chat').getAll();
                req.onsuccess = () => resolve(req.result || []);
            });
        }
    }

    async clearChat(): Promise<void> {
        if (this.isNative && this.db) {
            await this.db.run(`DELETE FROM chat_history`);
        } else {
            const db = await this.getWebDB();
            db.transaction('chat', 'readwrite').objectStore('chat').clear();
        }
    }
}

export const dbService = new DatabaseService();
