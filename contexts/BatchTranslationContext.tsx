import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import { useSettings } from './SettingsContext';
import { useLanguage } from './LanguageContext';
import { useEditor } from './EditorContext';
import { translateTextStream, extractGlossaryFromText } from '../services/llmService';
import { saveTranslationToDB, saveProjectToDB, getPreviousChapterContext } from '../utils/storage';
import { generateId } from '../utils/id';
import { SavedTranslation, EpubChapter } from '../types';
import { loadChapterText } from '../utils/epubParser';

interface BatchProgress {
    current: number;
    total: number;
    currentTitle: string;
}

interface BatchContextType {
    isBatchMode: boolean;
    setIsBatchMode: (v: boolean) => void;
    isBatchTranslating: boolean;
    batchProgress: BatchProgress;
    selectedBatchChapters: Set<string>;
    toggleBatchChapter: (id: string) => void;
    setSelectedBatchChapters: (ids: Set<string>) => void;
    isBatchComplete: boolean;
    setIsBatchComplete: (v: boolean) => void;
    batchExtractionResult: {original: string, translated: string, selected: boolean}[];
    setBatchExtractionResult: (v: any[]) => void;
    autoExtractBatch: boolean;
    setAutoExtractBatch: (v: boolean) => void;
    
    // Data Management
    epubChapters: EpubChapter[];
    loadedZip: JSZip | null;
    setLoadedZip: (zip: JSZip | null) => void;
    
    // Actions
    startBatchTranslation: () => Promise<void>;
    stopBatchTranslation: () => void;
    resetBatch: () => void;
    
    // UI State that needs to persist
    isEpubModalOpen: boolean;
    setIsEpubModalOpen: (v: boolean) => void;
}

const BatchTranslationContext = createContext<BatchContextType | undefined>(undefined);

export const BatchTranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { settings } = useSettings();
    const { t } = useLanguage();
    const { epubChapters } = useEditor();
    
    // STATE
    const [isBatchMode, setIsBatchMode] = useState(false);
    const [isBatchTranslating, setIsBatchTranslating] = useState(false);
    const [batchProgress, setBatchProgress] = useState<BatchProgress>({ current: 0, total: 0, currentTitle: '' });
    const [selectedBatchChapters, setSelectedBatchChapters] = useState<Set<string>>(new Set());
    const [isBatchComplete, setIsBatchComplete] = useState(false);
    const [batchExtractionResult, setBatchExtractionResult] = useState<any[]>([]);
    const [autoExtractBatch, setAutoExtractBatch] = useState(false);
    
    const [loadedZip, setLoadedZip] = useState<JSZip | null>(null);
    const [isEpubModalOpen, setIsEpubModalOpen] = useState(false);

    const abortControllerRef = useRef<AbortController | null>(null);

    const activeProjectId = settings.activeProjectId;
    const activeProject = settings.projects.find(p => p.id === activeProjectId);

    const toggleBatchChapter = useCallback((id: string) => {
        setSelectedBatchChapters(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const stopBatchTranslation = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsBatchTranslating(false);
        }
    }, []);

    const resetBatch = useCallback(() => {
        setIsBatchMode(false);
        setIsBatchTranslating(false);
        setIsBatchComplete(false);
        setBatchProgress({ current: 0, total: 0, currentTitle: '' });
        setSelectedBatchChapters(new Set());
        setBatchExtractionResult([]);
        abortControllerRef.current = null;
    }, []);

    const startBatchTranslation = useCallback(async () => {
        if (selectedBatchChapters.size === 0) return;
        
        setIsBatchTranslating(true);
        setIsBatchComplete(false);
        setBatchExtractionResult([]);
        setBatchProgress({ current: 0, total: selectedBatchChapters.size, currentTitle: '' });
        
        abortControllerRef.current = new AbortController();
        const currentSignal = abortControllerRef.current.signal;

        const chaptersToTranslate = epubChapters.filter(c => selectedBatchChapters.has(c.id));
        
        // Sort by index to translate in order
        const sortedChapters = chaptersToTranslate.sort((a, b) => {
            const idxA = epubChapters.findIndex(c => c.id === a.id);
            const idxB = epubChapters.findIndex(c => c.id === b.id);
            return idxA - idxB;
        });

        try {
            let allExtractedTerms: {original: string, translated: string}[] = [];
            
            // Check project validity before starting
            if (!activeProject || !activeProject.id) {
                throw new Error("Project ID invalid. Please refresh the page.");
            }

            for (let i = 0; i < sortedChapters.length; i++) {
                if (currentSignal.aborted) {
                    throw new Error('AbortedByUser');
                }

                const chapter = sortedChapters[i];
                setBatchProgress(prev => ({ ...prev, current: i + 1, currentTitle: chapter.title }));
                
                // 1. Load Text
                let sourceText = "";
                if (loadedZip) {
                    sourceText = await loadChapterText(loadedZip, chapter.href);
                }
                
                if (!sourceText) continue;

                // 2. Translate
                let translatedText = "";
                let batchBuffer = ""; 
                
                const previousContext = await getPreviousChapterContext(activeProject.id);

                await translateTextStream(
                    sourceText, settings, activeProject,
                    (chunk) => { batchBuffer += chunk; },
                    currentSignal,
                    settings.translationMode || 'standard',
                    previousContext,
                    true // isBatch = true
                );
                translatedText = batchBuffer;

                // 3. Save
                const freshId = generateId();
                
                // Improved Chapter Number Parsing
                let chapterNum = 0;
                const titleLower = chapter.title.toLowerCase();
                const explicitMatch = titleLower.match(/(?:chapter|bab|episode|ch|vol)\.?\s*(\d+)/);
                if (explicitMatch) {
                    chapterNum = parseInt(explicitMatch[1], 10);
                } else {
                    const startNumMatch = titleLower.match(/^(\d+)/);
                    if (startNumMatch) {
                        chapterNum = parseInt(startNumMatch[1], 10);
                    } else {
                        chapterNum = epubChapters.findIndex(c => c.id === chapter.id) + 1;
                    }
                }

                const newTranslation: SavedTranslation = {
                    id: freshId,
                    projectId: activeProject.id,
                    name: chapter.title,
                    chapterNumber: chapterNum,
                    title: chapter.title,
                    translatedText: translatedText,
                    timestamp: new Date().toISOString(),
                };
                
                try {
                    await saveTranslationToDB(newTranslation);
                    await saveProjectToDB(activeProject);
                } catch (dbError: any) {
                    console.error("DB Save Error:", dbError);
                    await saveProjectToDB(activeProject);
                    await saveTranslationToDB(newTranslation);
                }

                // 4. Auto Extract Glossary (if enabled)
                if (autoExtractBatch) {
                    try {
                        const terms = await extractGlossaryFromText(sourceText, translatedText, settings, settings.appLanguage || 'id');
                        allExtractedTerms = [...allExtractedTerms, ...terms];
                    } catch (e) {
                        console.error("Batch glossary extraction failed for chapter", chapter.title, e);
                    }
                }
            }

            // Process Extracted Terms
            if (autoExtractBatch && allExtractedTerms.length > 0) {
                const uniqueTerms = Array.from(new Map(allExtractedTerms.map(item => [item.original.toLowerCase(), item])).values());
                const existing = new Set((activeProject.glossary || []).map(g => g.original.toLowerCase()));
                const newItems = uniqueTerms.filter(r => !existing.has(r.original.toLowerCase())).map(r => ({ ...r, selected: true }));
                setBatchExtractionResult(newItems);
            }

            setIsBatchComplete(true);
            setIsEpubModalOpen(true);

        } catch (e: any) {
            console.error("Batch Task Error:", e);
            if (e.message === 'AbortedByUser' || currentSignal.aborted) {
                // Stopped
            } else {
                // Error
                setIsEpubModalOpen(true);
            }
        } finally {
            setIsBatchTranslating(false);
            abortControllerRef.current = null;
        }
    }, [selectedBatchChapters, epubChapters, loadedZip, activeProject, settings, autoExtractBatch]);

    return (
        <BatchTranslationContext.Provider value={{
            isBatchMode, setIsBatchMode,
            isBatchTranslating,
            batchProgress,
            selectedBatchChapters, setSelectedBatchChapters, toggleBatchChapter,
            isBatchComplete, setIsBatchComplete,
            batchExtractionResult, setBatchExtractionResult,
            autoExtractBatch, setAutoExtractBatch,
            epubChapters,
            loadedZip, setLoadedZip,
            startBatchTranslation, stopBatchTranslation, resetBatch,
            isEpubModalOpen, setIsEpubModalOpen
        }}>
            {children}
        </BatchTranslationContext.Provider>
    );
};

export const useBatchTranslation = () => {
    const context = useContext(BatchTranslationContext);
    if (!context) {
        throw new Error("useBatchTranslation must be used within a BatchTranslationProvider");
    }
    return context;
};
