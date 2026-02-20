
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AppSettings, GlossaryItem, NovelProject } from '../types';
import { LLM_PROVIDERS, PROVIDER_MODELS, DEFAULT_MODELS } from '../constants'; 
import ConfirmDialog from './ConfirmDialog'; 
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { dbService } from '../services/DatabaseService';
import { getTranslationsByProjectId, saveTranslationToDB, saveGlossaryToDB } from '../utils/storage';
import { triggerDownload } from '../utils/fileSystem';
import { fetchAvailableModels } from '../services/llmService';

const API_KEY_LINKS: Record<string, string> = {
    'Gemini': 'https://aistudio.google.com/app/apikey',
    'OpenAI (GPT)': 'https://platform.openai.com/api-keys',
    'DeepSeek': 'https://platform.deepseek.com/api_keys',
    'Grok (xAI)': 'https://console.x.ai/',
    'OpenRouter': 'https://openrouter.ai/keys'
};

const SettingsPage: React.FC = () => {
  const { settings, updateSettings, updateProject, activeProject } = useSettings();
  const { language, setLanguage, t } = useLanguage();
  const portalRoot = document.getElementById('portal-root');

  const [newWord, setNewWord] = useState('');
  const [newTrans, setNewTrans] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isConfirmDeleteProjectOpen, setIsConfirmDeleteProjectOpen] = useState(false);
  const [isConfirmDeleteGlossaryOpen, setIsConfirmDeleteGlossaryOpen] = useState(false);
  const [glossaryItemToDeleteId, setGlossaryItemToDeleteId] = useState<string | null>(null);
  const [isConfirmBulkDeleteOpen, setIsConfirmBulkDeleteOpen] = useState(false);
  const [glossarySearchTerm, setGlossarySearchTerm] = useState('');
  const [isCleaningCache, setIsCleaningCache] = useState(false);
  
  // Model Fetching State
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      setSelectedIds(new Set());
      setIsRenaming(false);
  }, []);

  const handleOpenAddModel = async () => {
      const apiKey = settings.apiKeys[settings.activeProvider];
      if (!apiKey) {
          alert(t('settings.ai.apiKey') + " Missing!");
          return;
      }

      setIsFetchingModels(true);
      try {
          const models = await fetchAvailableModels(settings.activeProvider, apiKey);
          if (models.length > 0) {
              setFetchedModels(models);
              setIsModelModalOpen(true);
          } else {
              alert("No models found. Check your API Key.");
          }
      } catch (e: any) {
          alert(`Failed to fetch models: ${e.message}`);
      } finally {
          setIsFetchingModels(false);
      }
  };

  const handleAddModel = (modelId: string) => {
      const provider = settings.activeProvider;
      const currentCustoms = settings.customModels?.[provider] || [];
      
      if (currentCustoms.includes(modelId)) {
          alert("Model already added!");
          return;
      }

      updateSettings(prev => ({
          ...prev,
          customModels: {
              ...prev.customModels,
              [provider]: [...currentCustoms, modelId]
          }
      }));
      
      // Auto-select the new model
      updateModel(provider, modelId);
      setIsModelModalOpen(false);
  };

  // Combine default and custom models
  const currentProviderModels = [
      ...(PROVIDER_MODELS[settings.activeProvider] || []),
      ...(settings.customModels?.[settings.activeProvider] || [])
  ];

  const updateGlobalSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    updateSettings({ [key]: value });
  };

  const updateApiKey = (provider: string, key: string) => {
    updateSettings(prev => ({
      ...prev,
      apiKeys: { ...prev.apiKeys, [provider]: key }
    }));
  };

  const updateModel = (provider: string, model: string) => {
    updateSettings(prev => ({
      ...prev,
      selectedModel: { ...prev.selectedModel, [provider]: model }
    }));
  };

  const toggleTheme = () => {
      updateSettings(prev => ({
          ...prev,
          theme: prev.theme === 'dark' ? 'light' : 'dark'
      }));
  };

  const handleCreateProject = () => {
    if(newProjectName) { 
        const id = crypto.randomUUID();
        const newProject: NovelProject = { 
            ...activeProject, 
            id, 
            name: newProjectName, 
            glossary: [] 
        };
        updateSettings(prev => ({
            ...prev,
            activeProjectId: id,
            projects: [...prev.projects, newProject]
        }));
        setNewProjectName('');
        setIsCreatingProject(false); 
    }
  };

  const handleDeleteProject = () => {
      if (settings.projects.length <= 1) {
          alert(t('settings.project.deleteConfirm'));
          setIsConfirmDeleteProjectOpen(false);
          return;
      }
      updateSettings(prev => {
          const remainingProjects = prev.projects.filter(p => p.id !== activeProject.id);
          return {
              ...prev,
              projects: remainingProjects,
              activeProjectId: remainingProjects[0].id 
          };
      });
      setIsConfirmDeleteProjectOpen(false);
  };

  const handleStartRename = () => {
      setRenameValue(activeProject.name);
      setIsRenaming(true);
  };

  const handleSaveRename = () => {
      if (renameValue.trim()) {
          updateProject(activeProject.id, { name: renameValue.trim() });
          setIsRenaming(false);
      }
  };

  const addGlossaryItem = (original: string, translated: string) => {
    const newItem: GlossaryItem = {
      id: crypto.randomUUID(),
      original,
      translated,
      sourceLanguage: activeProject.sourceLanguage, 
    };
    updateProject(activeProject.id, prev => ({ ...prev, glossary: [...prev.glossary, newItem] }));
  };

  const handleClearCache = async () => {
      if(confirm(t('settings.storage.resetCacheDesc'))) {
          setIsCleaningCache(true);
          await dbService.wipeAllData();
          setIsCleaningCache(false);
          // Force reload to rebuild state
          window.location.reload();
      }
  }

  const handleExportProject = async () => {
      try {
        const project = activeProject;
        const translations = await getTranslationsByProjectId(project.id);
        const backupData = {
            version: 1,
            timestamp: new Date().toISOString(),
            type: 'NOVTL_PROJECT_BACKUP',
            project: project,
            translations: translations
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
        const safeName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        await triggerDownload(`backup_${safeName}.json`, blob);
      } catch (e) {
        alert(t('settings.storage.failImport'));
      }
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const text = e.target?.result as string;
              const data = JSON.parse(text);
              const newProjectId = crypto.randomUUID();
              const importedProject = { ...data.project, id: newProjectId, name: `${data.project.name} (Restored)` };
              updateSettings(prev => ({ ...prev, projects: [...prev.projects, importedProject], activeProjectId: newProjectId }));
              await saveGlossaryToDB(newProjectId, importedProject.glossary);
              for (const t of data.translations) {
                  await saveTranslationToDB({ ...t, projectId: newProjectId });
              }
              alert(t('settings.storage.successImport'));
          } catch (err) {
              alert(t('settings.storage.failImport'));
          } finally {
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  const filteredGlossary = activeProject.glossary.filter(item => 
    item.original.toLowerCase().includes(glossarySearchTerm.toLowerCase()) || 
    item.translated.toLowerCase().includes(glossarySearchTerm.toLowerCase())
  );

  // --- GLOSSARY SELECTION LOGIC ---
  const handleSelectAll = () => {
      if (selectedIds.size === filteredGlossary.length) {
          setSelectedIds(new Set()); // Deselect All
      } else {
          setSelectedIds(new Set(filteredGlossary.map(i => i.id))); // Select All Visible
      }
  };

  const handleToggleSelect = (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full overflow-hidden">
      
      {/* 1. PROJECT SELECTOR */}
      <section className="glass p-6 md:p-8 rounded-3xl shadow-soft relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-charcoal"></div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10 mb-6">
            <div className="w-full">
                <h2 className="text-xl md:text-2xl font-serif font-bold flex items-center gap-2 text-charcoal">
                   📂 {t('settings.project.title')}
                </h2>
                <p className="text-subtle text-xs mt-1 tracking-wide">{t('settings.project.desc')}</p>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
                <button onClick={toggleTheme} className={`flex items-center justify-center p-2 rounded-xl border transition-all ${settings.theme === 'dark' ? 'bg-charcoal text-yellow-400 border-paper/10' : 'bg-white text-gray-400 border-gray-200'}`}>
                    {settings.theme === 'dark' ? '🌙' : '☀️'}
                </button>
                <div className="flex items-center bg-card rounded-xl p-1 shadow-sm border border-border">
                    <button onClick={() => setLanguage('en')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'en' ? 'bg-charcoal text-paper shadow-md' : 'text-subtle'}`}>EN</button>
                    <button onClick={() => setLanguage('id')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'id' ? 'bg-charcoal text-paper shadow-md' : 'text-subtle'}`}>ID</button>
                </div>
                <button onClick={() => setIsCreatingProject(true)} className="bg-charcoal text-paper px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all whitespace-nowrap">{t('settings.project.new')}</button>
                
                {isCreatingProject && portalRoot && createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-paper w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4 relative">
                            <h3 className="text-lg font-bold text-charcoal">{t('settings.project.new')}</h3>
                            <input 
                                type="text" 
                                placeholder={t('settings.project.placeholder')} 
                                className="w-full p-3 rounded-xl bg-card text-charcoal text-sm border-2 border-accent outline-none" 
                                value={newProjectName} 
                                onChange={e => setNewProjectName(e.target.value)} 
                                autoFocus 
                            />
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setIsCreatingProject(false)} className="flex-1 bg-gray-200 text-charcoal px-4 py-3 rounded-xl text-sm font-bold hover:bg-gray-300 transition-colors">{t('common.cancel')}</button>
                                <button onClick={handleCreateProject} className="flex-1 bg-accent text-white px-4 py-3 rounded-xl text-sm font-bold shadow-glow hover:bg-accent/90 transition-colors">{t('common.ok')}</button>
                            </div>
                        </div>
                    </div>,
                    portalRoot
                )}
            </div>
        </div>

        <div className="flex flex-col gap-4 relative z-10">
            <div className="flex flex-col sm:flex-row gap-3 items-center">
                {isRenaming ? (
                     <div className="relative flex-grow w-full flex gap-2 animate-in fade-in duration-200">
                        <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="w-full p-4 rounded-2xl bg-card border-2 border-accent text-charcoal font-bold outline-none" autoFocus />
                        <button onClick={handleSaveRename} className="bg-accent text-white px-4 rounded-xl font-bold shadow-md">✓</button>
                        <button onClick={() => setIsRenaming(false)} className="bg-gray-200 text-charcoal px-4 rounded-xl font-bold">✕</button>
                     </div>
                ) : (
                    <div className="relative flex-grow w-full flex gap-2">
                        <select value={activeProject.id} onChange={(e) => updateGlobalSetting('activeProjectId', e.target.value)} className="w-full p-4 pl-5 rounded-2xl bg-card border border-border text-charcoal font-bold outline-none appearance-none cursor-pointer shadow-inner-light">
                            {settings.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button onClick={handleStartRename} className="px-4 py-4 bg-card border border-border text-gray-500 rounded-2xl hover:bg-accent hover:text-white transition-all">✎</button>
                        {settings.projects.length > 1 && (
                            <button onClick={() => setIsConfirmDeleteProjectOpen(true)} className="px-4 py-4 bg-card border border-red-100 text-red-400 rounded-2xl hover:bg-red-500 hover:text-white transition-all">🗑</button>
                        )}
                    </div>
                )}
            </div>
        </div>
      </section>

      {/* GLOSSARY (REDESIGNED & FIXED THEME) */}
      <section className="glass-card p-6 md:p-8 rounded-3xl shadow-soft space-y-6 border-l-4 border-charcoal">
        
        {/* Header Glosarium */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-border">
            <div>
                <h2 className="text-xl font-serif font-bold text-charcoal flex items-center gap-2">
                    📖 {t('settings.glossary.title')}
                </h2>
                <p className="text-subtle text-xs mt-1">{t('settings.glossary.desc')}</p>
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto">
                {filteredGlossary.length > 0 && (
                    <button 
                        onClick={handleSelectAll} 
                        className="px-4 py-2 text-xs font-bold text-subtle hover:text-charcoal bg-card border border-border rounded-xl transition-all"
                    >
                        {selectedIds.size === filteredGlossary.length ? t('settings.glossary.deselectAll') : t('settings.glossary.selectAll')}
                    </button>
                )}

                {selectedIds.size > 0 ? (
                    <div className="flex gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                        <button onClick={() => setSelectedIds(new Set())} className="bg-gray-200 dark:bg-gray-800 text-charcoal px-4 py-2 rounded-xl font-bold text-xs hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
                            {t('settings.glossary.deselectAll')}
                        </button>
                        <button onClick={() => setIsConfirmBulkDeleteOpen(true)} className="bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg hover:bg-red-600 transition-colors">
                            {t('settings.glossary.deleteSelected')} ({selectedIds.size})
                        </button>
                    </div>
                ) : (
                    <div className="relative w-full md:w-48">
                        <input 
                            type="text" 
                            placeholder={t('settings.glossary.searchPlaceholder')} 
                            value={glossarySearchTerm}
                            onChange={(e) => setGlossarySearchTerm(e.target.value)}
                            className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs outline-none focus:border-accent transition-colors text-charcoal"
                        />
                    </div>
                )}
            </div>
        </div>

        {/* Input Form Baru (THEME AWARE) */}
        <div className="bg-gray-100 dark:bg-black p-4 rounded-2xl border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row items-center gap-3 shadow-inner">
          <input 
            type="text" 
            placeholder={t('settings.glossary.sourcePlaceholder')} 
            className="flex-grow w-full md:w-auto p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-charcoal dark:text-white text-sm outline-none focus:border-accent placeholder-gray-500 font-medium" 
            value={newWord} 
            onChange={(e) => setNewWord(e.target.value)} 
          />
          <span className="text-gray-500">➜</span>
          <input 
            type="text" 
            placeholder={t('settings.glossary.targetPlaceholder')} 
            className="flex-grow w-full md:w-auto p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-charcoal dark:text-white text-sm outline-none focus:border-accent placeholder-gray-500 font-medium" 
            value={newTrans} 
            onChange={(e) => setNewTrans(e.target.value)} 
          />
          <button 
            onClick={() => { if(newWord && newTrans) { addGlossaryItem(newWord, newTrans); setNewWord(''); setNewTrans(''); }}} 
            className="w-full md:w-auto bg-charcoal text-paper px-6 py-3 rounded-xl font-bold text-sm shadow-lg border-2 border-transparent hover:border-charcoal hover:bg-paper hover:text-charcoal active:scale-95 transition-all whitespace-nowrap"
          >
            {t('settings.glossary.add')}
          </button>
        </div>

        {/* Daftar Kata (List Style Baru - THEME AWARE) */}
        <div className="max-h-[400px] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
            {filteredGlossary.map(item => (
                <div key={item.id} className="group flex items-center gap-4 p-4 rounded-xl border bg-white dark:bg-[#1e293b] border-gray-200 dark:border-[#334155] hover:border-accent transition-all shadow-sm">
                    {/* Checkbox */}
                    <div className="relative flex items-center">
                        <input 
                            type="checkbox" 
                            checked={selectedIds.has(item.id)} 
                            onChange={() => handleToggleSelect(item.id)} 
                            className="peer w-5 h-5 cursor-pointer appearance-none rounded border-2 border-gray-400 dark:border-gray-500 checked:bg-accent checked:border-accent transition-all"
                        />
                        <svg className="absolute w-3.5 h-3.5 pointer-events-none hidden peer-checked:block text-white left-[3px]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>

                    {/* Content */}
                    <div className="flex-grow flex flex-col sm:flex-row sm:items-center gap-2 font-serif text-charcoal dark:text-gray-200 text-base">
                        <span className="font-medium tracking-wide opacity-90 select-all">{item.original}</span>
                        <span className="text-gray-400 hidden sm:inline text-xs">➜</span>
                        <span className="font-bold text-charcoal dark:text-white bg-gray-100 dark:bg-[#0f172a] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm select-all">
                            {item.translated}
                        </span>
                    </div>

                    {/* Delete Icon */}
                    <button 
                        onClick={() => { setGlossaryItemToDeleteId(item.id); setIsConfirmDeleteGlossaryOpen(true); }} 
                        className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                        title={t('common.delete')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            ))}
            {filteredGlossary.length === 0 && (
                <div className="text-center py-8 text-subtle text-sm italic opacity-50 border-2 border-dashed border-border rounded-xl">
                    {t('settings.glossary.empty')}
                </div>
            )}
        </div>
      </section>

      {/* DATA MANAGEMENT & AI CONFIG (EXISTING) */}
      <section className="glass-card p-6 md:p-8 rounded-3xl shadow-soft space-y-6 border-l-4 border-charcoal">
         <h2 className="text-xl font-serif font-bold text-charcoal">💾 {t('settings.storage.title')}</h2>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <button onClick={handleExportProject} className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group">
                 <div className="text-left">
                     <p className="font-bold text-charcoal">{t('settings.storage.export')}</p>
                     <p className="text-xs text-subtle">{t('settings.storage.exportDesc')}</p>
                 </div>
                 <span className="text-2xl">📤</span>
             </button>
             <button onClick={handleImportClick} className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group">
                 <div className="text-left">
                     <p className="font-bold text-charcoal">{t('settings.storage.import')}</p>
                     <p className="text-xs text-subtle">{t('settings.storage.importDesc')}</p>
                 </div>
                 <span className="text-2xl">📥</span>
             </button>
             <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
         </div>
         <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
             <div>
                <p className="font-bold text-charcoal dark:text-gray-200 text-sm">{t('settings.storage.resetCache')}</p>
                <p className="text-xs text-subtle">
                    {t('settings.storage.resetCacheDesc')}
                </p>
             </div>
             <button 
                onClick={handleClearCache} 
                disabled={isCleaningCache}
                className="bg-charcoal text-paper px-6 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-black disabled:opacity-50 transition-colors"
             >
                 {isCleaningCache ? t('settings.storage.clearing') : t('settings.storage.resetButton')}
             </button>
         </div>
         <div className="pt-4 border-t border-border flex justify-end items-center">
             <span className="text-[10px] text-subtle font-mono">v3.2.0-hybrid</span>
         </div>
      </section>

      {/* AI CONFIGURATION (EXISTING) */}
      <section className="glass-card p-6 md:p-8 rounded-3xl shadow-soft space-y-6 border-l-4 border-charcoal">
        <h2 className="text-xl font-serif font-bold text-charcoal pb-2 border-b border-gray-100">⚙️ {t('settings.ai.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <label className="text-[10px] font-bold text-subtle uppercase tracking-widest">{t('settings.ai.provider')}</label>
                <select value={settings.activeProvider} onChange={(e) => updateGlobalSetting('activeProvider', e.target.value)} className="w-full p-4 rounded-2xl bg-charcoal text-paper text-sm font-bold outline-none appearance-none">
                    {LLM_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-subtle uppercase tracking-widest">{t('settings.ai.model')}</label>
                    <button 
                        onClick={handleOpenAddModel} 
                        disabled={isFetchingModels}
                        className="text-[10px] font-bold text-accent hover:underline disabled:opacity-50 flex items-center gap-1"
                    >
                        {isFetchingModels ? (
                            <span className="animate-spin">↻</span>
                        ) : (
                            <span>+ Tambah Model</span>
                        )}
                    </button>
                </div>
                <select value={settings.selectedModel[settings.activeProvider] || DEFAULT_MODELS[settings.activeProvider]} onChange={(e) => updateModel(settings.activeProvider, e.target.value)} className="w-full p-4 rounded-2xl bg-card border border-border text-charcoal text-sm font-bold outline-none appearance-none">
                    {currentProviderModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>
            <div className="md:col-span-2 space-y-2">
                <div className="flex justify-between items-end mb-1">
                    <label className="text-[10px] font-bold text-subtle uppercase tracking-widest">{t('settings.ai.apiKey')} ({settings.activeProvider})</label>
                    <a href={API_KEY_LINKS[settings.activeProvider] || '#'} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-indigo-600 hover:underline">{t('settings.ai.getKey')}</a>
                </div>
                <input type="password" placeholder={t('editor.apiKeyPlaceholder')} value={settings.apiKeys[settings.activeProvider] || ''} onChange={(e) => updateApiKey(settings.activeProvider, e.target.value)} className="w-full p-4 rounded-2xl bg-card border-2 border-transparent focus:border-accent outline-none text-sm font-mono shadow-inner-light" />
            </div>
        </div>
      </section>

      {/* ADD MODEL MODAL */}
      {isModelModalOpen && portalRoot && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-paper w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-6 border-b border-border flex justify-between items-center bg-card">
                    <div>
                        <h3 className="text-lg font-bold text-charcoal">Tambah Model ({settings.activeProvider})</h3>
                        <p className="text-xs text-subtle">Pilih model yang ingin ditambahkan ke list.</p>
                    </div>
                    <button onClick={() => setIsModelModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">✕</button>
                </div>
                
                <div className="p-4 border-b border-border bg-gray-50">
                    <input 
                        type="text" 
                        placeholder="Cari model..." 
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        className="w-full p-3 rounded-xl bg-white border border-border text-sm outline-none focus:border-accent"
                    />
                </div>

                <div className="flex-grow overflow-y-auto custom-scrollbar p-2">
                    {fetchedModels
                        .filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()))
                        .map(model => {
                            const isAdded = currentProviderModels.includes(model);
                            return (
                                <button 
                                    key={model} 
                                    onClick={() => handleAddModel(model)}
                                    disabled={isAdded}
                                    className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between group border mb-1 ${isAdded ? 'bg-green-50 border-green-200 opacity-60' : 'hover:bg-gray-100 border-transparent'}`}
                                >
                                    <span className="font-mono text-xs text-charcoal truncate">{model}</span>
                                    {isAdded ? <span className="text-green-600 text-[10px] font-bold">ADDED</span> : <span className="text-accent text-lg font-bold">+</span>}
                                </button>
                            );
                        })
                    }
                </div>
            </div>
        </div>,
        portalRoot
      )}

      <ConfirmDialog isOpen={isConfirmDeleteGlossaryOpen} onClose={() => setIsConfirmDeleteGlossaryOpen(false)} onConfirm={() => { updateProject(activeProject.id, prev => ({ ...prev, glossary: prev.glossary.filter(i => i.id !== glossaryItemToDeleteId) })); setGlossaryItemToDeleteId(null); }} title={t('settings.glossary.confirmDeleteTitle')} message={t('settings.glossary.confirmDeleteMsg')} isDestructive={true} />
      <ConfirmDialog isOpen={isConfirmBulkDeleteOpen} onClose={() => setIsConfirmBulkDeleteOpen(false)} onConfirm={() => { updateProject(activeProject.id, prev => ({ ...prev, glossary: prev.glossary.filter(i => !selectedIds.has(i.id)) })); setSelectedIds(new Set()); }} title={t('settings.glossary.confirmBulkDeleteTitle')} message={t('settings.glossary.confirmBulkDeleteMsg')} isDestructive={true} />
      <ConfirmDialog isOpen={isConfirmDeleteProjectOpen} onClose={() => setIsConfirmDeleteProjectOpen(false)} onConfirm={handleDeleteProject} title={t('settings.project.deleteTitle')} message={t('settings.project.deleteMsg')} isDestructive={true} />
    </div>
  );
};

export default SettingsPage;
