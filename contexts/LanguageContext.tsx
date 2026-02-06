
import React, { createContext, useContext, ReactNode } from 'react';
import { useSettings } from './SettingsContext';
import { TRANSLATIONS } from '../constants/locales';

type Language = 'en' | 'id';
type NestedKeyOf<ObjectType extends object> = 
    {[Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object 
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`
}[keyof ObjectType & (string | number)];

type TranslationKeys = NestedKeyOf<typeof TRANSLATIONS['en']>;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings, updateSettings } = useSettings();
  
  // Default to English if undefined, or use saved setting
  const language = settings.appLanguage || 'en';

  const setLanguage = (lang: Language) => {
    updateSettings({ appLanguage: lang });
  };

  const t = (path: string): string => {
    const keys = path.split('.');
    let current: any = TRANSLATIONS[language];
    
    for (const key of keys) {
      if (current[key] === undefined) {
        console.warn(`Missing translation for key: ${path} in language: ${language}`);
        return path;
      }
      current = current[key];
    }
    return current as string;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
