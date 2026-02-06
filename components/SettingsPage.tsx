
import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, GlossaryItem, NovelProject, SavedTranslation } from '../types';
import { LLM_PROVIDERS, PROVIDER_MODELS, DEFAULT_MODELS } from '../constants'; 
import ConfirmDialog from './ConfirmDialog'; 
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslationsByProjectId, saveTranslationToDB, saveGlossaryToDB, wipeAllLocalData } from '../utils/storage';

// Helper Links for API Keys
const API_KEY_LINKS: Record<string, string> = {
    'Gemini': 'https://aistudio.google.com/app/apikey',
    'OpenAI (GPT)': 'https://platform.openai.com/api-keys',
    'DeepSeek': 'https://platform.deepseek.com/api_keys',
    'Grok (xAI)': 'https://console.x.ai/'
};

const SettingsPage: React.FC = () => {
  const { settings, updateSettings, updateProject, activeProject } = useSettings();
  const { language, setLanguage, t } = useLanguage();

  const [newWord, setNewWord] = useState('');
  const [newTrans, setNewTrans] = useState('');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  
  // RENAME STATE
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const [isConfirmDeleteProjectOpen, setIsConfirmDeleteProjectOpen] = useState(false);

  const [isConfirmDeleteGlossaryOpen, setIsConfirmDeleteGlossaryOpen] = useState(false);
  const [glossaryItemToDeleteId, setGlossaryItemToDeleteId] = useState<string | null>(null);
  const [isConfirmBulkDeleteOpen, setIsConfirmBulkDeleteOpen] = useState(false);
  const [glossarySearchTerm, setGlossarySearchTerm] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SAFETY: Reset selection on mount (tab switch)
  useEffect(() => {
      setSelectedIds(new Set());
      setIsRenaming(false); // Reset rename state on mount
  }, []);

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
          alert("Must have at least one project!");
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

  const toggleSelect = (id: string) => {
      setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const performBulkDelete = () => {
      if (selectedIds.size > 10) {
          const confirmation = window.confirm(`⚠️ SECURITY WARNING ⚠️\n\nYou are about to delete ${selectedIds.size} words at once.\nThis action cannot be undone.\n\nType 'OK' if you are sure.`);
          if (!confirmation) {
              setIsConfirmBulkDeleteOpen(false);
              return;
          }
      }

      updateProject(activeProject.id, prev => ({ 
          ...prev,
          glossary: prev.glossary.filter(item => !selectedIds.has(item.id)) 
      }));
      setSelectedIds(new Set());
      setIsConfirmBulkDeleteOpen(false);
  };

  const handleSingleDelete = () => {
      if (glossaryItemToDeleteId) {
          updateProject(activeProject.id, prev => ({ 
              ...prev,
              glossary: prev.glossary.filter(item => item.id !== glossaryItemToDeleteId) 
          }));
          setSelectedIds(prev => {
              const next = new Set(prev);
              next.delete(glossaryItemToDeleteId);
              return next;
          });
          setGlossaryItemToDeleteId(null);
      }
      setIsConfirmDeleteGlossaryOpen(false);
  };

  const handleResetApp = async () => {
      if(confirm("PERINGATAN: Ini akan menghapus SEMUA data (Novel, Glosarium, Chat) dari penyimpanan lokal browser ini. Anda tidak bisa mengembalikannya kecuali sudah Backup.\n\nLanjutkan?")) {
          await wipeAllLocalData();
          window.location.reload();
      }
  }

  // --- EXPORT / IMPORT LOGIC ---
  const handleExportProject = async () => {
      try {
        const project = activeProject;
        // Fetch full translations content
        const translations = await getTranslationsByProjectId(project.id);
        
        const backupData = {
            version: 1,
            timestamp: new Date().toISOString(),
            type: 'NOVTL_PROJECT_BACKUP',
            project: {
                ...project,
                glossary: project.glossary // Include glossary explicitly
            },
            translations: translations
        };
        
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Backup-${project.name.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("Export failed", e);
        alert("Export failed. Check console.");
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

              // Basic Validation
              if (!data.project || !Array.isArray(data.translations)) {
                  throw new Error("Invalid format");
              }

              // 1. Create/Merge Project
              // Generate new ID to avoid collision if importing same project
              const newProjectId = crypto.randomUUID();
              const importedProject: NovelProject = {
                  ...data.project,
                  id: newProjectId,
                  name: `${data.project.name} (Restored)`,
                  glossary: data.project.glossary || []
              };

              // 2. Add Project to Settings
              updateSettings(prev => ({
                  ...prev,
                  projects: [...prev.projects, importedProject],
                  activeProjectId: newProjectId
              }));

              // 3. Restore Glossary to DB (important for persistence)
              await saveGlossaryToDB(newProjectId, importedProject.glossary);

              // 4. Restore Translations to DB
              const translations = data.translations as SavedTranslation[];
              for (const t of translations) {
                  // Ensure translation points to new project ID
                  await saveTranslationToDB({
                      ...t,
                      projectId: newProjectId
                  });
              }

              alert(t('settings.importSuccess'));

          } catch (err) {
              console.error("Import failed", err);
              alert(t('settings.importError'));
          } finally {
              // Reset input
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  const filteredGlossary = activeProject.glossary.filter(item => 
    item.original.toLowerCase().includes(glossarySearchTerm.toLowerCase()) || 
    item.translated.toLowerCase().includes(glossarySearchTerm.toLowerCase())
  );

  const currentProvider = settings.activeProvider;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full overflow-hidden">
      
      {/* 1. PROJECT SELECTOR */}
      <section className="glass p-6 md:p-8 rounded-3xl shadow-soft relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-charcoal"></div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10 mb-6">
            <div className="w-full">
                <h2 className="text-xl md:text-2xl font-serif font-bold flex items-center gap-2 text-charcoal">
                   📂 {t('settings.projectManagement')}
                </h2>
                <p className="text-subtle text-xs mt-1 tracking-wide">{t('settings.projectDesc')}</p>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
                {/* THEME TOGGLE */}
                <button 
                    onClick={toggleTheme} 
                    className={`flex items-center justify-center p-2 rounded-xl border transition-all ${settings.theme === 'dark' ? 'bg-charcoal text-yellow-400 border-paper/10' : 'bg-white text-gray-400 border-gray-200'}`}
                    title="Toggle Dark Mode"
                >
                    {settings.theme === 'dark' ? '🌙' : '☀️'}
                </button>

                <div className="flex items-center bg-card rounded-xl p-1 shadow-sm border border-border">
                    <button onClick={() => setLanguage('en')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'en' ? 'bg-charcoal text-paper shadow-md' : 'text-subtle hover:bg-gray-100 dark:hover:bg-gray-700'}`}>EN</button>
                    <button onClick={() => setLanguage('id')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'id' ? 'bg-charcoal text-paper shadow-md' : 'text-subtle hover:bg-gray-100 dark:hover:bg-gray-700'}`}>ID</button>
                </div>

                {!isCreatingProject ? (
                    <button onClick={() => setIsCreatingProject(true)} className="bg-charcoal text-paper hover:opacity-90 px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all whitespace-nowrap">
                        {t('settings.createProject')}
                    </button>
                ) : (
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <input 
                            type="text" 
                            placeholder={t('settings.projectName')} 
                            className="p-2.5 rounded-xl bg-card text-charcoal text-sm border-2 border-accent focus:outline-none w-full shadow-sm" 
                            value={newProjectName} 
                            onChange={e => setNewProjectName(e.target.value)} 
                            autoFocus 
                        />
                        <div className="flex gap-2">
                            <button onClick={handleCreateProject} className="bg-accent px-4 py-2 rounded-xl text-white text-xs font-bold flex-1 shadow-glow">OK</button>
                            <button onClick={() => setIsCreatingProject(false)} className="bg-gray-200 dark:bg-gray-700 text-charcoal px-4 py-2 rounded-xl text-xs font-bold flex-1">Cancel</button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        <div className="flex flex-col gap-4 relative z-10">
            {/* RENAME MODE VS SELECT MODE */}
            <div className="flex flex-col sm:flex-row gap-3 items-center">
                {isRenaming ? (
                     <div className="relative flex-grow w-full flex gap-2 animate-in fade-in duration-200">
                        <input 
                            type="text" 
                            value={renameValue} 
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="w-full p-4 rounded-2xl bg-card border-2 border-accent text-charcoal font-bold outline-none shadow-inner-light"
                            autoFocus
                        />
                        <button onClick={handleSaveRename} className="bg-accent text-white px-4 rounded-xl font-bold shadow-md hover:bg-accentHover transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button onClick={() => setIsRenaming(false)} className="bg-gray-200 dark:bg-gray-700 text-charcoal px-4 rounded-xl font-bold hover:bg-gray-300 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                     </div>
                ) : (
                    <div className="relative flex-grow w-full flex gap-2">
                        <div className="relative w-full">
                            <select value={activeProject.id} onChange={(e) => updateGlobalSetting('activeProjectId', e.target.value)} className="w-full p-4 pl-5 rounded-2xl bg-card border border-border text-charcoal font-bold outline-none appearance-none cursor-pointer shadow-inner-light transition-colors">
                                {settings.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-subtle">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </div>
                        </div>
                        
                        <button onClick={handleStartRename} className="px-4 py-4 bg-card border border-border text-gray-500 rounded-2xl font-bold hover:bg-accent hover:text-white hover:border-accent transition-all shadow-sm" title="Rename Project">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>

                        {settings.projects.length > 1 && (
                            <button onClick={() => setIsConfirmDeleteProjectOpen(true)} className="px-4 py-4 bg-card border border-red-100 dark:border-red-900 text-red-400 rounded-2xl font-bold hover:bg-red-50 dark:hover:bg-red-900/50 hover:text-red-500 transition-all shadow-sm" title="Delete Project">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
      </section>

      {/* NEW: DATA MANAGEMENT (BACKUP/RESTORE) - NOW WITH CHARCOAL BORDER */}
      <section className="glass-card p-6 md:p-8 rounded-3xl shadow-soft space-y-4 border-l-4 border-charcoal">
         <h2 className="text-xl font-serif font-bold text-charcoal">{t('settings.dataManagement')}</h2>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <button 
                onClick={handleExportProject}
                className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group"
             >
                 <div className="text-left">
                     <p className="font-bold text-charcoal group-hover:text-indigo-600 transition-colors">{t('settings.exportProject')}</p>
                     <p className="text-xs text-subtle mt-1">{t('settings.exportDesc')}</p>
                 </div>
                 <span className="text-2xl bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-xl group-hover:scale-110 transition-transform">📤</span>
             </button>

             <button 
                onClick={handleImportClick}
                className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-emerald-100 transition-all group"
             >
                 <div className="text-left">
                     <p className="font-bold text-charcoal group-hover:text-emerald-600 transition-colors">{t('settings.importProject')}</p>
                     <p className="text-xs text-subtle mt-1">{t('settings.importDesc')}</p>
                 </div>
                 <span className="text-2xl bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded-xl group-hover:scale-110 transition-transform">📥</span>
             </button>
             <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
         </div>
         
         {/* DANGER ZONE */}
         <div className="mt-8 pt-6 border-t border-border">
             <button onClick={handleResetApp} className="text-xs font-bold text-red-400 hover:text-red-600 underline">
                 Reset / Hapus Semua Data Lokal
             </button>
         </div>
      </section>

      {/* 2. AI CONFIGURATION */}
      <section className="glass-card p-6 md:p-8 rounded-3xl shadow-soft space-y-6 border-l-4 border-charcoal">
        <h2 className="text-xl font-serif font-bold text-charcoal pb-2 border-b border-gray-100 dark:border-gray-700">⚙️ {t('settings.aiConfig')}</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <label className="text-[10px] font-bold text-subtle uppercase tracking-widest">{t('settings.provider')}</label>
                <select 
                    value={currentProvider} 
                    onChange={(e) => updateGlobalSetting('activeProvider', e.target.value)}
                    className="w-full p-4 rounded-2xl bg-charcoal text-paper text-sm font-bold focus:shadow-glow outline-none cursor-pointer appearance-none shadow-lg border-none"
                >
                    {LLM_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-bold text-subtle uppercase tracking-widest">{t('settings.model')}</label>
                <select 
                    value={settings.selectedModel[currentProvider] || DEFAULT_MODELS[currentProvider]}
                    onChange={(e) => updateModel(currentProvider, e.target.value)}
                    className="w-full p-4 rounded-2xl bg-card border border-border text-charcoal text-sm font-bold focus:shadow-glow outline-none cursor-pointer appearance-none shadow-sm"
                >
                    {(PROVIDER_MODELS[currentProvider] || []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>

            <div className="md:col-span-2 space-y-2">
                {/* NEW: DYNAMIC LINK BUTTON FOR API KEY */}
                <div className="flex justify-between items-end mb-1">
                    <label className="text-[10px] font-bold text-subtle uppercase tracking-widest">
                        {t('settings.apiKey')} ({currentProvider})
                    </label>
                    <a 
                        href={API_KEY_LINKS[currentProvider] || '#'} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-2 transform active:scale-95"
                    >
                        <span>🔑</span> Ambil API Key {currentProvider}
                    </a>
                </div>

                <div className="relative">
                    <input 
                        type="password" 
                        placeholder={t('editor.apiKeyPlaceholder')}
                        value={settings.apiKeys[currentProvider] || ''} 
                        onChange={(e) => updateApiKey(currentProvider, e.target.value)} 
                        className="w-full p-4 pl-12 rounded-2xl border-2 border-transparent bg-card focus:border-accent/20 focus:shadow-glow outline-none text-sm font-mono shadow-inner-light text-charcoal" 
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                         </svg>
                    </div>
                </div>
            </div>
        </div>
      </section>

      {/* 3. GLOSSARY SECTION */}
      <section className="glass-card p-6 md:p-8 rounded-3xl shadow-soft space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 dark:border-gray-700 pb-4">
            <div>
                <h2 className="text-xl font-serif font-bold text-charcoal">📖 {t('settings.glossary')}</h2>
                <p className="text-subtle text-xs mt-1">{t('settings.glossaryDesc')}</p>
            </div>
            <div className="flex gap-2">
                 {selectedIds.size > 0 && (
                    <button onClick={() => setSelectedIds(new Set())} className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-charcoal px-3 py-2 rounded-xl font-bold text-xs shadow-sm transition-all whitespace-nowrap">
                        Batal Pilih
                    </button>
                )}
                {selectedIds.size > 0 && (
                    <button onClick={() => setIsConfirmBulkDeleteOpen(true)} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg animate-in fade-in slide-in-from-right-4 transition-all whitespace-nowrap">
                        {t('settings.deleteSelected')} ({selectedIds.size})
                    </button>
                )}
            </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 bg-paper/50 dark:bg-black/20 p-3 rounded-2xl border border-border shadow-inner-light">
          <input type="text" placeholder={t('settings.original')} className="flex-grow p-3 rounded-xl bg-card border border-transparent text-sm focus:shadow-glow outline-none transition-all text-charcoal placeholder-subtle" value={newWord} onChange={(e) => setNewWord(e.target.value)} />
          <span className="hidden sm:flex items-center text-subtle">➜</span>
          <input type="text" placeholder={t('settings.translated')} className="flex-grow p-3 rounded-xl bg-card border border-transparent text-sm focus:shadow-glow outline-none transition-all text-charcoal placeholder-subtle" value={newTrans} onChange={(e) => setNewTrans(e.target.value)} />
          <button onClick={() => { if(newWord && newTrans) { addGlossaryItem(newWord, newTrans); setNewWord(''); setNewTrans(''); }}} className="bg-charcoal text-paper px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-all shadow-md">{t('settings.add')}</button>
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {activeProject.glossary.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl text-center opacity-30">
                    <p className="text-sm font-serif italic text-charcoal">Glosarium Kosong.</p>
                </div>
            ) : (
                filteredGlossary.map(item => (
                    <div key={item.id} className={`flex items-start gap-3 p-3 rounded-2xl border transition-all ${selectedIds.has(item.id) ? 'bg-indigo-50 dark:bg-indigo-900/20 border-accent/20' : 'bg-card border-transparent hover:bg-white dark:hover:bg-gray-800 hover:shadow-sm'}`}>
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} className="w-4 h-4 mt-1 rounded text-accent focus:ring-accent cursor-pointer" />
                        <div className="flex-grow flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 font-serif text-charcoal text-sm md:text-base break-all">
                            <span className="font-medium text-gray-500 dark:text-gray-400">{item.original}</span>
                            <span className="text-subtle hidden sm:inline">&rarr;</span>
                            <span className="font-bold text-charcoal bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded w-fit">{item.translated}</span>
                        </div>
                        <button onClick={() => { setGlossaryItemToDeleteId(item.id); setIsConfirmDeleteGlossaryOpen(true); }} className="text-subtle hover:text-red-500 transition-colors pt-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                ))
            )}
        </div>
      </section>

      <ConfirmDialog isOpen={isConfirmDeleteGlossaryOpen} onClose={() => setIsConfirmDeleteGlossaryOpen(false)} onConfirm={handleSingleDelete} title="Delete Term?" message="Are you sure you want to delete this term from glossary?" isDestructive={true} />
      <ConfirmDialog isOpen={isConfirmBulkDeleteOpen} onClose={() => setIsConfirmBulkDeleteOpen(false)} onConfirm={performBulkDelete} title={`Delete ${selectedIds.size} Terms?`} message={`Are you sure you want to delete all selected terms?`} isDestructive={true} />
      <ConfirmDialog isOpen={isConfirmDeleteProjectOpen} onClose={() => setIsConfirmDeleteProjectOpen(false)} onConfirm={handleDeleteProject} title={t('settings.deleteProject')} message={t('settings.deleteProjectMsg')} confirmText='Delete' isDestructive={true} />
    </div>
  );
};

export default SettingsPage;
