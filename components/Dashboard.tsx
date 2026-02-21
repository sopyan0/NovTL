
import React, { useState, useEffect } from 'react';
import { Page } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isCapacitorNative, pickExportDirectory } from '../utils/fileSystem';

interface DashboardProps {
    onNavigate: (page: Page) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
    const { settings, updateSettings, activeProject } = useSettings();
    const { t } = useLanguage();
    const [showStorageModal, setShowStorageModal] = useState(false);

    useEffect(() => {
        // Show modal if on mobile and preference not set
        if (isCapacitorNative() && !settings.storagePreference) {
            setShowStorageModal(true);
        }
    }, [settings.storagePreference]);

    const handleSelectStorage = (pref: 'downloads' | 'documents' | 'saf') => {
        if (pref === 'saf') {
            handlePickSAF();
            return;
        }
        updateSettings({ storagePreference: pref });
        setShowStorageModal(false);
    };

    const handlePickSAF = async () => {
        const path = await pickExportDirectory();
        if (path) {
            updateSettings({ 
                storagePreference: 'saf',
                safTreeUri: path 
            });
            setShowStorageModal(false);
        } else {
            alert("Gagal memilih folder. Silakan coba lagi atau pilih lokasi lain.");
        }
    };

    const totalProjects = settings.projects.length;
    // Calculate total glossary items across all projects
    const totalGlossary = settings.projects.reduce((acc, curr) => acc + curr.glossary.length, 0);
    const activeProvider = settings.activeProvider;

    const handleProjectClick = (projectId: string) => {
        updateSettings({ activeProjectId: projectId });
        onNavigate('translate');
    };

    const handleCreateProject = () => {
        onNavigate('settings');
        // We navigate to settings where the create logic lives, 
        // ideally we would open a modal here but for MVP this flow works well to guide users
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            {/* WELCOME SECTION */}
            <header className="flex flex-col gap-2">
                <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal tracking-tight">
                    {t('dashboard.welcome')} <span className="text-accent">Author.</span>
                </h1>
                <p className="text-subtle text-lg max-w-2xl font-serif italic opacity-80">
                    "{t('dashboard.quote')}"
                </p>
            </header>

            {/* BENTO GRID LAYOUT */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. CONTINUE WRITING (Large Card) */}
                <div 
                    onClick={() => onNavigate('translate')}
                    className="md:col-span-2 bg-charcoal text-white p-8 rounded-[2rem] shadow-xl cursor-pointer group relative overflow-hidden transition-transform hover:scale-[1.01]"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-48 w-48" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                    </div>
                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-sm">
                                {t('dashboard.lastEdited')}
                            </span>
                            <h2 className="text-3xl font-serif font-bold mt-4 mb-2">{activeProject.name}</h2>
                            <p className="text-gray-300 text-sm">
                                {activeProject.sourceLanguage} &rarr; {activeProject.targetLanguage}
                            </p>
                        </div>
                        <div className="flex items-center gap-3 mt-8">
                            <span className="font-bold border-b border-white pb-0.5 group-hover:border-accent transition-colors">
                                {t('dashboard.continue')}
                            </span>
                            <span className="bg-white text-charcoal rounded-full p-1 group-hover:bg-accent group-hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            </span>
                        </div>
                    </div>
                </div>

                {/* 2. STATS CARD */}
                <div className="bg-white p-6 rounded-[2rem] shadow-soft border border-gray-100 flex flex-col justify-between">
                    <div>
                        <h3 className="font-serif font-bold text-xl text-charcoal mb-6">{t('dashboard.stats')}</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-subtle text-sm">{t('dashboard.totalProjects')}</span>
                                <span className="font-bold text-2xl text-accent">{totalProjects}</span>
                            </div>
                            <div className="w-full h-px bg-gray-100"></div>
                            <div className="flex items-center justify-between">
                                <span className="text-subtle text-sm">{t('dashboard.totalGlossary')}</span>
                                <span className="font-bold text-2xl text-charcoal">{totalGlossary}</span>
                            </div>
                        </div>
                    </div>
                    <div className="mt-6 bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                         <div className={`w-2 h-2 rounded-full ${activeProvider ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                         <div className="flex flex-col">
                             <span className="text-[10px] uppercase font-bold text-subtle">{t('dashboard.activeModel')}</span>
                             <span className="text-xs font-bold text-charcoal truncate max-w-[120px]">{activeProvider}</span>
                         </div>
                    </div>
                </div>

                {/* 3. QUICK ACTIONS */}
                <div className="bg-gradient-to-br from-[#FFFBF0] to-[#FFF5E6] p-6 rounded-[2rem] shadow-sm border border-orange-100">
                     <h3 className="font-serif font-bold text-xl text-charcoal mb-4">{t('dashboard.quickActions')}</h3>
                     <div className="space-y-3">
                        <button 
                            onClick={handleCreateProject}
                            className="w-full bg-white hover:bg-orange-50 text-left px-4 py-3 rounded-xl shadow-sm border border-orange-100/50 flex items-center justify-between group transition-all"
                        >
                            <span className="font-bold text-sm text-charcoal group-hover:text-orange-600 transition-colors">{t('dashboard.newProject')}</span>
                            <span className="bg-orange-100 text-orange-600 p-1 rounded-lg group-hover:scale-110 transition-transform">+</span>
                        </button>
                        <button 
                            onClick={() => onNavigate('settings')}
                            className="w-full bg-white hover:bg-orange-50 text-left px-4 py-3 rounded-xl shadow-sm border border-orange-100/50 flex items-center justify-between group transition-all"
                        >
                            <span className="font-bold text-sm text-charcoal group-hover:text-orange-600 transition-colors">{t('dashboard.manageKeys')}</span>
                            <span className="bg-gray-100 text-gray-500 p-1 rounded-lg group-hover:bg-orange-100 group-hover:text-orange-600 transition-colors">🔑</span>
                        </button>
                     </div>
                </div>

                {/* 4. RECENT PROJECTS LIST */}
                <div className="md:col-span-2 bg-white p-8 rounded-[2rem] shadow-soft border border-gray-100">
                    <h3 className="font-serif font-bold text-xl text-charcoal mb-4 flex items-center gap-2">
                        <span>📚</span> {t('dashboard.recentProjects')}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {settings.projects.slice(0, 4).map(project => (
                             <div 
                                key={project.id}
                                onClick={() => handleProjectClick(project.id)}
                                className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md active:scale-[0.98] ${
                                    project.id === activeProject.id 
                                    ? 'bg-charcoal text-white border-charcoal' 
                                    : 'bg-gray-50 text-charcoal border-transparent hover:bg-white hover:border-gray-200'
                                }`}
                             >
                                 <h4 className="font-bold font-serif truncate">{project.name}</h4>
                                 <div className="flex justify-between items-end mt-2">
                                     <span className={`text-xs ${project.id === activeProject.id ? 'text-gray-400' : 'text-subtle'}`}>
                                        {project.glossary.length} {t('dashboard.terms')}
                                     </span>
                                     {project.id === activeProject.id && <span className="text-[10px] uppercase font-bold bg-white/20 px-2 py-0.5 rounded">{t('dashboard.active')}</span>}
                                 </div>
                             </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* STORAGE PREFERENCE MODAL */}
            {showStorageModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-charcoal/40 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-paper w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300">
                        <div className="text-center space-y-4">
                            <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span className="text-4xl">📂</span>
                            </div>
                            <h2 className="text-2xl font-serif font-bold text-charcoal">Pilih Lokasi Simpan</h2>
                            <p className="text-subtle leading-relaxed">
                                Agar file hasil terjemahan (EPUB/TXT) bisa langsung masuk ke folder yang benar, silakan pilih lokasi penyimpanan utama Anda.
                            </p>
                            
                            <div className="grid grid-cols-1 gap-4 mt-8">
                                <button 
                                    onClick={() => handleSelectStorage('downloads')}
                                    className="flex items-center justify-between p-5 bg-white border-2 border-transparent hover:border-accent rounded-2xl shadow-sm transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl">📥</span>
                                        <div className="text-left">
                                            <p className="font-bold text-charcoal">Folder Download</p>
                                            <p className="text-xs text-subtle">Internal/Download/NovTL</p>
                                        </div>
                                    </div>
                                    <span className="opacity-0 group-hover:opacity-100 text-accent transition-opacity">➔</span>
                                </button>

                                <button 
                                    onClick={() => handleSelectStorage('documents')}
                                    className="flex items-center justify-between p-5 bg-white border-2 border-transparent hover:border-accent rounded-2xl shadow-sm transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl">📄</span>
                                        <div className="text-left">
                                            <p className="font-bold text-charcoal">Folder Documents</p>
                                            <p className="text-xs text-subtle">Internal/Documents/NovTL</p>
                                        </div>
                                    </div>
                                    <span className="opacity-0 group-hover:opacity-100 text-accent transition-opacity">➔</span>
                                </button>

                                <button 
                                    onClick={() => handleSelectStorage('saf')}
                                    className="flex items-center justify-between p-5 bg-accent/5 border-2 border-accent/20 hover:border-accent rounded-2xl shadow-sm transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl">🛠️</span>
                                        <div className="text-left">
                                            <p className="font-bold text-accent">Pilih Folder Sendiri (SAF)</p>
                                            <p className="text-xs text-subtle">Rekomendasi Android 11+</p>
                                        </div>
                                    </div>
                                    <span className="opacity-0 group-hover:opacity-100 text-accent transition-opacity">➔</span>
                                </button>
                            </div>

                            <p className="text-[10px] text-subtle mt-6 italic">
                                *Anda bisa mengubah pilihan ini kapan saja di menu Pengaturan.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
