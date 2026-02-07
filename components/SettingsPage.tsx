
import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, GlossaryItem, NovelProject } from '../types';
import { LLM_PROVIDERS, PROVIDER_MODELS, DEFAULT_MODELS } from '../constants'; 
import ConfirmDialog from './ConfirmDialog'; 
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { clearCacheOnly } from '../utils/idb';
import { getTranslationsByProjectId, saveTranslationToDB, saveGlossaryToDB, wipeAllLocalData } from '../utils/storage';

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
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isConfirmDeleteProjectOpen, setIsConfirmDeleteProjectOpen] = useState(false);
  const [isConfirmDeleteGlossaryOpen, setIsConfirmDeleteGlossaryOpen] = useState(false);
  const [glossaryItemToDeleteId, setGlossaryItemToDeleteId] = useState<string | null>(null);
  const [isConfirmBulkDeleteOpen, setIsConfirmBulkDeleteOpen] = useState(false);
  const [glossarySearchTerm, setGlossarySearchTerm] = useState('');
  const [isCleaningCache, setIsCleaningCache] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      setSelectedIds(new Set());
      setIsRenaming(false);
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
          alert("Harus ada minimal satu proyek!");
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
      if(confirm("PERINGATAN: Tindakan ini akan menghapus database lokal (IndexedDB) dan memuat ulang data dari File Penyimpanan Fisik.\n\nJIKA PERMISSION ANDROID ANDA BERMASALAH SEBELUMNYA, DATA YANG BELUM TERSIMPAN FISIK BISA HILANG.\n\nLanjutkan?")) {
          setIsCleaningCache(true);
          await clearCacheOnly();
          setIsCleaningCache(false);
          alert("Cache Database dibersihkan. Aplikasi akan mencoba memuat ulang data dari file fisik.");
          window.location.reload();
      }
  }

  const handleResetApp = async () => {
      if(confirm("PERINGATAN: Ini akan menghapus seluruh data proyek. Lanjutkan?")) {
          await wipeAllLocalData();
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
        // Menggunakan nama file yang aman
        const safeName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        // File system handler (utils/fileSystem.ts) sekarang menggunakan Share API di Android
        // yang akan memicu dialog "Save as" atau share sheet.
        const { triggerDownload } = await import('../utils/fileSystem');
        await triggerDownload(`backup_${safeName}.json`, blob);
      } catch (e) {
        alert("Export gagal.");
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
              alert("Data berhasil dipulihkan!");
          } catch (err) {
              alert("Gagal memproses file backup.");
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

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full overflow-hidden">
      
      {/* 1. PROJECT SELECTOR */}
      <section className="glass p-6 md:p-8 rounded-3xl shadow-soft relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-charcoal"></div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10 mb-6">
            <div className="w-full">
                <h2 className="text-xl md:text-2xl font-serif font-bold flex items-center gap-2 text-charcoal">
                   📂 Proyek Novel
                </h2>
                <p className="text-subtle text-xs mt-1 tracking-wide">Kelola novel yang sedang Anda kerjakan.</p>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
                <button onClick={toggleTheme} className={`flex items-center justify-center p-2 rounded-xl border transition-all ${settings.theme === 'dark' ? 'bg-charcoal text-yellow-400 border-paper/10' : 'bg-white text-gray-400 border-gray-200'}`}>
                    {settings.theme === 'dark' ? '🌙' : '☀️'}
                </button>
                <div className="flex items-center bg-card rounded-xl p-1 shadow-sm border border-border">
                    <button onClick={() => setLanguage('en')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'en' ? 'bg-charcoal text-paper shadow-md' : 'text-subtle'}`}>EN</button>
                    <button onClick={() => setLanguage('id')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'id' ? 'bg-charcoal text-paper shadow-md' : 'text-subtle'}`}>ID</button>
                </div>
                {!isCreatingProject ? (
                    <button onClick={() => setIsCreatingProject(true)} className="bg-charcoal text-paper px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all whitespace-nowrap">+ Proyek Baru</button>
                ) : (
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <input type="text" placeholder="Nama Proyek..." className="p-2.5 rounded-xl bg-card text-charcoal text-sm border-2 border-accent outline-none w-full" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} autoFocus />
                        <div className="flex gap-2">
                            <button onClick={handleCreateProject} className="bg-accent px-4 py-2 rounded-xl text-white text-xs font-bold flex-1 shadow-glow">OK</button>
                            <button onClick={() => setIsCreatingProject(false)} className="bg-gray-200 text-charcoal px-4 py-2 rounded-xl text-xs font-bold flex-1">Batal</button>
                        </div>
                    </div>
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

      {/* DATA MANAGEMENT */}
      <section className="glass-card p-6 md:p-8 rounded-3xl shadow-soft space-y-6 border-l-4 border-charcoal">
         <h2 className="text-xl font-serif font-bold text-charcoal">💾 Penyimpanan Lokal</h2>
         
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <button onClick={handleExportProject} className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group">
                 <div className="text-left">
                     <p className="font-bold text-charcoal">Ekspor Backup (.json)</p>
                     <p className="text-xs text-subtle">Simpan data ke file untuk dipindah.</p>
                 </div>
                 <span className="text-2xl">📤</span>
             </button>

             <button onClick={handleImportClick} className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group">
                 <div className="text-left">
                     <p className="font-bold text-charcoal">Impor Backup (.json)</p>
                     <p className="text-xs text-subtle">Pulihkan data dari file eksternal.</p>
                 </div>
                 <span className="text-2xl">📥</span>
             </button>
             <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
         </div>

         <div className="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800 flex flex-col sm:flex-row items-center justify-between gap-4">
             <div>
                <p className="font-bold text-indigo-700 dark:text-indigo-300 text-sm">Reset Database Cache?</p>
                <p className="text-xs text-indigo-600/70 dark:text-indigo-300/60">
                    Akan menghapus "memori cepat" aplikasi dan memaksa baca ulang dari file fisik. 
                    <strong className="block mt-1">Gunakan hanya jika data terasa tidak sinkron.</strong>
                </p>
             </div>
             <button 
                onClick={handleClearCache} 
                disabled={isCleaningCache}
                className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50"
             >
                 {isCleaningCache ? 'Membersihkan...' : 'Reset Cache'}
             </button>
         </div>

         <div className="pt-4 border-t border-border flex justify-between items-center">
             <button onClick={handleResetApp} className="text-[10px] font-bold text-red-400 hover:text-red-600 underline">
                 HAPUS SEMUA DATA & RESET APLIKASI
             </button>
             <span className="text-[10px] text-subtle font-mono">v3.2.0-hybrid</span>
         </div>
      </section>

      {/* AI CONFIGURATION */}
      <section className="glass-card p-6 md:p-8 rounded-3xl shadow-soft space-y-6 border-l-4 border-charcoal">
        <h2 className="text-xl font-serif font-bold text-charcoal pb-2 border-b border-gray-100">⚙️ Konfigurasi AI</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <label className="text-[10px] font-bold text-subtle uppercase tracking-widest">Penyedia AI</label>
                <select value={settings.activeProvider} onChange={(e) => updateGlobalSetting('activeProvider', e.target.value)} className="w-full p-4 rounded-2xl bg-charcoal text-paper text-sm font-bold outline-none appearance-none">
                    {LLM_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>
            <div className="space-y-2">
                <label className="text-[10px] font-bold text-subtle uppercase tracking-widest">Model</label>
                <select value={settings.selectedModel[settings.activeProvider] || DEFAULT_MODELS[settings.activeProvider]} onChange={(e) => updateModel(settings.activeProvider, e.target.value)} className="w-full p-4 rounded-2xl bg-card border border-border text-charcoal text-sm font-bold outline-none appearance-none">
                    {(PROVIDER_MODELS[settings.activeProvider] || []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>
            <div className="md:col-span-2 space-y-2">
                <div className="flex justify-between items-end mb-1">
                    <label className="text-[10px] font-bold text-subtle uppercase tracking-widest">API Key ({settings.activeProvider})</label>
                    <a href={API_KEY_LINKS[settings.activeProvider] || '#'} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-indigo-600 hover:underline">Ambil Key ↗</a>
                </div>
                <input type="password" placeholder="Tempel API Key di sini..." value={settings.apiKeys[settings.activeProvider] || ''} onChange={(e) => updateApiKey(settings.activeProvider, e.target.value)} className="w-full p-4 rounded-2xl bg-card border-2 border-transparent focus:border-accent outline-none text-sm font-mono shadow-inner-light" />
            </div>
        </div>
      </section>

      {/* GLOSSARY */}
      <section className="glass-card p-6 md:p-8 rounded-3xl shadow-soft space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
            <div>
                <h2 className="text-xl font-serif font-bold text-charcoal">📖 Glosarium</h2>
                <p className="text-subtle text-xs mt-1">Glosarium akan digunakan secara konsisten oleh AI saat menerjemahkan.</p>
            </div>
            {selectedIds.size > 0 && (
                <button onClick={() => setIsConfirmBulkDeleteOpen(true)} className="bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg animate-in fade-in transition-all">Hapus Terpilih ({selectedIds.size})</button>
            )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 bg-paper/50 p-3 rounded-2xl border border-border">
          <input type="text" placeholder="Kata Asli" className="flex-grow p-3 rounded-xl bg-card border border-transparent text-sm outline-none" value={newWord} onChange={(e) => setNewWord(e.target.value)} />
          <input type="text" placeholder="Terjemahan" className="flex-grow p-3 rounded-xl bg-card border border-transparent text-sm outline-none" value={newTrans} onChange={(e) => setNewTrans(e.target.value)} />
          <button onClick={() => { if(newWord && newTrans) { addGlossaryItem(newWord, newTrans); setNewWord(''); setNewTrans(''); }}} className="bg-charcoal text-paper px-6 py-3 rounded-xl font-bold shadow-md">Tambah</button>
        </div>
        <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredGlossary.map(item => (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-2xl border bg-card border-transparent hover:border-border transition-all">
                    <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => { const next = new Set(selectedIds); if(next.has(item.id)) next.delete(item.id); else next.add(item.id); setSelectedIds(next); }} className="w-4 h-4 mt-1 rounded text-accent cursor-pointer" />
                    <div className="flex-grow flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 font-serif text-charcoal text-sm md:text-base">
                        <span className="font-medium text-gray-500">{item.original}</span>
                        <span className="text-subtle hidden sm:inline">&rarr;</span>
                        <span className="font-bold text-charcoal bg-gray-100 px-2 py-0.5 rounded">{item.translated}</span>
                    </div>
                    <button onClick={() => { setGlossaryItemToDeleteId(item.id); setIsConfirmDeleteGlossaryOpen(true); }} className="text-subtle hover:text-red-500 transition-colors">🗑</button>
                </div>
            ))}
        </div>
      </section>

      <ConfirmDialog isOpen={isConfirmDeleteGlossaryOpen} onClose={() => setIsConfirmDeleteGlossaryOpen(false)} onConfirm={() => { updateProject(activeProject.id, prev => ({ ...prev, glossary: prev.glossary.filter(i => i.id !== glossaryItemToDeleteId) })); setGlossaryItemToDeleteId(null); }} title="Hapus Kata?" message="Yakin ingin menghapus kata ini dari glosarium?" isDestructive={true} />
      <ConfirmDialog isOpen={isConfirmBulkDeleteOpen} onClose={() => setIsConfirmBulkDeleteOpen(false)} onConfirm={() => { updateProject(activeProject.id, prev => ({ ...prev, glossary: prev.glossary.filter(i => !selectedIds.has(i.id)) })); setSelectedIds(new Set()); }} title="Hapus Terpilih?" message="Yakin ingin menghapus semua kata yang dipilih?" isDestructive={true} />
      <ConfirmDialog isOpen={isConfirmDeleteProjectOpen} onClose={() => setIsConfirmDeleteProjectOpen(false)} onConfirm={handleDeleteProject} title="Hapus Proyek?" message="Menghapus proyek akan menghilangkan seluruh glosarium di dalamnya." isDestructive={true} />
    </div>
  );
};

export default SettingsPage;
