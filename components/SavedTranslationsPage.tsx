
import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { SavedTranslation, SavedTranslationSummary } from '../types';
import ConfirmDialog from './ConfirmDialog'; 
import { 
    getTranslationSummariesByProjectId, 
    getTranslationById, 
    getTranslationsByIds,
    saveTranslationToDB, 
    deleteTranslationFromDB, 
    clearProjectTranslationsFromDB 
} from '../utils/storage';
import { triggerDownload } from '../utils/fileSystem';
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';

const ITEMS_PER_PAGE = 12;

export default function SavedTranslationsPage() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  
  const [localSummaries, setLocalSummaries] = useState<SavedTranslationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingEpub, setIsGeneratingEpub] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  
  const [searchTerm, setSearchTerm] = useState('');
  // DEFAULT SORT: Oldest (Natural Order) agar Chapter 1, 2, 3 urut dari awal.
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'a-z' | 'z-a'>('oldest'); 
  const [currentPage, setCurrentPage] = useState(1);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [isReadingFullScreen, setIsReadingFullScreen] = useState<boolean>(false); 
  const [currentReadingTranslation, setCurrentReadingTranslation] = useState<SavedTranslation | null>(null); 
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [tempContent, setTempContent] = useState('');
  const [nextChapterSummary, setNextChapterSummary] = useState<SavedTranslationSummary | null>(null);

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [confirmDeleteTargetId, setConfirmDeleteTargetId] = useState<string | null>(null);
  const [isConfirmClearAllOpen, setIsConfirmClearAllOpen] = useState(false);

  const readingContainerRef = useRef<HTMLDivElement>(null);
  const portalRoot = document.getElementById('portal-root');

  const activeProjectId = settings.activeProjectId;
  const activeProject = settings.projects.find(p => p.id === activeProjectId);
  const projectName = activeProject ? activeProject.name : 'Unknown Project';

  const fetchData = useCallback(async () => {
      setIsLoading(true);
      try {
          const data = await getTranslationSummariesByProjectId(activeProjectId);
          setLocalSummaries(data);
      } catch (e) {
          console.error("Failed to fetch DB", e);
      } finally {
          setIsLoading(false);
      }
  }, [activeProjectId]);

  useEffect(() => {
      fetchData();
  }, [fetchData]);

  const filteredAndSortedData = useMemo(() => {
    let data = [...localSummaries]; 

    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        data = data.filter(item => item.name.toLowerCase().includes(lower));
    }

    // NATURAL NUMERIC SORTING (1, 2, 10 instead of 1, 10, 2)
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    data.sort((a, b) => {
        if (sortOrder === 'newest') return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        // Logika Oldest: Urutkan berdasarkan angka bab atau waktu terlama
        if (sortOrder === 'oldest') {
            if (a.chapterNumber && b.chapterNumber) {
                return a.chapterNumber - b.chapterNumber;
            }
            const res = collator.compare(a.name, b.name);
            return res !== 0 ? res : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }
        if (sortOrder === 'a-z') return collator.compare(a.name, b.name);
        if (sortOrder === 'z-a') return collator.compare(b.name, a.name);
        return 0;
    });

    return data;
  }, [localSummaries, searchTerm, sortOrder]);

  const currentDisplayData = useMemo(() => {
      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      return filteredAndSortedData.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAndSortedData, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedData.length / ITEMS_PER_PAGE);

  useEffect(() => {
      setCurrentPage(1);
  }, [searchTerm, sortOrder, activeProjectId]);

  useEffect(() => {
    if (currentReadingTranslation && filteredAndSortedData.length > 0) {
        const currentIndex = filteredAndSortedData.findIndex(item => item.id === currentReadingTranslation.id);
        if (currentIndex !== -1 && currentIndex < filteredAndSortedData.length - 1) {
            setNextChapterSummary(filteredAndSortedData[currentIndex + 1]);
        } else {
            setNextChapterSummary(null);
        }
    }
  }, [currentReadingTranslation, filteredAndSortedData]);

  const toggleSelectionMode = () => {
      setIsSelectionMode(!isSelectionMode);
      setSelectedIds(new Set()); 
  };

  const toggleSelectItem = (id: string) => {
      setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const selectAllVisible = () => {
      const ids = filteredAndSortedData.map(i => i.id);
      setSelectedIds(new Set(ids));
  };

  const getPreparedDataForDownload = async () => {
      let itemsToProcess = selectedIds.size > 0 
          ? localSummaries.filter(s => selectedIds.has(s.id))
          : filteredAndSortedData;

      if (itemsToProcess.length === 0) return [];

      // Always sort naturally for output to ensure Ch 1, 2, 10 order
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      itemsToProcess.sort((a, b) => collator.compare(a.name, b.name));

      const ids = itemsToProcess.map(s => s.id);
      return await getTranslationsByIds(ids);
  };

  const handleRename = async (id: string, newName: string) => {
    const safeName = newName.trim() || `Translation ${id.slice(0, 4)}`;
    setLocalSummaries(prev => prev.map(item => 
        item.id === id ? { ...item, name: safeName } : item
    ));

    const fullItem = await getTranslationById(id);
    if (fullItem) {
        await saveTranslationToDB({ ...fullItem, name: safeName });
    }
    setEditingId(null);
    setEditingName('');
  };

  const openDeleteConfirmation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    setConfirmDeleteTargetId(id);
    setIsConfirmDeleteOpen(true);
  };

  const performDelete = async () => {
    if (!confirmDeleteTargetId) return; 
    const idToDelete = confirmDeleteTargetId;
    setLocalSummaries(prev => prev.filter(item => item.id !== idToDelete));
    await deleteTranslationFromDB(idToDelete);
    setConfirmDeleteTargetId(null);
    setIsConfirmDeleteOpen(false); 
  };

  const performClearAll = async () => {
    setLocalSummaries([]);
    await clearProjectTranslationsFromDB(activeProjectId);
    setSelectedIds(new Set());
    setIsConfirmClearAllOpen(false); 
  };

  const handleDownloadAllTxt = async () => {
    if (localSummaries.length === 0) return;
    setIsGeneratingEpub(true);
    try {
        const fullData = await getPreparedDataForDownload();
        const fileContent = fullData.map(item => {
            return `[${item.name}]\n${item.translatedText}\n\n========================================\n\n`;
        }).join('\n');
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const filename = `${projectName.replace(/\s+/g, '_')}_Export.txt`;
        await triggerDownload(filename, blob);
    } catch (e) {
        alert("Gagal menyiapkan download.");
    } finally {
        setIsGeneratingEpub(false);
    }
  };

  const handleDownloadEpub = async () => {
    if (!activeProject || localSummaries.length === 0) return;
    setIsGeneratingEpub(true);
    try {
        const fullData = await getPreparedDataForDownload();
        const { generateEpub } = await import('../utils/epubGenerator');
        const blob = await generateEpub(activeProject, fullData);
        const filename = `${projectName.replace(/\s+/g, '_')}.epub`;
        await triggerDownload(filename, blob);
    } catch (e) {
        alert("Gagal membuat EPUB.");
    } finally {
        setIsGeneratingEpub(false);
    }
  };

  const loadChapterContent = async (id: string) => {
    setIsLoadingContent(true);
    try {
        const fullData = await getTranslationById(id);
        if (fullData) {
            setCurrentReadingTranslation(fullData);
            setTempContent(fullData.translatedText);
            setIsEditingContent(false);
        } else {
            alert("Error: Konten tidak ditemukan.");
        }
    } catch (e) {
        alert("Error loading chapter.");
    } finally {
        setIsLoadingContent(false);
    }
  };

  const handleOpenReadingFullScreen = async (summary: SavedTranslationSummary) => {
    if (isSelectionMode) {
        toggleSelectItem(summary.id);
        return;
    }
    await loadChapterContent(summary.id);
    setIsReadingFullScreen(true);
    document.body.style.overflow = 'hidden';
  };

  const handleCloseReadingFullScreen = () => {
    if (currentReadingTranslation) {
         localStorage.removeItem(`novtl_read_pos_${currentReadingTranslation.id}`);
    }
    setIsEditingContent(false);
    setIsReadingFullScreen(false);
    setCurrentReadingTranslation(null);
    document.body.style.overflow = 'auto';
  };

  const handleNextChapter = async () => {
      if (nextChapterSummary) {
          if (currentReadingTranslation) {
              localStorage.removeItem(`novtl_read_pos_${currentReadingTranslation.id}`);
          }
          await loadChapterContent(nextChapterSummary.id);
      }
  };

  const handleDownloadReading = async () => {
    if (currentReadingTranslation) {
      const blob = new Blob([currentReadingTranslation.translatedText], { type: 'text/plain' });
      await triggerDownload(`${currentReadingTranslation.name}.txt`, blob);
    }
  };

  const handleDownloadReadingEpub = async () => {
    if (!currentReadingTranslation || !activeProject) return;
    try {
        const { generateEpub } = await import('../utils/epubGenerator');
        const blob = await generateEpub(activeProject, [currentReadingTranslation]);
        await triggerDownload(`${currentReadingTranslation.name}.epub`, blob);
    } catch (e) {
        console.error("Failed single epub", e);
    }
  };

  const handleSaveContentEdit = async () => {
      if (!currentReadingTranslation) return;
      const updatedText = tempContent;
      const updatedItem = { ...currentReadingTranslation, translatedText: updatedText };
      await saveTranslationToDB(updatedItem);
      setCurrentReadingTranslation(updatedItem);
      setIsEditingContent(false);
  };

  const ReadingModeModal = () => {
      useLayoutEffect(() => {
        if (currentReadingTranslation && readingContainerRef.current) {
            const savedPos = localStorage.getItem(`novtl_read_pos_${currentReadingTranslation.id}`);
            if (savedPos) {
                const pos = parseInt(savedPos, 10);
                if (!isNaN(pos)) {
                    readingContainerRef.current.scrollTop = pos;
                }
            }
        }
      }, []);

      const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
          if (!currentReadingTranslation) return;
          const target = e.currentTarget;
          localStorage.setItem(`novtl_read_pos_${currentReadingTranslation.id}`, target.scrollTop.toString());
      };

      return (
        <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[10000] bg-paper overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 m-0 p-0 border-none outline-none">
            <div className="absolute top-0 left-0 right-0 z-[10001] bg-paper/80 backdrop-blur-sm border-b border-border/20 shadow-sm">
                <div className="flex justify-between items-center p-4 max-w-5xl mx-auto w-full">
                    <div className="flex flex-col overflow-hidden">
                        <h2 className="text-lg md:text-xl font-serif font-bold text-charcoal truncate max-w-[200px] md:max-w-md">
                            {currentReadingTranslation!.name}
                        </h2>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {isEditingContent ? (
                            <button onClick={handleSaveContentEdit} className="bg-accent text-white px-4 py-2 rounded-lg font-bold text-xs shadow-md">{t('common.save')}</button>
                        ) : (
                            <div className="flex items-center gap-2 bg-card/80 p-1 rounded-full border border-border shadow-sm">
                                <button onClick={() => setIsEditingContent(true)} className="p-2 text-charcoal hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors" title="Edit Content">✎</button>
                                <button onClick={handleDownloadReadingEpub} className="p-2 text-charcoal hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors" title="Download EPUB">⤓ EPUB</button>
                                <button onClick={handleDownloadReading} className="p-2 text-charcoal hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors" title="Download TXT">⤓ TXT</button>
                            </div>
                        )}
                        <button 
                            onClick={handleCloseReadingFullScreen} 
                            className="bg-charcoal text-paper w-8 h-8 md:w-10 md:h-10 rounded-full font-bold hover:opacity-80 transition flex items-center justify-center ml-2 shadow-lg"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            </div>
            <div 
                ref={readingContainerRef} 
                onScroll={handleScroll}
                className="flex-grow overflow-y-auto w-full h-full pt-24 px-4 md:px-0 custom-scrollbar scroll-smooth"
            >
                <div className="max-w-3xl mx-auto min-h-full">
                    {isEditingContent ? (
                        <div className="pt-8">
                            <textarea 
                                value={tempContent}
                                onChange={(e) => setTempContent(e.target.value)}
                                className="w-full h-[70vh] p-6 text-lg font-serif leading-loose outline-none resize-none bg-card rounded-xl border border-border focus:border-accent shadow-inner-light text-charcoal"
                            />
                        </div>
                    ) : (
                        <article className="prose prose-lg md:prose-xl max-w-none font-serif leading-loose text-justify text-charcoal selection:bg-accent/20 dark:prose-invert">
                            {currentReadingTranslation!.translatedText.split('\n').map((para, i) => (
                                para.trim() ? <p key={i} className="mb-6 indent-8">{para}</p> : <br key={i}/>
                            ))}
                        </article>
                    )}
                    {!isEditingContent && (
                        <div className="mt-24 pt-12 border-t border-border text-center pb-24">
                            {nextChapterSummary ? (
                                <div>
                                    <p className="text-subtle text-sm mb-4 uppercase tracking-widest font-bold">{t('library.continueReading')}</p>
                                    <button 
                                        onClick={handleNextChapter}
                                        className="group relative inline-flex items-center justify-center px-8 py-5 font-serif font-bold text-paper transition-all duration-200 bg-charcoal font-lg rounded-2xl hover:bg-accent hover:shadow-glow hover:-translate-y-1 w-full md:w-auto"
                                    >
                                        <span className="mr-2">📖</span>
                                        <span>{nextChapterSummary.name}</span>
                                        <svg className="w-5 h-5 ml-2 -mr-1 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="text-subtle italic opacity-50">
                                    <p>{t('library.endOfCollection')}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
      );
  };

  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-500 min-h-screen relative">
      
      {isLoadingContent && (
          <div className="fixed inset-0 z-[10000] bg-black/20 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-card p-6 rounded-2xl shadow-xl flex items-center gap-4">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-bold text-charcoal">{t('common.loading')}</span>
              </div>
          </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100 dark:border-gray-800">
        <div className="w-full md:w-auto">
           <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-accent bg-paper px-3 py-1 rounded-full border border-border shadow-sm">
                    {t('library.bookshelf')}
                </span>
           </div>
           <h2 className="text-3xl md:text-4xl font-serif font-bold text-charcoal flex items-center gap-3">
            {projectName}
          </h2>
          <p className="text-subtle mt-2 font-sans text-sm">
            {isLoading ? t('common.loading') : `${localSummaries.length} ${t('library.chapters')}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={toggleSelectionMode}
            className={`px-5 py-3 border rounded-xl font-bold transition flex items-center gap-2 text-xs md:text-sm ${
                isSelectionMode 
                ? 'bg-accent text-white border-accent shadow-glow' 
                : 'bg-card text-charcoal border-border hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {isSelectionMode ? `${t('library.done')} (${selectedIds.size})` : t('library.selectChapters')}
          </button>

          <button
            onClick={handleDownloadEpub}
            disabled={localSummaries.length === 0 || isLoading || isGeneratingEpub}
            className="px-5 py-3 bg-indigo-600 text-white border border-indigo-600 rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-xs md:text-sm flex items-center gap-2 shadow-lg shadow-indigo-200/20"
          >
            <span>
                {isGeneratingEpub 
                    ? t('library.generating') 
                    : (selectedIds.size > 0 ? `EPUB (${selectedIds.size})` : t('library.downloadEpub'))
                }
            </span>
          </button>

          <button
            onClick={handleDownloadAllTxt}
            disabled={localSummaries.length === 0 || isLoading || isGeneratingEpub}
            className="px-5 py-3 bg-card text-charcoal border border-border rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50 text-xs md:text-sm flex items-center gap-2 shadow-sm"
          >
            TXT {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
        </div>
      </div>

      {localSummaries.length > 0 && (
        <div className="glass p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between sticky top-4 z-30 transition-all shadow-soft">
            <div className="relative w-full md:w-1/2 lg:w-1/3">
                <input 
                    type="text" 
                    placeholder={t('library.search')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-paper/50 dark:bg-black/20 border border-transparent rounded-xl focus:outline-none focus:bg-card focus:shadow-glow text-sm transition-all text-charcoal placeholder-subtle"
                />
            </div>

            <div className="flex w-full md:w-auto gap-3 items-center justify-between md:justify-end">
                {isSelectionMode && (
                    <button onClick={selectAllVisible} className="text-xs font-bold text-accent hover:underline">
                        {t('library.selectAllVisible')}
                    </button>
                )}
                
                <select 
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as any)}
                    className="px-4 py-3 bg-card border border-transparent rounded-xl text-sm font-bold text-charcoal focus:outline-none cursor-pointer flex-grow md:flex-grow-0 hover:bg-white/80 dark:hover:bg-border"
                >
                    <option value="oldest">{t('library.sort.oldest')}</option>
                    <option value="newest">{t('library.sort.newest')}</option>
                    <option value="a-z">{t('library.sort.az')}</option>
                    <option value="z-a">{t('library.sort.za')}</option>
                </select>
            </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-24">
             <div className="w-10 h-10 border-4 border-gray-200 border-t-accent rounded-full animate-spin"></div>
        </div>
      ) : filteredAndSortedData.length === 0 ? (
        <div className="text-center py-24 bg-card/30 dark:bg-card/5 rounded-[3rem] border-2 border-dashed border-border">
          <p className="text-6xl mb-6 opacity-30 grayscale">📚</p>
          <p className="text-subtle font-serif text-xl italic">{t('library.emptyTitle')}</p>
        </div>
      ) : (
        <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8 perspective-1000">
                {currentDisplayData.map(item => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                        <div 
                        key={item.id} 
                        className={`group relative cursor-pointer transform transition-all duration-300 ${
                            isSelectionMode 
                                ? (isSelected ? 'scale-[0.98]' : 'scale-100 hover:scale-[1.02]') 
                                : 'hover:-translate-y-2 hover:rotate-1'
                        }`}
                        onClick={() => handleOpenReadingFullScreen(item)}
                        >
                            {isSelectionMode && (
                                <div className={`absolute -top-3 -right-3 z-30 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all ${isSelected ? 'bg-accent scale-110' : 'bg-card border-2 border-border'}`}>
                                    {isSelected && <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                            )}

                            <div className={`absolute inset-0 rounded-2xl z-0 transition-all ${isSelectionMode && isSelected ? 'ring-4 ring-accent/30 bg-accent/5' : ''}`}></div>

                            <div className="absolute left-0 top-1 bottom-1 w-3 bg-gray-900/10 dark:bg-white/5 z-0 rounded-l-md blur-[1px]"></div>
                            <div className="bg-card aspect-[2/3] rounded-r-2xl rounded-l-md shadow-lg group-hover:shadow-xl border-l-4 border-border overflow-hidden relative transition-all duration-500 flex flex-col">
                                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-200/50 dark:from-black/10 to-transparent z-10 pointer-events-none"></div>
                                <div className="p-5 flex-grow flex flex-col relative z-20">
                                    <div className="text-[9px] font-bold text-accent tracking-widest uppercase mb-3 opacity-80">
                                        {new Date(item.timestamp).toLocaleDateString()}
                                    </div>
                                    
                                    {editingId === item.id ? (
                                        <form onClick={e => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); handleRename(item.id, editingName); }} className="mb-auto">
                                            <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} onBlur={() => handleRename(item.id, editingName)} autoFocus className="w-full bg-gray-50 dark:bg-gray-800 border-b-2 border-accent focus:outline-none text-charcoal font-serif font-bold text-lg p-1" />
                                        </form>
                                    ) : (
                                        <h3 className="font-serif font-bold text-lg md:text-xl text-charcoal mb-2 leading-tight line-clamp-3 group-hover:text-accent transition-colors">
                                            {item.name}
                                        </h3>
                                    )}
                                </div>
                                
                                {!isSelectionMode && (
                                    <div className="p-3 border-t border-border flex justify-between items-center bg-gray-50/50 dark:bg-black/20 backdrop-blur-sm z-20">
                                        <button onClick={(e) => { e.stopPropagation(); setEditingId(item.id); setEditingName(item.name); }} className="p-2 text-gray-400 hover:text-charcoal hover:bg-card rounded-lg transition-all" title="Rename"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                        <button onClick={(e) => openDeleteConfirmation(item.id, e)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                     <button 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => p - 1)}
                        className="px-4 py-2 rounded-xl bg-card border border-border disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 font-bold text-xs"
                     >
                        &larr; Prev
                     </button>
                     <span className="px-4 py-2 text-sm font-bold text-subtle flex items-center">
                        Page {currentPage} of {totalPages}
                     </span>
                     <button 
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => p + 1)}
                        className="px-4 py-2 rounded-xl bg-card border border-border disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 font-bold text-xs"
                     >
                        Next &rarr;
                     </button>
                </div>
            )}
        </>
      )}

      {isReadingFullScreen && currentReadingTranslation && portalRoot && ReactDOM.createPortal(
        <ReadingModeModal />,
        portalRoot
      )}

      <ConfirmDialog isOpen={isConfirmDeleteOpen} onClose={() => setIsConfirmDeleteOpen(false)} onConfirm={performDelete} title={t('library.confirmDeleteTitle')} message={t('library.confirmDeleteMsg')} isDestructive={true} />
      <ConfirmDialog isOpen={isConfirmClearAllOpen} onClose={() => setIsConfirmClearAllOpen(false)} onConfirm={performClearAll} title={t('library.confirmClearTitle')} message={t('library.confirmClearMsg')} isDestructive={true} />

    </div>
  );
}
