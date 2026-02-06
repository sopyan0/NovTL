
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef, useMemo } from 'react';
import { AppSettings, NovelProject } from '../types';
import { STORAGE_KEY, DEFAULT_SETTINGS } from '../constants';
import { 
    saveGlossaryToDB, 
    deleteGlossaryItemsFromDB, 
    saveProjectToDB, 
    getProjectsFromDB,
    saveSettingsToCloud,
    getSettingsFromCloud
} from '../utils/storage';
import { useAuth } from './AuthContext';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => void;
  updateProject: (projectId: string, updates: Partial<NovelProject> | ((prev: NovelProject) => NovelProject)) => void;
  activeProject: NovelProject;
  syncToCloud: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const FALLBACK_PROJECT: NovelProject = {
    id: 'emergency-fallback',
    name: 'Proyek Darurat',
    sourceLanguage: 'Deteksi Otomatis',
    targetLanguage: 'Indonesia',
    translationInstruction: '',
    glossary: []
};

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const isHydratingRef = useRef(false);
  const { user } = useAuth();

  // 1. Load Settings & Cloud Sync
  useEffect(() => {
    const init = async () => {
        if (isHydratingRef.current) return;
        isHydratingRef.current = true;

        const saved = localStorage.getItem(STORAGE_KEY);
        let parsedSettings = DEFAULT_SETTINGS;

        // A. Ambil metadata terakhir dari LocalStorage (termasuk activeProjectId)
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                parsedSettings = { ...DEFAULT_SETTINGS, ...parsed };
            } catch (e) {}
        }

        // B. Sinkronisasi CLOUD
        if (user) {
            try {
                // Sync Projects
                const cloudProjects = await getProjectsFromDB();
                if (cloudProjects.length > 0) {
                    parsedSettings.projects = cloudProjects;
                    
                    // REVISI: Jangan langsung reset ke index 0. 
                    // Cek apakah activeProjectId yang tersimpan di LocalStorage ada di daftar cloud.
                    const lastActiveExists = cloudProjects.some(p => p.id === parsedSettings.activeProjectId);
                    if (!lastActiveExists) {
                        parsedSettings.activeProjectId = cloudProjects[0].id;
                    }
                }

                // Sync User Configs (API Keys, Language, Theme, Model)
                const cloudConfig = await getSettingsFromCloud();
                if (cloudConfig) {
                    parsedSettings = {
                        ...parsedSettings,
                        apiKeys: { ...parsedSettings.apiKeys, ...cloudConfig.apiKeys },
                        appLanguage: cloudConfig.appLanguage || parsedSettings.appLanguage,
                        theme: cloudConfig.theme || parsedSettings.theme,
                        translationMode: cloudConfig.translationMode || parsedSettings.translationMode,
                        activeProvider: cloudConfig.activeProvider || parsedSettings.activeProvider,
                        selectedModel: { ...parsedSettings.selectedModel, ...cloudConfig.selectedModel }
                    };
                }

            } catch (e) {
                console.warn("Cloud sync failed during init", e);
            }
        }

        setSettings(parsedSettings);
        setIsLoaded(true);
        isHydratingRef.current = false;
    };

    init();
  }, [user]);

  // 2. Save Settings to LocalStorage (Metadata only)
  useEffect(() => {
    if (!isLoaded) return;
    const settingsToSave = {
        ...settings,
        projects: settings.projects.map(p => ({ ...p, glossary: [] })) // Strip glossary content from LS
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave));
  }, [settings, isLoaded]);

  // 3. AUTO-SAVE Configs to Cloud
  useEffect(() => {
      if (!isLoaded || !user) return;
      
      const timer = setTimeout(() => {
          saveSettingsToCloud({
              apiKeys: settings.apiKeys,
              appLanguage: settings.appLanguage,
              theme: settings.theme,
              translationMode: settings.translationMode,
              activeProvider: settings.activeProvider,
              selectedModel: settings.selectedModel
          });
      }, 500); 

      return () => clearTimeout(timer);
  }, [
      settings.apiKeys, 
      settings.appLanguage, 
      settings.theme,
      settings.translationMode,
      settings.activeProvider, 
      settings.selectedModel, 
      user, 
      isLoaded
  ]);

  // 4. APPLY THEME (DARK MODE)
  useEffect(() => {
      const root = window.document.documentElement;
      if (settings.theme === 'dark') {
          root.classList.add('dark');
      } else {
          root.classList.remove('dark');
      }
  }, [settings.theme]);


  const updateSettings = useCallback((updates: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => {
    setSettings(prev => {
      const next = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };
      return next;
    });
  }, []);

  const updateProject = useCallback((projectId: string, updates: Partial<NovelProject> | ((prev: NovelProject) => NovelProject)) => {
    setSettings(prev => {
      const projectIndex = prev.projects.findIndex(p => p.id === projectId);
      if (projectIndex === -1) return prev;

      const oldProject = prev.projects[projectIndex];
      const updatedProjectData = typeof updates === 'function' ? updates(oldProject) : { ...oldProject, ...updates };
      
      // Save metadata
      saveProjectToDB(updatedProjectData);

      // Handle Glossary sync
      if (updatedProjectData.glossary !== oldProject.glossary) {
          saveGlossaryToDB(projectId, updatedProjectData.glossary);
          const oldIds = new Set(oldProject.glossary.map(g => g.id));
          const newIds = new Set(updatedProjectData.glossary.map(g => g.id));
          const deletedIds = [...oldIds].filter(id => !newIds.has(id)) as string[];
          if (deletedIds.length > 0) deleteGlossaryItemsFromDB(deletedIds);
      }

      const newProjects = [...prev.projects];
      newProjects[projectIndex] = updatedProjectData;
      return { ...prev, projects: newProjects };
    });
  }, []);

  const syncToCloud = useCallback(async () => {
      const currentProject = settings.projects.find(p => p.id === settings.activeProjectId);
      if (!currentProject) return;
      try {
          await saveProjectToDB(currentProject);
          await saveGlossaryToDB(currentProject.id, currentProject.glossary);
          
          await saveSettingsToCloud({
              apiKeys: settings.apiKeys,
              appLanguage: settings.appLanguage,
              theme: settings.theme,
              translationMode: settings.translationMode,
              activeProvider: settings.activeProvider,
              selectedModel: settings.selectedModel
          });
          
          alert("✅ Berhasil Sinkronisasi Cloud!");
      } catch (e: any) {
          alert("❌ Gagal Sinkronisasi: " + e.message);
      }
  }, [settings, user]); 

  const activeProject = useMemo(() => {
      const found = settings.projects.find(p => p.id === settings.activeProjectId);
      if (found) return found;
      return settings.projects[0] || FALLBACK_PROJECT;
  }, [settings.projects, settings.activeProjectId]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, updateProject, activeProject, syncToCloud }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
