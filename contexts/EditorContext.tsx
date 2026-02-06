
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { EditorContextType, EpubChapter } from '../types';
import { putItem, getItem } from '../utils/idb';

interface ExtendedEditorContextType extends EditorContextType {
  epubChapters: EpubChapter[];
  setEpubChapters: (chapters: EpubChapter[]) => void;
  activeChapterId: string | null;
  setActiveChapterId: (id: string | null) => void;
  scrollPosition: number;
  setScrollPosition: (pos: number) => void;
  isEpubLoaded: boolean;
}

const EditorContext = createContext<ExtendedEditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // INIT STATE DARI LOCAL STORAGE AGAR TIDAK HILANG SAAT REFRESH/HP MATI
  const [sourceText, setSourceText] = useState(() => localStorage.getItem('novtl_editor_source') || '');
  const [translatedText, setTranslatedText] = useState(() => localStorage.getItem('novtl_editor_target') || '');
  
  const [epubChapters, setEpubChapters] = useState<EpubChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Auto-Save Source Text saat berubah
  useEffect(() => {
      localStorage.setItem('novtl_editor_source', sourceText);
  }, [sourceText]);

  // Auto-Save Translated Text saat berubah
  useEffect(() => {
      localStorage.setItem('novtl_editor_target', translatedText);
  }, [translatedText]);

  // Load persistent EPUB metadata on start
  useEffect(() => {
    const loadState = async () => {
      const savedMetadata = await getItem('app_state', 'active_epub_metadata');
      if (savedMetadata) {
        setEpubChapters(savedMetadata.chapters);
        setActiveChapterId(savedMetadata.activeChapterId);
      }
    };
    loadState();
  }, []);

  // Save metadata whenever it changes
  useEffect(() => {
    if (epubChapters.length > 0) {
      putItem('app_state', { 
        id: 'active_epub_metadata', 
        chapters: epubChapters, 
        activeChapterId 
      });
    }
  }, [epubChapters, activeChapterId]);

  return (
    <EditorContext.Provider value={{ 
      sourceText, setSourceText, 
      translatedText, setTranslatedText,
      epubChapters, setEpubChapters,
      activeChapterId, setActiveChapterId,
      scrollPosition, setScrollPosition,
      isEpubLoaded: epubChapters.length > 0
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
