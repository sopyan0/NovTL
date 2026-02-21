
/*
 * NovTL Studio - Translation Interface Component
 * Copyright (c) 2025 NovTL Studio. All Rights Reserved.
 */

import { GlossarySidebar } from './GlossarySidebar';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'; 
import ReactDOM from 'react-dom';
import JSZip from 'jszip';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'; 
import { Clipboard } from '@capacitor/clipboard';
import { SavedTranslation, EpubChapter } from '../types'; 
import { translateTextStream, hasValidApiKey, extractGlossaryFromText } from '../services/llmService';
import { LANGUAGES, DEFAULT_SETTINGS } from '../constants';
import { saveTranslationToDB, getTranslationSummariesByProjectId, getPreviousChapterContext, saveProjectToDB } from '../utils/storage';
import { useSettings } from '../contexts/SettingsContext';
import { useEditor } from '../contexts/EditorContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useBatchTranslation } from '../contexts/BatchTranslationContext';
import { generateId } from '../utils/id';
import { parseEpub, loadChapterText } from '../utils/epubParser';
import { dbService } from '../services/DatabaseService';
import { isCapacitorNative, isElectron } from '../utils/fileSystem';
import { idb } from '../services/IndexedDBService';

// TOAST COMPONENT
const Toast: React.FC<{ message: string; show: boolean; onClose: () => void }> = ({ message, show, onClose }) => {
    useEffect(() => {
        if (show) {
            const timer = setTimeout(onClose, 3000);
            return () => clearTimeout(timer);
        }
    }, [show, onClose]);
    if (!show) return null;
    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-none">
            <div className="bg-charcoal text-paper px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-paper/10">
                <span className="text-green-400 text-xl">✓</span>
                <span className="font-bold text-sm tracking-wide">{message}</span>
            </div>
        </div>
    );
};

// Toolbar Component
const TranslationToolbar: React.FC<{
  sourceLang: string;
  targetLang: string;
  onSourceChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onSwap: () => void;
  hasApiKey: boolean;
  onToggleApi: () => void;
  onTogglePrompt: () => void;
  onLoadEpub: () => void;
  showPrompt: boolean;
  showApi: boolean;
  activeProvider: string;
  mode: 'standard' | 'high_quality';
  onModeChange: (m: 'standard' | 'high_quality') => void;
  t: (key: string) => string;
}> = ({ sourceLang, targetLang, onSourceChange, onTargetChange, onSwap, hasApiKey, onToggleApi, onTogglePrompt, onLoadEpub, showPrompt, showApi, activeProvider, mode, onModeChange, t }) => (
  <div className="glass-card p-2 md:p-3 rounded-3xl z-30 flex flex-col md:flex-row gap-3 items-center justify-between transition-all duration-300 shadow-sm hover:shadow-md">
    <div className="flex items-center gap-2 bg-paper/50 dark:bg-black/20 p-1.5 rounded-2xl border border-border/40 shadow-inner-light w-full md:w-auto overflow-x-auto">
        <select value={sourceLang} onChange={(e) => onSourceChange(e.target.value)} className="w-full md:w-32 appearance-none bg-transparent hover:bg-card pl-3 pr-6 py-2 rounded-xl text-sm font-semibold text-charcoal outline-none cursor-pointer transition-colors focus:bg-card">
            {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
        </select>
        <button onClick={onSwap} className="p-1.5 rounded-xl text-subtle hover:text-accent hover:bg-card shadow-sm transition-all flex-shrink-0 active:rotate-180" title="Swap">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
        </button>
        <select value={targetLang} onChange={(e) => onTargetChange(e.target.value)} className="w-full md:w-32 appearance-none bg-card pl-3 pr-6 py-2 rounded-xl text-sm font-bold text-accent shadow-sm outline-none cursor-pointer transition-transform hover:scale-105">
            {LANGUAGES.filter(l => !l.includes('Auto')).map(lang => <option key={lang} value={lang}>{lang}</option>)}
        </select>
    </div>

    <div className="flex gap-2 w-full md:w-auto justify-end items-center">
        <select value={mode} onChange={(e) => onModeChange(e.target.value as any)} className={`appearance-none pl-3 pr-8 py-2 rounded-2xl text-xs font-bold border cursor-pointer outline-none transition-all ${mode === 'high_quality' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 border-indigo-100 dark:border-indigo-800 shadow-sm' : 'bg-card text-subtle border-border hover:border-gray-300 dark:hover:border-gray-600'}`}>
            <option value="standard">⚡ Standard</option>
            <option value="high_quality">💎 Novel (2-Pass)</option>
        </select>
        <button onClick={onLoadEpub} className="text-xs font-bold tracking-wide transition flex items-center gap-2 px-3 py-2 rounded-2xl border shadow-sm bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800">
            📂 <span className="hidden sm:inline">{t('editor.upload')}</span>
        </button>
        <button onClick={onToggleApi} className={`text-xs font-bold tracking-wide transition flex items-center gap-2 px-3 py-2 rounded-2xl border shadow-sm ${!hasApiKey ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' : showApi ? 'bg-charcoal text-paper border-charcoal' : 'bg-card text-subtle border-border hover:border-gray-300 dark:hover:border-gray-600 hover:text-charcoal'}`}>
            {!hasApiKey ? `⚠️ ${t('editor.apiButton')}` : `🔑 ${t('editor.apiButton')}`}
        </button>
        <button onClick={onTogglePrompt} className={`text-xs font-bold tracking-wide transition flex items-center gap-2 px-3 py-2 rounded-2xl border shadow-sm ${showPrompt ? 'bg-accent text-white border-accent' : 'bg-card text-accent border-border hover:border-accent/20'}`}>
            ✨ <span className="hidden sm:inline">{t('editor.promptButton')}</span>
        </button>
    </div>
  </div>
);

interface TranslationInterfaceProps {
    isSidebarCollapsed: boolean;
}

// Save Modal Component (Moved outside to prevent re-renders)
const SaveModal: React.FC<{
  isOpen: boolean;
  saveData: { number: number; title: string };
  setSaveData: React.Dispatch<React.SetStateAction<{ number: number; title: string }>>;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ isOpen, saveData, setSaveData, onClose, onConfirm }) => {
  if (!isOpen) return null;

  return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-paper w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4">
              <h3 className="text-xl font-serif font-bold text-charcoal">Simpan Terjemahan</h3>
              
              <div className="space-y-2">
                  <label className="text-xs font-bold text-subtle uppercase">Chapter Number</label>
                  <input 
                    type="number" 
                    value={saveData.number} 
                    onChange={(e) => setSaveData(prev => ({ ...prev, number: parseInt(e.target.value) || 0 }))}
                    className="w-full p-3 rounded-xl bg-card border border-border outline-none font-bold text-charcoal focus:border-accent"
                  />
              </div>

              <div className="space-y-2">
                  <label className="text-xs font-bold text-subtle uppercase">Chapter Title (Optional)</label>
                  <input 
                    type="text" 
                    value={saveData.title} 
                    onChange={(e) => setSaveData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. The Beginning"
                    className="w-full p-3 rounded-xl bg-card border border-border outline-none font-serif text-charcoal focus:border-accent"
                  />
              </div>

              <div className="flex gap-3 pt-2">
                  <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-subtle hover:bg-gray-100 transition-colors">Batal</button>
                  <button onClick={onConfirm} className="flex-1 py-3 rounded-xl font-bold bg-charcoal text-paper shadow-lg hover:bg-black transition-colors">Simpan</button>
              </div>
          </div>
      </div>
  );
};

const TranslationInterface: React.FC<TranslationInterfaceProps> = ({ isSidebarCollapsed }) => {
  const { settings, updateSettings, updateProject, activeProject } = useSettings();
  const { 
    sourceText, setSourceText, 
    translatedText, setTranslatedText,
    epubChapters, setEpubChapters,
    activeChapterId, setActiveChapterId,
    isRestoring
  } = useEditor();
  const { t } = useLanguage();
  const { 
      isBatchMode, setIsBatchMode,
      isBatchTranslating,
      batchProgress,
      selectedBatchChapters, setSelectedBatchChapters, toggleBatchChapter,
      isBatchComplete, setIsBatchComplete,
      batchExtractionResult, setBatchExtractionResult,
      autoExtractBatch, setAutoExtractBatch,
      loadedZip, setLoadedZip,
      startBatchTranslation, stopBatchTranslation, resetBatch,
      isEpubModalOpen, setIsEpubModalOpen
  } = useBatchTranslation();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslationFullscreen, setIsTranslationFullscreen] = useState(false); 
  
  const [tempInstruction, setTempInstruction] = useState(activeProject.translationInstruction);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  
  // REMOVED LOCAL STATES: isEpubModalOpen, loadedZip
  
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const outputBufferRef = useRef(''); 
  const lastUpdateRef = useRef(0);
  const portalRoot = document.getElementById('portal-root');
  
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  
  const hasApiKey = hasValidApiKey(settings);
  const glossaryCount = activeProject.glossary.length;
  const activeModel = settings.activeProvider;

  const translatedParagraphs = useMemo(() => {
    if (!translatedText) return [];
    return translatedText.split('\n');
  }, [translatedText]);

  // RESTORE SCROLL POSITION
  useEffect(() => {
    if (translatedText && !isLoading && virtuosoRef.current) {
        const savedPos = localStorage.getItem('editor_scroll_index');
        if (savedPos) {
            const index = parseInt(savedPos, 10);
            if (!isNaN(index)) {
                setTimeout(() => {
                    virtuosoRef.current?.scrollToIndex({ index, align: 'start' });
                }, 100);
            }
        }
    }
  }, [isRestoring]);

  const handleScroll = (index: number) => {
      localStorage.setItem('editor_scroll_index', index.toString());
  };

  // PERSISTENCE LOGIC: EPUB RECOVERY
  useEffect(() => {
    const recoverEpub = async () => {
        try {
            // REVISI: Gunakan IndexedDB untuk file besar (Blob) agar tidak hilang/corrupt
            const blob = await idb.getFile('active_epub_file');
            if (blob) {
                const zip = new JSZip();
                const loadedZipContent = await zip.loadAsync(blob);
                setLoadedZip(loadedZipContent);
                console.log("EPUB recovered from IndexedDB");
            } else {
                // Fallback cek SQLite (Legacy support)
                const savedEpub = await dbService.getAppState('active_epub_file');
                if (savedEpub && savedEpub.blob) {
                    const zip = new JSZip();
                    const loadedZipContent = await zip.loadAsync(savedEpub.blob);
                    setLoadedZip(loadedZipContent);
                }
            }
        } catch (e) {
            console.error("Failed to recover EPUB:", e);
        }
    };
    if (epubChapters.length > 0 && !loadedZip) {
        recoverEpub();
    }
  }, [epubChapters, loadedZip]);

  useEffect(() => {
    setTempInstruction(activeProject.translationInstruction);
    setTempApiKey(settings.apiKeys[settings.activeProvider] || '');
  }, [activeProject.id, activeProject.translationInstruction, settings.activeProvider, settings.apiKeys]);

  const showToastNotification = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
  };

  const handleResetPrompt = () => {
    const defaultInstruction = DEFAULT_SETTINGS.projects[0].translationInstruction;
    setTempInstruction(defaultInstruction);
    updateProject(activeProject.id, { translationInstruction: defaultInstruction });
    showToastNotification("Prompt reset to default.");
  };

  const updateProjectLanguage = (type: 'source' | 'target', value: string) => {
    updateProject(activeProject.id, { [type === 'source' ? 'sourceLanguage' : 'targetLanguage']: value });
  };

  const handleSwapLanguages = () => {
    const currentSource = activeProject.sourceLanguage;
    const currentTarget = activeProject.targetLanguage;
    if (currentSource.includes('Auto')) return;
    updateProject(activeProject.id, { sourceLanguage: currentTarget, targetLanguage: currentSource });
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      if (isBatchTranslating) {
          showToastNotification("Menghentikan batch...");
      } else {
          setError("Berhenti oleh pengguna.");
      }
    }
  };

  const handleClearSource = async () => {
      setSourceText('');
      setTranslatedText('');
      outputBufferRef.current = '';
      setActiveChapterId(null);
      localStorage.removeItem('editor_scroll_index');
      
      await dbService.deleteAppState('editor_source_content');
      await dbService.deleteAppState('editor_target_content');

      if (isLoading) handleStop();
  };

  const handlePasteSource = async () => {
      try {
          let text = '';
          if (isElectron() && window.novtlAPI) {
              text = await window.novtlAPI.readClipboard();
          } else if (isCapacitorNative()) {
              const { value } = await Clipboard.read();
              text = value;
          } else {
              text = await navigator.clipboard.readText();
          }

          if (text) {
            setSourceText(text);
            showToastNotification(t('editor.txtLoaded'));
          } else {
             showToastNotification(t('editor.clipboardEmpty'));
          }
      } catch (err: any) {
          console.error("Paste failed", err);
          if (err.name === 'NotAllowedError' || err.message?.includes('denied')) {
            setError(t('editor.clipboardError'));
          } else {
            setError("Gagal membaca Clipboard.");
          }
          setTimeout(() => setError(null), 3000);
      }
  };

  const processFile = async (file: File) => {
      const fileName = file.name.toLowerCase();
      
      if (fileName.endsWith('.epub')) {
        try {
            const zip = new JSZip();
            const loadedZipContent = await zip.loadAsync(file);
            setLoadedZip(loadedZipContent);
            setActiveChapterId(null);

            const { chapters } = await parseEpub(file);
            setEpubChapters(chapters);
            
            // REVISI: Simpan ke IndexedDB (lebih reliable untuk Blob besar)
            await idb.saveFile('active_epub_file', file);
            
            // Hapus backup lama di SQLite jika ada untuk hemat ruang
            await dbService.deleteAppState('active_epub_file');
            
            setIsEpubModalOpen(true);
            showToastNotification(`${t('editor.epubLoaded')} (${chapters.length})`);
        } catch (e: any) {
            setError(`${t('editor.epubLoadError')}: ${e.message}`);
        }
      } 
      else if (fileName.endsWith('.txt')) {
          try {
              const text = await file.text();
              setSourceText(text);
              showToastNotification(t('editor.txtLoaded'));
          } catch (e) {
              setError("Gagal membaca file teks.");
          }
      }
      else {
          setError("Format file tidak didukung. Gunakan .epub atau .txt");
      }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          await processFile(file);
          e.dataTransfer.clearData();
      }
  }, []);

  const triggerEpubUpload = () => {
      if (epubChapters.length > 0) {
          setIsEpubModalOpen(true);
      } else {
          fileInputRef.current?.click();
      }
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await processFile(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadChapterToEditor = async (chapter: EpubChapter) => {
      if (!loadedZip) return;
      try {
          const text = await loadChapterText(loadedZip, chapter.href);
          setSourceText(text);
          setTranslatedText('');
          setActiveChapterId(chapter.id);
          localStorage.removeItem('editor_scroll_index'); 
          setIsEpubModalOpen(false);
          showToastNotification(`${t('editor.epubLoaded')}: ${chapter.title}`);
      } catch (e) {
          alert("Gagal mengambil teks bab ini.");
      }
  };

  const resetEpub = async () => {
      setEpubChapters([]);
      setLoadedZip(null);
      setActiveChapterId(null);
      setIsEpubModalOpen(false);
      await idb.deleteFile('active_epub_file');
      await dbService.deleteAppState('active_epub_file');
      await dbService.deleteAppState('active_epub_metadata');
  };

  const handleTranslate = async () => {
    if (isLoading) { handleStop(); return; }
    if (!sourceText.trim()) return;
    if (!hasValidApiKey(settings)) {
        setError(`${settings.activeProvider} API Key Missing.`);
        setShowApiKeyInput(true);
        return;
    }
    setIsLoading(true);
    setError(null);
    setTranslatedText(''); 
    outputBufferRef.current = '';
    abortControllerRef.current = new AbortController();

    try {
      const previousChapterContext = await getPreviousChapterContext(activeProject.id);

      await translateTextStream(
          sourceText, settings, activeProject, 
          (chunk) => {
              outputBufferRef.current += chunk;
              const now = Date.now();
              if (now - lastUpdateRef.current > 100) { 
                  setTranslatedText(outputBufferRef.current);
                  lastUpdateRef.current = now;
              }
          },
          abortControllerRef.current.signal,
          settings.translationMode || 'standard',
          previousChapterContext
      );
      setTranslatedText(outputBufferRef.current);
    } catch (err: any) {
      setError(err.message === 'AbortedByUser' ? 'Stopped.' : err.message);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveData, setSaveData] = useState({ number: 1, title: '' });

  /**
   * --- SMART AUTO-INCREMENT SAVE (PERBAIKAN TOTAL) ---
   * 1. Hapus total pengecekan ID lama. Selalu pakai generateId().
   * 2. Cari angka bab tertinggi dari nama di library.
   * 3. Jika ketemu "Chapter 1", maka bab baru otomatis "Chapter 2".
   */
  const handleInitiateSave = async () => {
    if (!translatedText.trim()) return;
    
    try {
        const summaries = await getTranslationSummariesByProjectId(activeProject.id);
        
        // Cari angka tertinggi dari chapterNumber yang ada di DB
        const maxNum = summaries.reduce((max, s) => Math.max(max, s.chapterNumber || 0), 0);
        const nextNum = maxNum + 1;
        
        let title = "";
        
        if (activeChapterId) {
            const epubTitle = epubChapters.find(c => c.id === activeChapterId)?.title;
            title = epubTitle || "";
        }

        setSaveData({ number: nextNum, title });
        setIsSaveModalOpen(true);
    } catch (e) {
        console.error("Failed to init save:", e);
    }
  };

  const handleConfirmSave = async () => {
    setIsSaveModalOpen(false);
    setIsSaving(true);
    
    try {
        await saveProjectToDB(activeProject);
        
        const freshId = generateId(); 
        const displayName = `Chapter ${saveData.number}${saveData.title ? `: ${saveData.title}` : ''}`;

        const newTranslation: SavedTranslation = {
          id: freshId,
          projectId: activeProject.id,
          name: displayName,
          chapterNumber: saveData.number,
          title: saveData.title,
          translatedText: translatedText,
          timestamp: new Date().toISOString(),
        };
        
        await saveTranslationToDB(newTranslation);
        
        setActiveChapterId(null); 
        showToastNotification(`Saved: ${displayName}`);
    } catch (e: any) {
        console.error("Save failed:", e);
        setError(`Gagal menyimpan: ${e.message}`);
    } finally {
        setIsSaving(false);
    }
  };

  const ReadingModeModal = () => {
    const readingVirtuosoRef = useRef<VirtuosoHandle>(null);
    useEffect(() => {
        const savedPos = localStorage.getItem('editor_scroll_index');
        if (savedPos && readingVirtuosoRef.current) {
             const index = parseInt(savedPos, 10);
             if(!isNaN(index)) {
                 setTimeout(() => readingVirtuosoRef.current?.scrollToIndex({ index, align: 'start' }), 50);
             }
        }
    }, []);

    return (
    <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[10000] bg-paper overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        <div className="absolute top-0 left-0 right-0 z-[10001] bg-paper/80 backdrop-blur-sm border-b border-border/20 shadow-sm p-4">
            <div className="flex justify-between items-center max-w-5xl mx-auto w-full">
               <h2 className="text-lg md:text-xl font-serif font-bold text-charcoal truncate">{t('editor.focusMode')}</h2>
               <button onClick={() => setIsTranslationFullscreen(false)} className="bg-charcoal text-paper w-10 h-10 rounded-full font-bold shadow-lg flex items-center justify-center cursor-pointer active:scale-95">✕</button>
            </div>
        </div>
        <div className="flex-grow w-full h-full pt-24 px-4 md:px-0">
             <Virtuoso 
                ref={readingVirtuosoRef}
                data={translatedParagraphs}
                className="custom-scrollbar h-full"
                itemContent={(index, item) => (
                    <div className="max-w-3xl mx-auto px-4 md:px-0">
                         {item.trim() ? <p className="mb-6 indent-8 font-serif leading-loose text-lg md:text-xl text-justify text-charcoal">{item}</p> : <br/>}
                    </div>
                )}
                rangeChanged={({ startIndex }) => handleScroll(startIndex)}
                increaseViewportBy={500}
             />
        </div>
    </div>
    );
  };

  // --- BATCH TRANSLATION LOGIC ---
  // Logic moved to BatchTranslationContext


  const handleReviewBatchGlossary = () => {
      setExtractedGlossary(batchExtractionResult);
      setIsGlossarySidebarOpen(true);
      setIsEpubModalOpen(false); // Close batch modal to focus on glossary
      setIsBatchComplete(false); // Reset complete state
      setIsBatchMode(false);
      setSelectedBatchChapters(new Set());
  };

  const handleCloseBatchComplete = () => {
      setIsBatchComplete(false);
      setIsBatchMode(false);
      setSelectedBatchChapters(new Set());
      setIsEpubModalOpen(false);
  };

  const EpubChapterModal = () => (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-charcoal/40 backdrop-blur-sm animate-in fade-in">
        <div className="bg-paper w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            {/* HEADER */}
            <div className="p-6 border-b border-border flex justify-between items-center bg-card">
                <div>
                    <h3 className="text-xl font-serif font-bold text-charcoal">
                        {isBatchTranslating ? 'Menerjemahkan...' : isBatchComplete ? 'Selesai!' : isBatchMode ? `Batch Translate (${selectedBatchChapters.size})` : 'Pilih Bab EPUB'}
                    </h3>
                    {!isBatchTranslating && !isBatchComplete && <p className="text-xs text-subtle mt-1">{epubChapters.length} bab terdeteksi.</p>}
                </div>
                <div className="flex gap-2">
                    {isBatchTranslating && (
                        <button onClick={() => setIsEpubModalOpen(false)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-charcoal">
                            Sembunyikan
                        </button>
                    )}
                    {!isBatchTranslating && !isBatchComplete && (
                        <>
                            <button onClick={() => setIsBatchMode(!isBatchMode)} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${isBatchMode ? 'bg-accent text-white border-accent' : 'bg-card text-charcoal border-border'}`}>
                                {isBatchMode ? 'Cancel Batch' : 'Batch Mode'}
                            </button>
                            {!isBatchMode && <button onClick={resetEpub} className="text-red-500 text-xs font-bold px-2">{t('common.reset')}</button>}
                        </>
                    )}
                    <button onClick={() => setIsEpubModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">✕</button>
                </div>
            </div>
            
            {/* CONTENT */}
            {isBatchTranslating ? (
                <div className="flex-grow flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4"></div>
                    <h4 className="text-lg font-bold text-charcoal mb-2">Menerjemahkan...</h4>
                    <p className="text-sm text-subtle mb-4">{batchProgress.currentTitle}</p>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mb-2">
                        <div className="bg-accent h-2.5 rounded-full transition-all duration-300" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}></div>
                    </div>
                    <p className="text-xs font-bold text-subtle">{batchProgress.current} / {batchProgress.total}</p>
                    <button onClick={handleStop} className="mt-6 px-6 py-2 bg-red-100 text-red-600 rounded-xl font-bold hover:bg-red-200">Stop</button>
                    <p className="text-[10px] text-subtle mt-4">Anda bisa menutup jendela ini, proses akan berjalan di latar belakang.</p>
                </div>
            ) : isBatchComplete ? (
                <div className="flex-grow flex flex-col items-center justify-center p-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mb-2">✓</div>
                    <h4 className="text-xl font-bold text-charcoal">Batch Translation Selesai!</h4>
                    <p className="text-sm text-subtle">Berhasil menerjemahkan {batchProgress.total} bab.</p>
                    
                    {batchExtractionResult.length > 0 ? (
                        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 w-full">
                            <p className="text-sm font-bold text-orange-800 mb-1">🔍 {batchExtractionResult.length} Istilah Baru Ditemukan</p>
                            <p className="text-xs text-orange-600 mb-3">AI mendeteksi istilah yang mungkin perlu masuk glosarium.</p>
                            <button onClick={handleReviewBatchGlossary} className="w-full py-2 bg-orange-200 text-orange-800 rounded-lg font-bold text-xs hover:bg-orange-300">
                                Review Glosarium
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs text-subtle italic">Tidak ada istilah baru yang terdeteksi untuk glosarium.</p>
                    )}

                    <button onClick={handleCloseBatchComplete} className="px-8 py-3 bg-charcoal text-white rounded-xl font-bold shadow-lg hover:bg-black">
                        Tutup
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex-grow overflow-y-auto custom-scrollbar p-2">
                        {epubChapters.map((chapter, idx) => {
                            const isActive = activeChapterId === chapter.id;
                            const isSelected = selectedBatchChapters.has(chapter.id);
                            
                            return (
                                <button 
                                    key={idx} 
                                    onClick={() => isBatchMode ? toggleBatchChapter(chapter.id) : loadChapterToEditor(chapter)} 
                                    className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 group border ${
                                        isBatchMode 
                                            ? (isSelected ? 'bg-accent/10 border-accent' : 'hover:bg-gray-50 border-transparent')
                                            : (isActive ? 'bg-accent text-white shadow-md border-accent' : 'hover:bg-gray-100 border-transparent')
                                    }`}
                                >
                                    {isBatchMode && (
                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-accent border-accent' : 'border-gray-300 bg-white'}`}>
                                            {isSelected && <span className="text-white text-xs">✓</span>}
                                        </div>
                                    )}
                                    <span className={`text-xs font-bold px-2 py-1 rounded-md min-w-[2rem] text-center ${isActive && !isBatchMode ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>{idx + 1}</span>
                                    <div className="flex-grow min-w-0">
                                        <span className={`font-serif text-sm truncate block ${isActive && !isBatchMode ? 'text-white font-bold' : 'text-charcoal'}`}>{chapter.title}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    {isBatchMode && (
                        <div className="p-4 border-t border-border bg-card space-y-3">
                            <div className="flex items-center gap-2 px-1">
                                <input 
                                    type="checkbox" 
                                    id="autoExtractGlossary"
                                    checked={autoExtractBatch}
                                    onChange={(e) => setAutoExtractBatch(e.target.checked)}
                                    className="w-4 h-4 text-accent rounded focus:ring-accent"
                                />
                                <label htmlFor="autoExtractGlossary" className="text-xs font-bold text-charcoal cursor-pointer select-none">
                                    Otomatis Ekstrak Glosarium (AI Enhanced)
                                </label>
                            </div>
                            <button 
                                onClick={startBatchTranslation}
                                disabled={selectedBatchChapters.size === 0}
                                className="w-full py-3 bg-charcoal text-paper rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black transition-all"
                            >
                                Terjemahkan {selectedBatchChapters.size} Bab
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    </div>
  );

  const [isGlossarySidebarOpen, setIsGlossarySidebarOpen] = useState(false);
  const [extractedGlossary, setExtractedGlossary] = useState<{original: string, translated: string, selected: boolean}[]>([]);
  const [isExtractingGlossary, setIsExtractingGlossary] = useState(false);

  const handleExtractGlossary = async () => {
      if (!sourceText || !translatedText) return;
      setIsGlossarySidebarOpen(true);
      setIsExtractingGlossary(true);
      try {
          const results = await extractGlossaryFromText(sourceText, translatedText, settings, settings.appLanguage || 'id');
          // Filter duplicates from existing glossary
          const existing = new Set(activeProject.glossary.map(g => g.original.toLowerCase()));
          const newItems = results.filter(r => !existing.has(r.original.toLowerCase())).map(r => ({ ...r, selected: true }));
          setExtractedGlossary(newItems);
      } catch (e) {
          showToastNotification("Gagal mengekstrak glosarium.");
      } finally {
          setIsExtractingGlossary(false);
      }
  };

  const handleSaveExtractedGlossary = async () => {
      const toAdd = extractedGlossary.filter(g => g.selected).map(({ original, translated }) => ({
          id: generateId(), // Generate unique ID for each new item
          original, 
          translated 
      }));
      
      if (toAdd.length === 0) {
          setIsGlossarySidebarOpen(false);
          return;
      }
      
      // REVISI: Fetch latest project state to avoid overwriting
      // Since we don't have a direct "getProject" method exposed here, we rely on activeProject
      // But we should ensure we are appending to the current list in state
      const currentGlossary = activeProject.glossary || [];
      
      // Deduplicate against existing
      const existingKeys = new Set(currentGlossary.map(g => g.original.toLowerCase()));
      const uniqueToAdd = toAdd.filter(item => !existingKeys.has(item.original.toLowerCase()));

      if (uniqueToAdd.length === 0) {
          showToastNotification("Semua istilah sudah ada di glosarium.");
          setIsGlossarySidebarOpen(false);
          return;
      }

      const updatedGlossary = [...currentGlossary, ...uniqueToAdd];
      
      // Optimistic update
      const updatedProject = { ...activeProject, glossary: updatedGlossary };
      setActiveProject(updatedProject);
      
      await updateProject(activeProject.id, { glossary: updatedGlossary });
      showToastNotification(`${uniqueToAdd.length} kata ditambahkan ke glosarium!`);
      setIsGlossarySidebarOpen(false);
      setExtractedGlossary([]);
  };

  // REMOVED INLINE GlossarySidebar COMPONENT

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      {/* Global Batch Progress Bar */}
      {isBatchTranslating && (
          <div className="fixed top-0 left-0 right-0 z-[100] h-1 bg-gray-200 dark:bg-gray-800">
              <div 
                className="h-full bg-accent transition-all duration-500 ease-out shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]" 
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              ></div>
          </div>
      )}
      
      <GlossarySidebar 
        isOpen={isGlossarySidebarOpen}
        onClose={() => setIsGlossarySidebarOpen(false)}
        isExtracting={isExtractingGlossary}
        extractedGlossary={extractedGlossary}
        setExtractedGlossary={setExtractedGlossary}
        onSave={handleSaveExtractedGlossary}
      />
      <Toast message={toastMessage} show={showToast} onClose={() => setShowToast(false)} />
      {/* ... rest of the JSX ... */}
      {error && <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm animate-bounce">⚠️ {error}</div>}
      {isTranslationFullscreen && portalRoot && ReactDOM.createPortal(<ReadingModeModal />, portalRoot)}
      {isEpubModalOpen && <EpubChapterModal />}
      <SaveModal 
        isOpen={isSaveModalOpen} 
        saveData={saveData} 
        setSaveData={setSaveData} 
        onClose={() => setIsSaveModalOpen(false)} 
        onConfirm={handleConfirmSave} 
      />
      
      <input type="file" ref={fileInputRef} onChange={handleFileInputChange} accept=".epub,.txt" className="hidden" />

      <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-3 px-1">
         <h2 className="text-2xl md:text-3xl font-serif font-bold text-charcoal tracking-tight truncate max-w-[70%]">{activeProject.name}</h2>
         <div className="flex items-center gap-2">
             <div className="bg-card px-3 py-1.5 rounded-xl border border-border text-xs font-bold text-charcoal">📖 {glossaryCount} {t('common.glossary')}</div>
             <div className="bg-card px-3 py-1.5 rounded-xl border border-border text-xs font-bold text-charcoal flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-green-500' : 'bg-red-500'}`}></div>
                 <span>{activeModel}</span>
             </div>
         </div>
      </div>

      <TranslationToolbar 
        sourceLang={activeProject.sourceLanguage} targetLang={activeProject.targetLanguage}
        onSourceChange={(v) => updateProjectLanguage('source', v)} onTargetChange={(v) => updateProjectLanguage('target', v)}
        onSwap={handleSwapLanguages} hasApiKey={hasApiKey} showApi={showApiKeyInput} showPrompt={showPromptInput}
        onToggleApi={() => setShowApiKeyInput(!showApiKeyInput)} onTogglePrompt={() => setShowPromptInput(!showPromptInput)}
        onLoadEpub={triggerEpubUpload} activeProvider={settings.activeProvider}
        mode={settings.translationMode || 'standard'} onModeChange={(m) => updateSettings({ translationMode: m })} 
        t={t}
      />

      {showApiKeyInput && (
        <div className="glass p-4 md:p-6 rounded-3xl animate-in slide-in-from-top-2 shadow-soft border-l-4 border-accent flex flex-col sm:flex-row gap-3 max-w-full overflow-hidden">
            <input type="password" placeholder={t('editor.apiKeyPlaceholder')} className="flex-grow p-4 rounded-2xl bg-paper/80 border border-border outline-none text-sm transition-all text-charcoal min-w-0" value={tempApiKey} onChange={(e) => setTempApiKey(e.target.value)} />
            <button onClick={() => { updateSettings(prev => ({...prev, apiKeys: {...prev.apiKeys, [settings.activeProvider]: tempApiKey}})); setShowApiKeyInput(false); }} className="bg-charcoal text-paper px-6 py-3 rounded-2xl text-sm font-bold shadow-lg whitespace-nowrap">{t('common.save')}</button>
        </div>
      )}

      {showPromptInput && (
        <div className="bg-gradient-to-r from-[#FFFBF0] to-[#FFF5E6] dark:from-gray-800 dark:to-gray-900 p-6 rounded-3xl border border-orange-100 dark:border-gray-700 animate-in slide-in-from-top-2 shadow-soft">
            <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-bold text-orange-800 dark:text-orange-300 uppercase tracking-widest">{t('editor.instruction')}</label>
                <button onClick={handleResetPrompt} className="text-[10px] font-bold text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300 px-3 py-1.5 rounded-lg border border-orange-200 dark:border-orange-800">↺ Reset Default</button>
            </div>
            <textarea value={tempInstruction} onChange={(e) => setTempInstruction(e.target.value)} className="w-full bg-white/60 dark:bg-black/40 p-4 rounded-2xl border border-orange-100 dark:border-gray-700 text-charcoal dark:text-gray-200 text-sm font-serif leading-relaxed outline-none" rows={2} />
        </div>
      )}

      {epubChapters.length > 0 && !isEpubModalOpen && (
          <div className="flex justify-center -mb-2">
              <button onClick={() => setIsEpubModalOpen(true)} className="bg-orange-50 text-orange-600 px-4 py-1.5 rounded-full text-xs font-bold border border-orange-200 shadow-sm hover:bg-orange-100 animate-in slide-in-from-top-2">{t('editor.backToEpub')}</button>
          </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 md:gap-8">
        <div className="flex flex-col h-full relative group">
          <div className="absolute -top-3 left-6 z-20 pointer-events-none flex items-center gap-2">
               <span className="text-[10px] font-bold text-subtle bg-paper px-3 py-1 uppercase tracking-widest border border-border rounded-md shadow-sm">{t('editor.source')}</span>
          </div>
          
          <div 
            className={`relative w-full h-[400px] md:h-[500px] lg:h-[600px] rounded-[2rem] transition-all duration-300 overflow-hidden ${
                isDragging 
                    ? 'bg-accent/5 border-2 border-accent shadow-glow scale-[1.01]' 
                    : 'bg-card border-2 border-transparent shadow-soft focus-within:shadow-glow focus-within:border-border'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {!sourceText && !isDragging && !isRestoring && (
                <button 
                    onClick={handlePasteSource} 
                    className="absolute top-4 right-4 z-30 px-3 py-1.5 bg-accent/10 text-accent hover:bg-accent hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                >
                    📋 {t('editor.paste')}
                </button>
            )}

            <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center bg-paper/90 backdrop-blur-sm transition-opacity duration-300 pointer-events-none ${isDragging ? 'opacity-100' : 'opacity-0'}`}>
                 <span className="text-5xl mb-4 animate-bounce">📂</span>
                 <p className="text-accent font-bold text-lg">{t('editor.dragDrop')}</p>
                 <p className="text-subtle text-xs">{t('editor.dragDropDesc')}</p>
            </div>

            <textarea 
                className="w-full h-full p-4 md:p-6 bg-transparent outline-none resize-none text-base md:text-lg font-serif leading-loose text-charcoal custom-scrollbar relative z-20 placeholder-gray-400/50" 
                placeholder={isDragging ? "" : (isRestoring ? t('editor.restoring') : t('editor.placeholder'))}
                value={sourceText} 
                onChange={(e) => setSourceText(e.target.value)}
                disabled={isRestoring}
            />

            {!sourceText && !isRestoring && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                    <span className="text-5xl mb-4 grayscale opacity-50">📝</span>
                    <p className="font-serif text-lg text-charcoal font-bold mb-2">{t('editor.emptyEditorTitle')}</p>
                    <p className="text-xs text-subtle max-w-[250px]">
                        {t('editor.emptyEditorDesc')}
                    </p>
                </div>
            )}
            
            {isRestoring && !sourceText && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-card/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center">
                        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2"></div>
                        <span className="text-xs font-bold text-subtle">{t('editor.restoring')}</span>
                    </div>
                </div>
            )}
          </div>

          {sourceText && (
             <button onClick={handleClearSource} className="absolute -top-3 right-4 z-30 p-2 bg-red-100 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm" title="Clear All Content">✕</button>
          )}
        </div>

        <div className="flex flex-col h-full relative group">
            <div className="absolute -top-3 left-6 z-10 pointer-events-none">
               <span className="text-[10px] font-bold text-accent bg-paper px-3 py-1 uppercase tracking-widest border border-border rounded-md shadow-sm">{t('editor.translation')}</span>
            </div>

            <div 
                className="w-full h-[400px] md:h-[500px] lg:h-[600px] rounded-[2rem] border-2 border-transparent bg-card shadow-soft overflow-hidden relative transition-all"
            >
              {translatedText ? (
                <Virtuoso 
                    ref={virtuosoRef}
                    data={translatedParagraphs}
                    className="custom-scrollbar h-full px-4 md:px-6 py-4"
                    followOutput={isLoading ? 'smooth' : false}
                    itemContent={(index, item) => (
                        <p className="mb-4 min-h-[1.5em] font-serif leading-loose text-charcoal text-justify prose-lg dark:prose-invert">
                            {item.trim() || '\u00A0'}
                        </p>
                    )}
                    rangeChanged={({ startIndex }) => handleScroll(startIndex)}
                    increaseViewportBy={500} 
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 font-serif italic text-center p-4">
                  {isLoading ? <div className="text-5xl animate-bounce">🍡</div> : <span className="text-6xl mb-6 opacity-20">📖</span>}
                  <span className="text-lg">{isLoading ? t('editor.waiting') : t('editor.emptyState')}</span>
                </div>
              )}
              {isLoading && translatedText && (
                  <div className="absolute bottom-4 right-4 z-20">
                      <div className="bg-accent text-white text-xs px-3 py-1 rounded-full animate-pulse shadow-md">
                          Generating...
                      </div>
                  </div>
              )}
            </div>

            {translatedText && (
                <button onClick={() => setIsTranslationFullscreen(true)} className="absolute -top-3 right-4 z-30 p-2 bg-indigo-50 border border-indigo-100 text-accent rounded-full hover:bg-accent hover:text-white transition-all shadow-sm">🔍</button>
            )}
        </div>
      </div>

      <div 
        className="fixed bottom-0 right-0 z-40 p-4 bg-paper/95 backdrop-blur-xl border-t border-border transition-all w-full md:w-[calc(100%-16rem)]"
        style={{ width: window.innerWidth >= 768 ? (isSidebarCollapsed ? 'calc(100% - 5rem)' : 'calc(100% - 16rem)') : '100%' }}
      >
         <div className="max-w-[1600px] mx-auto flex items-center gap-4">
             <div className="flex-grow flex gap-3">
                <button disabled={!isLoading && !sourceText.trim()} onClick={handleTranslate} className={`flex-grow py-3.5 md:py-4 font-serif font-bold tracking-widest text-sm rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2 ${isLoading ? 'bg-red-500 text-white' : 'bg-charcoal text-paper'}`}>
                    {isLoading ? t('editor.stop') : t('editor.translate')}
                </button>
                {translatedText && !isLoading && (
                    <button 
                        onClick={handleExtractGlossary}
                        className="px-4 py-3.5 md:py-4 bg-orange-100 text-orange-700 rounded-xl font-bold text-sm shadow-sm hover:bg-orange-200 active:scale-95 transition-all flex items-center gap-2"
                        title="Ekstrak Glosarium Otomatis"
                    >
                        <span>🔍</span>
                        <span className="hidden md:inline">Extract</span>
                    </button>
                )}
                <button 
                  disabled={isLoading || isSaving || !translatedText.trim()} 
                  onClick={handleInitiateSave} 
                  className={`px-6 md:px-12 py-3.5 md:py-4 font-bold text-sm rounded-xl transition-all disabled:opacity-50 shadow-soft border border-border flex items-center gap-2 bg-paper text-charcoal hover:bg-gray-200 active:scale-95`}
                >
                    {isSaving ? (
                      <>
                        <div className="w-3 h-3 border-2 border-charcoal border-t-transparent rounded-full animate-spin"></div>
                        <span>{t('editor.saving')}</span>
                      </>
                    ) : (
                      <span>{t('editor.save')}</span>
                    )}
                </button>
            </div>
         </div>
      </div>
    </div>
  );
};

export default TranslationInterface;
