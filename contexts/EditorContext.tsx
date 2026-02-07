
import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { EditorContextType, EpubChapter } from '../types';
import { putItem, getItem, deleteItem } from '../utils/idb';

interface ExtendedEditorContextType extends EditorContextType {
  epubChapters: EpubChapter[];
  setEpubChapters: (chapters: EpubChapter[]) => void;
  activeChapterId: string | null;
  setActiveChapterId: (id: string | null) => void;
  scrollPosition: number;
  setScrollPosition: (pos: number) => void;
  isEpubLoaded: boolean;
  isRestoring: boolean; // Menandakan sedang memuat data dari DB
  saveStatus: 'saved' | 'saving' | 'unsaved'; // Status penyimpanan
}

const EditorContext = createContext<ExtendedEditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State Text
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  
  // State Metadata
  const [epubChapters, setEpubChapters] = useState<EpubChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  
  // State System
  const [isRestoring, setIsRestoring] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  // Ref untuk debounce save
  const sourceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. LOAD DATA DARI INDEXED DB SAAT STARTUP (Gantikan LocalStorage)
  useEffect(() => {
    const restoreSession = async () => {
      setIsRestoring(true);
      try {
        const [savedSource, savedTarget, savedMetadata] = await Promise.all([
          getItem('app_state', 'editor_source_content'),
          getItem('app_state', 'editor_target_content'),
          getItem('app_state', 'active_epub_metadata')
        ]);

        if (savedSource) setSourceText(savedSource.content || '');
        if (savedTarget) setTranslatedText(savedTarget.content || '');
        
        if (savedMetadata) {
          setEpubChapters(savedMetadata.chapters || []);
          setActiveChapterId(savedMetadata.activeChapterId || null);
        }
      } catch (e) {
        console.error("Gagal memulihkan sesi editor:", e);
      } finally {
        setIsRestoring(false);
      }
    };
    restoreSession();
  }, []);

  // 2. AUTO-SAVE SOURCE TEXT KE INDEXED DB (Debounced 1s)
  useEffect(() => {
    if (isRestoring) return; // Jangan save saat sedang loading awal

    setSaveStatus('saving');
    if (sourceTimeoutRef.current) clearTimeout(sourceTimeoutRef.current);

    sourceTimeoutRef.current = setTimeout(async () => {
      try {
        await putItem('app_state', { id: 'editor_source_content', content: sourceText });
        setSaveStatus('saved');
      } catch (e) {
        console.error("Gagal menyimpan source text:", e);
        setSaveStatus('unsaved');
      }
    }, 1000);

    return () => {
      if (sourceTimeoutRef.current) clearTimeout(sourceTimeoutRef.current);
    };
  }, [sourceText, isRestoring]);

  // 3. AUTO-SAVE TRANSLATED TEXT KE INDEXED DB (Debounced 1s)
  useEffect(() => {
    if (isRestoring) return;

    setSaveStatus('saving');
    if (targetTimeoutRef.current) clearTimeout(targetTimeoutRef.current);

    targetTimeoutRef.current = setTimeout(async () => {
      try {
        await putItem('app_state', { id: 'editor_target_content', content: translatedText });
        setSaveStatus('saved');
      } catch (e) {
        console.error("Gagal menyimpan translated text:", e);
        setSaveStatus('unsaved');
      }
    }, 1000);

    return () => {
      if (targetTimeoutRef.current) clearTimeout(targetTimeoutRef.current);
    };
  }, [translatedText, isRestoring]);

  // 4. Save metadata EPUB (Langsung, karena jarang berubah)
  useEffect(() => {
    if (epubChapters.length > 0 && !isRestoring) {
      putItem('app_state', { 
        id: 'active_epub_metadata', 
        chapters: epubChapters, 
        activeChapterId 
      });
    }
  }, [epubChapters, activeChapterId, isRestoring]);

  return (
    <EditorContext.Provider value={{ 
      sourceText, setSourceText, 
      translatedText, setTranslatedText,
      epubChapters, setEpubChapters,
      activeChapterId, setActiveChapterId,
      scrollPosition, setScrollPosition,
      isEpubLoaded: epubChapters.length > 0,
      isRestoring,
      saveStatus
    }}>
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
};
