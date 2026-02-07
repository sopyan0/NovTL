
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef, useMemo } from 'react';
import { AppSettings, NovelProject } from '../types';
import { STORAGE_KEY, DEFAULT_SETTINGS } from '../constants';
import { 
    saveGlossaryToDB, 
    saveProjectToDB, 
    getProjectsFromDB,
    loadFullProject
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

  // 1. Load Settings & Metadata
  useEffect(() => {
    const init = async () => {
        if (isHydratingRef.current) return;
        isHydratingRef.current = true;

        const saved = localStorage.getItem(STORAGE_KEY);
        let parsedSettings = { ...DEFAULT_SETTINGS };

        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                parsedSettings = { ...DEFAULT_SETTINGS, ...parsed };
            } catch (e) {}
        }

        try {
            const fsProjects = await getProjectsFromDB();
            if (fsProjects.length > 0) {
                // Merge logic: Don't just overwrite, ensure we keep active selection valid
                parsedSettings.projects = fsProjects;
            }
        } catch (e) {}

        // 2. LANGSUNG MUAT DATA FULL (GLOSSARY) UNTUK PROYEK AKTIF
        if (parsedSettings.activeProjectId) {
            const fullData = await loadFullProject(parsedSettings.activeProjectId);
            if (fullData) {
                const idx = parsedSettings.projects.findIndex(p => p.id === parsedSettings.activeProjectId);
                if (idx !== -1) parsedSettings.projects[idx] = fullData;
            }
        }

        setSettings(parsedSettings);
        setIsLoaded(true);
        isHydratingRef.current = false;
    };

    init();
  }, [user]);

  // 3. RE-LOAD FULL PROJECT SAAT GANTI PROYEK
  useEffect(() => {
      if (!isLoaded || !settings.activeProjectId) return;
      
      const refreshProject = async () => {
          const current = settings.projects.find(p => p.id === settings.activeProjectId);
          // Hanya reload jika glossary saat ini kosong tapi di storage ada isinya
          if (current && current.glossary.length === 0) {
              const fullData = await loadFullProject(settings.activeProjectId);
              if (fullData && fullData.glossary.length > 0) {
                  setSettings(prev => {
                      const idx = prev.projects.findIndex(p => p.id === settings.activeProjectId);
                      if (idx === -1) return prev;
                      const newProjects = [...prev.projects];
                      newProjects[idx] = fullData;
                      return { ...prev, projects: newProjects };
                  });
              }
          }
      };
      refreshProject();
  }, [settings.activeProjectId, isLoaded]);

  // 4. Save Settings to LocalStorage (Metadata only untuk hemat ruang)
  useEffect(() => {
    if (!isLoaded) return;
    const settingsToSave = {
        ...settings,
        projects: settings.projects.map(p => ({ ...p, glossary: [] })) 
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave));
  }, [settings, isLoaded]);

  useEffect(() => {
      const root = window.document.documentElement;
      if (settings.theme === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
  }, [settings.theme]);

  const updateSettings = useCallback((updates: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => {
    setSettings(prev => {
      const next = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };
      
      // Jika ada penambahan project baru via settings update biasa (fallback case), paksa save ke DB
      if (next.projects.length > prev.projects.length) {
          const newProj = next.projects.find(p => !prev.projects.some(old => old.id === p.id));
          if (newProj) saveProjectToDB(newProj).catch(console.error);
      }
      
      return next;
    });
  }, []);

  const updateProject = useCallback((projectId: string, updates: Partial<NovelProject> | ((prev: NovelProject) => NovelProject)) => {
    setSettings(prev => {
      const projectIndex = prev.projects.findIndex(p => p.id === projectId);
      if (projectIndex === -1) return prev;

      const oldProject = prev.projects[projectIndex];
      const updatedProjectData = typeof updates === 'function' ? updates(oldProject) : { ...oldProject, ...updates };
      
      // ALWAYS SAVE TO DB ON UPDATE
      saveProjectToDB(updatedProjectData).catch(console.error);

      if (updatedProjectData.glossary !== oldProject.glossary) {
          saveGlossaryToDB(projectId, updatedProjectData.glossary).catch(console.error);
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
      } catch (e: any) {
          alert("❌ Gagal Sinkronisasi: " + e.message);
      }
  }, [settings]); 

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
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
