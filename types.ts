
export interface GlossaryItem {
  id: string;
  original: string;
  translated: string;
  sourceLanguage: string;
}

export type GlossaryActionType = 'ADD_GLOSSARY' | 'DELETE_GLOSSARY';

export interface AddGlossaryPayload {
  original: string;
  translated: string;
}

export interface DeleteGlossaryPayload {
  original: string;
  translated?: string; // Added for better UI confirmation
}

// Discriminated Union for Pending Actions
export type PendingAction = 
  | { type: 'ADD_GLOSSARY'; payload: AddGlossaryPayload[] }
  | { type: 'DELETE_GLOSSARY'; payload: DeleteGlossaryPayload[] };

export interface ChatMessage {
  id: string;
  role: 'user' | 'model'; // Removed 'tool' until fully supported
  text: string;
  isHidden?: boolean; 
  pendingAction?: PendingAction;
  timestamp: number;
}

export interface SavedTranslation {
  id: string;
  projectId: string; 
  name: string;
  chapterNumber?: number; // NEW: Sequence number
  title?: string; // NEW: Display title
  translatedText: string;
  timestamp: string;
}

// NEW: Lightweight type for list view (No text content)
export type SavedTranslationSummary = Omit<SavedTranslation, 'translatedText'>;

export interface NovelProject {
  id: string;
  name: string; 
  sourceLanguage: string;
  targetLanguage: string;
  translationInstruction: string;
  glossary: GlossaryItem[];
}

export interface AppSettings {
  activeProvider: string;
  apiKeys: Record<string, string>;
  selectedModel: Record<string, string>;
  activeProjectId: string;
  projects: NovelProject[];
  appLanguage: 'id' | 'en'; 
  theme: 'light' | 'dark'; 
  translationMode: 'standard' | 'high_quality'; 
  customModels?: Record<string, string[]>; // NEW: Store user-added models per provider
  version: number; 
}

export interface EditorContextType {
  sourceText: string;
  setSourceText: (text: string) => void;
  translatedText: string;
  setTranslatedText: (text: string) => void;
}

export type Page = 'dashboard' | 'translate' | 'settings' | 'saved-translations';

// Strict Discriminated Union for Assistant Actions
export type AssistantAction = 
  | { type: 'ADD_GLOSSARY'; payload: AddGlossaryPayload[]; message: string }
  | { type: 'DELETE_GLOSSARY'; payload: DeleteGlossaryPayload[]; message: string }
  | { type: 'READ_SAVED_TRANSLATION'; payload: string; message: string } // payload is chapter title
  | { type: 'READ_FULL_EDITOR_AND_REPROCESS'; message: string } // NEW: Trigger full context read
  | { type: 'CLEAR_CHAT'; message: string }
  | { type: 'NONE'; message: string };

// NEW: EPUB Types
export interface EpubChapter {
  id: string;
  title: string;
  href: string;
}
