
/*
 * NovTL Studio - Translation Interface Component
 * Copyright (c) 2025 NovTL Studio. All Rights Reserved.
 */

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react'; 
import ReactDOM from 'react-dom';
import JSZip from 'jszip';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'; 
import { Clipboard } from '@capacitor/clipboard';
import { SavedTranslation, EpubChapter } from '../types'; 
import { translateTextStream, hasValidApiKey } from '../services/llmService';
import { LANGUAGES, DEFAULT_SETTINGS } from '../constants';
import { saveTranslationToDB, getTranslationSummariesByProjectId, getPreviousChapterContext, saveProjectToDB } from '../utils/storage';
import { useSettings } from '../contexts/SettingsContext';
import { useEditor } from '../contexts/EditorContext';
import { useLanguage } from '../contexts/LanguageContext';
import { generateId } from '../utils/id';
import { parseEpub, loadChapterText } from '../utils/epubParser';
import { putItem, getItem, deleteItem } from '../utils/idb';
import { isCapacitorNative, isElectron } from '../utils/fileSystem';

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
  saveStatus: 'saved' | 'saving' | 'unsaved';
  t: (key: string) => string;
}> = ({ sourceLang, targetLang, onSourceChange, onTargetChange, onSwap, hasApiKey, onToggleApi, onTogglePrompt, onLoadEpub, showPrompt, showApi, activeProvider, mode, onModeChange, saveStatus, t }) => (
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

const TranslationInterface: React.FC<TranslationInterfaceProps> = ({ isSidebarCollapsed }) => {
  const { settings, updateSettings, updateProject, activeProject } = useSettings();
  const { 
    sourceText, setSourceText, 
    translatedText, setTranslatedText,
    epubChapters, setEpubChapters,
    activeChapterId, setActiveChapterId,
    isRestoring, saveStatus
  } = useEditor();
  const { t } = useLanguage();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslationFullscreen, setIsTranslationFullscreen] = useState(false); 
  
  // STATE PENTING: Untuk melacak apakah kita sedang mengedit bab yang sudah disimpan
  const [editingId, setEditingId] = useState<string | null>(null);
  // TAMBAHAN: Menyimpan nama bab yang sedang diedit agar user sadar
  const [editingName, setEditingName] = useState<string>('');
  
  const [tempInstruction, setTempInstruction] = useState(activeProject.translationInstruction);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  
  const [isEpubModalOpen, setIsEpubModalOpen] = useState(false);
  const [loadedZip, setLoadedZip] = useState<JSZip | null>(null);
  
  // Drag and Drop State
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const outputBufferRef = useRef(''); 
  const lastUpdateRef = useRef(0);
  const portalRoot = document.getElementById('portal-root');
  
  // Virtuoso Refs
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  
  const hasApiKey = hasValidApiKey(settings);
  const glossaryCount = activeProject.glossary.length;
  const activeModel = settings.activeProvider;

  // Memoize paragraphs for Virtuoso
  const translatedParagraphs = useMemo(() => {
    if (!translatedText) return [];
    return translatedText.split('\n');
  }, [translatedText]);

  // --- SECURITY: AUTO-RESET EDITING ID IF SOURCE IS CLEARED ---
  useEffect(() => {
      // Jika source text kosong (dihapus manual oleh user), 
      // PUTUS hubungan dengan bab sebelumnya untuk mencegah overwrite yang tidak disengaja.
      if (!sourceText || sourceText.trim() === '') {
          if (editingId) {
              setEditingId(null);
              setEditingName('');
          }
      }
  }, [sourceText, editingId]);

  // --- RESTORE SCROLL POSITION (AUTO-RESUME) ---
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

  // --- PERSISTENCE LOGIC: EPUB RECOVERY ---
  useEffect(() => {
    const recoverEpub = async () => {
        const savedEpub = await getItem('epub_files', 'active_epub_file');
        if (savedEpub && savedEpub.blob) {
            const zip = new JSZip();
            const loadedZipContent = await zip.loadAsync(savedEpub.blob);
            setLoadedZip(loadedZipContent);
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
      abortControllerRef.current = null;
      setIsLoading(false);
      setError("Stopped by user.");
    }
  };

  const handleClearSource = async () => {
      setSourceText('');
      setTranslatedText('');
      outputBufferRef.current = '';
      setActiveChapterId(null);
      setEditingId(null); // RESET STATE EDITING
      setEditingName('');
      localStorage.removeItem('editor_scroll_index');
      
      await deleteItem('app_state', 'editor_source_content');
      await deleteItem('app_state', 'editor_target_content');

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
      setEditingId(null); // Reset editing ID saat file baru dimuat
      setEditingName('');
      
      if (fileName.endsWith('.epub')) {
        try {
            const zip = new JSZip();
            const loadedZipContent = await zip.loadAsync(file);
            setLoadedZip(loadedZipContent);
            setActiveChapterId(null);

            const { chapters } = await parseEpub(file);
            setEpubChapters(chapters);
            
            await putItem('epub_files', { id: 'active_epub_file', blob: file });
            
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

  // --- DRAG & DROP HANDLERS ---
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
          
          // SAFETY: Pastikan saat ganti bab EPUB, ID editing direset.
          // Jadi kalau user save, dia akan buat bab baru, bukan overwrite yang lama.
          setEditingId(null); 
          setEditingName('');
          
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
      setEditingId(null);
      setEditingName('');
      setIsEpubModalOpen(false);
      await deleteItem('epub_files', 'active_epub_file');
      await deleteItem('app_state', 'active_epub_metadata');
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

  // --- MANUAL CANCEL EDIT ---
  const handleCancelEdit = () => {
      setEditingId(null);
      setEditingName('');
      showToastNotification(t('editor.cancelEdit'));
  };

  const handleSaveTranslation = async () => {
    if (!translatedText.trim()) return;
    setIsSaving(true);
    
    try {
        await saveProjectToDB(activeProject);

        const existingChapters = await getTranslationSummariesByProjectId(activeProject.id);
        
        // 2. Tentukan ID: Update yang ada atau Buat Baru?
        let idToSave = editingId;
        
        // Cek validitas editingId
        if (idToSave && !existingChapters.find(c => c.id === idToSave)) {
            idToSave = null;
        }

        let nameToSave = "";
        let isUpdate = false;

        if (idToSave) {
            // MODE UPDATE (Safe karena user melihat tombol UPDATE)
            const existing = existingChapters.find(c => c.id === idToSave);
            nameToSave = existing ? existing.name : "Unknown Chapter";
            isUpdate = true;
        } else {
            // MODE BUAT BARU
            idToSave = generateId();

            if (activeChapterId) {
                const epubTitle = epubChapters.find(c => c.id === activeChapterId)?.title;
                nameToSave = epubTitle || `Chapter ${existingChapters.length + 1}`;
                if (existingChapters.some(s => s.name === nameToSave)) {
                    nameToSave = `${nameToSave} (Copy)`;
                }
            } else {
                const numbers = existingChapters
                    .map(s => {
                        const m = s.name.match(/^Chapter (\d+)$/i);
                        return m ? parseInt(m[1]) : 0;
                    })
                    .filter(n => !isNaN(n));
                
                const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : existingChapters.length + 1;
                nameToSave = `Chapter ${nextNum}`;
            }
        }

        const newTranslation: SavedTranslation = {
          id: idToSave,
          projectId: activeProject.id,
          name: nameToSave,
          translatedText: translatedText,
          timestamp: new Date().toISOString(),
        };
        
        await saveTranslationToDB(newTranslation);
        
        setEditingId(idToSave); 
        setEditingName(nameToSave); // Update nama yang sedang diedit
        
        showToastNotification(isUpdate ? `Updated: ${nameToSave}` : `Saved: ${nameToSave}`);
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

  const EpubChapterModal = () => (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-charcoal/40 backdrop-blur-sm animate-in fade-in">
        <div className="bg-paper w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-border flex justify-between items-center bg-card">
                <div>
                    <h3 className="text-xl font-serif font-bold text-charcoal">Pilih Bab EPUB</h3>
                    <p className="text-xs text-subtle mt-1">{epubChapters.length} bab terdeteksi.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={resetEpub} className="text-red-500 text-xs font-bold px-2">{t('common.reset')}</button>
                    <button onClick={() => setIsEpubModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">✕</button>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar p-2">
                {epubChapters.map((chapter, idx) => {
                    const isActive = activeChapterId === chapter.id;
                    return (
                        <button key={idx} onClick={() => loadChapterToEditor(chapter)} className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 group border ${isActive ? 'bg-accent text-white shadow-md border-accent' : 'hover:bg-gray-100 border-transparent'}`}>
                            <span className={`text-xs font-bold px-2 py-1 rounded-md min-w-[2rem] text-center ${isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>{idx + 1}</span>
                            <div className="flex-grow min-w-0">
                                <span className={`font-serif text-sm truncate block ${isActive ? 'text-white font-bold' : 'text-charcoal'}`}>{chapter.title}</span>
                                {isActive && <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full inline-block mt-1">Sedang Diterjemahkan</span>}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    </div>
  );

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <Toast message={toastMessage} show={showToast} onClose={() => setShowToast(false)} />
      {error && <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm animate-bounce">⚠️ {error}</div>}
      {isTranslationFullscreen && portalRoot && ReactDOM.createPortal(<ReadingModeModal />, portalRoot)}
      {isEpubModalOpen && <EpubChapterModal />}
      
      {/* Hidden File Input for Button Click */}
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
        saveStatus={saveStatus}
        t={t}
      />

      {showApiKeyInput && (
        <div className="glass p-4 md:p-6 rounded-3xl animate-in slide-in-from-top-2 shadow-soft border-l-4 border-accent flex flex-col sm:flex-row gap-3 max-w-full overflow-hidden">
            <input type="password" placeholder={t('editor.apiKeyPlaceholder')} className="flex-grow p-4 rounded-2xl bg-paper/80 border border-border outline-none text-sm transition-all text-charcoal min-w-0" value={tempApiKey} onChange={(e) => setTempApiKey(e.target.value)} />
            <button onClick={() => { updateSettings(prev => ({...prev, apiKeys: {...prev.apiKeys, [settings.activeProvider]: tempApiKey}})); setShowApiKeyInput(false); }} className="bg-charcoal text-paper px-6 py-3 rounded-2xl text-sm font-bold shadow-lg whitespace-nowrap">{t('common.save')}</button>
        </div>
      )}

      {showPromptInput && (
        <div className="bg-gradient-to-r from-[#FFFBF0] to-[#FFF5E6] p-6 rounded-3xl border border-orange-100 animate-in slide-in-from-top-2 shadow-soft">
            <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-bold text-orange-800 uppercase tracking-widest">{t('editor.instruction')}</label>
                <button onClick={handleResetPrompt} className="text-[10px] font-bold text-orange-600 bg-orange-100 px-3 py-1.5 rounded-lg border border-orange-200">↺ Reset Default</button>
            </div>
            <textarea value={tempInstruction} onChange={(e) => setTempInstruction(e.target.value)} className="w-full bg-white/60 p-4 rounded-2xl border border-orange-100 text-charcoal text-sm font-serif leading-relaxed outline-none" rows={2} />
        </div>
      )}

      {epubChapters.length > 0 && !isEpubModalOpen && (
          <div className="flex justify-center -mb-2">
              <button onClick={() => setIsEpubModalOpen(true)} className="bg-orange-50 text-orange-600 px-4 py-1.5 rounded-full text-xs font-bold border border-orange-200 shadow-sm hover:bg-orange-100 animate-in slide-in-from-top-2">{t('editor.backToEpub')}</button>
          </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 md:gap-8">
        {/* SOURCE TEXT AREA WITH DRAG & DROP */}
        <div className="flex flex-col h-full relative group">
          <div className="absolute -top-3 left-6 z-10 pointer-events-none flex items-center gap-2">
               <span className="text-[10px] font-bold text-subtle bg-paper px-3 py-1 uppercase tracking-widest border border-border rounded-md shadow-sm">{t('editor.source')}</span>
          </div>
          
          {/* DRAG & DROP CONTAINER */}
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
            {/* PASTE BUTTON */}
            {!sourceText && !isDragging && !isRestoring && (
                <button 
                    onClick={handlePasteSource} 
                    className="absolute top-4 right-4 z-30 px-3 py-1.5 bg-accent/10 text-accent hover:bg-accent hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                >
                    📋 {t('editor.paste')}
                </button>
            )}

            {/* DRAG OVERLAY */}
            <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center bg-paper/90 backdrop-blur-sm transition-opacity duration-300 pointer-events-none ${isDragging ? 'opacity-100' : 'opacity-0'}`}>
                 <span className="text-5xl mb-4 animate-bounce">📂</span>
                 <p className="text-accent font-bold text-lg">{t('editor.dragDrop')}</p>
                 <p className="text-subtle text-xs">{t('editor.dragDropDesc')}</p>
            </div>

            {/* TEXTAREA (Z-INDEX 20) */}
            <textarea 
                className="w-full h-full p-4 md:p-6 bg-transparent outline-none resize-none text-base md:text-lg font-serif leading-loose text-charcoal custom-scrollbar relative z-20 placeholder-gray-400/50" 
                placeholder={isDragging ? "" : (isRestoring ? t('editor.restoring') : t('editor.placeholder'))}
                value={sourceText} 
                onChange={(e) => setSourceText(e.target.value)}
                disabled={isRestoring}
            />

            {/* EMPTY STATE */}
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
             <button onClick={handleClearSource} className="absolute -top-3 right-4 z-30 p-2 bg-red-100 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm" title="Hapus & Buat Baru">✕</button>
          )}
        </div>

        {/* TRANSLATION OUTPUT AREA */}
        <div className="flex flex-col h-full relative group">
            <div className="absolute -top-3 left-6 z-10 pointer-events-none">
               <span className="text-[10px] font-bold text-accent bg-paper px-3 py-1 uppercase tracking-widest border border-border rounded-md shadow-sm">{t('editor.translation')}</span>
            </div>

            <div 
                className="w-full h-[400px] md:h-[500px] lg:h-[600px] rounded-[2rem] border-2 border-transparent bg-card shadow-soft overflow-hidden relative transition-all"
            >
              {translatedText ? (
                // VIRTUOSO IMPLEMENTATION FOR PERFORMANCE
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
                    increaseViewportBy={500} // Pre-render buffer
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 font-serif italic text-center p-4">
                  {isLoading ? <div className="text-5xl animate-bounce">🍡</div> : <span className="text-6xl mb-6 opacity-20">📖</span>}
                  <span className="text-lg">{isLoading ? t('editor.waiting') : t('editor.emptyState')}</span>
                </div>
              )}
              {/* Loading Indicator */}
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
                <div className="flex items-center gap-1">
                    {/* BUTTON BATAL EDIT MANUAL */}
                    {editingId && (
                        <button 
                            onClick={handleCancelEdit} 
                            className="bg-red-100 text-red-500 hover:bg-red-500 hover:text-white px-3 md:px-4 py-3.5 md:py-4 rounded-xl font-bold transition-all flex items-center justify-center shadow-soft h-full"
                            title="Batal Edit (Buat Baru)"
                        >
                            ✕
                        </button>
                    )}
                    <button 
                      disabled={isLoading || isSaving || !translatedText.trim()} 
                      onClick={handleSaveTranslation} 
                      className={`px-6 md:px-8 py-3.5 md:py-4 font-bold text-sm rounded-xl transition-all disabled:opacity-50 shadow-soft border border-border flex items-center gap-2 ${editingId ? 'bg-accent text-white hover:bg-accentHover' : 'bg-paper text-charcoal hover:bg-gray-200'}`}
                    >
                        {isSaving ? (
                          <>
                            <div className="w-3 h-3 border-2 border-charcoal border-t-transparent rounded-full animate-spin"></div>
                            <span>{t('editor.saving')}</span>
                          </>
                        ) : (
                          <div className="flex flex-col items-start leading-none">
                             <span>{editingId ? 'UPDATE' : t('editor.save')}</span>
                             {editingId && editingName && <span className="text-[9px] opacity-80 max-w-[100px] truncate">{editingName}</span>}
                          </div>
                        )}
                    </button>
                </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default TranslationInterface;
