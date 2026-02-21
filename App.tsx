
/*
 * NovTL Studio - Main Application Entry
 * Copyright (c) 2025 NovTL Studio. All Rights Reserved.
 *
 * This file handles global state providers, routing (simple), and main layout structure.
 */

import React, { useState, Suspense, useEffect } from 'react';
import { Page } from './types';
import Sidebar from './components/Sidebar';
import TranslationInterface from './components/TranslationInterface';
import SettingsPage from './components/SettingsPage';
import ErrorBoundary from './components/ErrorBoundary'; 
import { EditorProvider } from './contexts/EditorContext';
import { ChatProvider } from './contexts/ChatContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { AuthProvider } from './contexts/AuthContext'; 
import { AuthGuard } from './components/AuthGuard'; 
import { BatchTranslationProvider } from './contexts/BatchTranslationContext';
import { ensureDbReady } from './utils/storage';
import AIChatDrawer from './components/AIChatDrawer';
import HelpModal from './components/HelpModal';

// Lazy Load Heavy Components
const SavedTranslationsPage = React.lazy(() => import('./components/SavedTranslationsPage')); 

// Wrapper to cleaner App component
const AppProviders: React.FC<{children: React.ReactNode}> = ({ children }) => (
  <ErrorBoundary>
    <AuthProvider>
        <AuthGuard>
            <EditorProvider>
                <SettingsProvider> 
                    <LanguageProvider>
                        <ChatProvider>
                            <BatchTranslationProvider>
                                {children}
                            </BatchTranslationProvider>
                        </ChatProvider>
                    </LanguageProvider>
                </SettingsProvider>
            </EditorProvider>
        </AuthGuard>
    </AuthProvider>
  </ErrorBoundary>
);

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('translate'); 
  const [isChatOpen, setIsChatOpen] = useState(false); 
  const [isHelpOpen, setIsHelpOpen] = useState(false); 
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const toggleSidebar = () => setIsSidebarCollapsed(prev => !prev);
  const openChat = () => setIsChatOpen(true); 

  // Safe LocalStorage Access
  useEffect(() => {
      try {
        const hasSeenHelp = localStorage.getItem('novtl_seen_help');
        if (!hasSeenHelp) {
            setIsHelpOpen(true);
            localStorage.setItem('novtl_seen_help', 'true');
        }
      } catch (e) {
        console.warn("LocalStorage access denied or failed:", e);
      }
  }, []);

  return (
    <div className="flex min-h-screen bg-paper text-charcoal font-sans selection:bg-accent/20">
      <Sidebar 
        currentPage={currentPage} 
        onNavigate={setCurrentPage} 
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      <main 
        role="main" 
        className={`flex-grow transition-all duration-300 px-4 md:px-8 
          pt-24 pb-32 md:py-12 md:pb-32 
          ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'} ml-0 w-full overflow-x-hidden relative`}
      >
        {/* User Info Header (Local Mode) */}
        <div className="absolute top-4 right-4 md:right-8 z-30 flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
            <span className="text-xs font-bold text-subtle hidden md:inline">Local Storage</span>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white bg-charcoal`}>
                L
            </div>
        </div>

        <div className="w-full max-w-[1600px] mx-auto">
          <Suspense fallback={<div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-gray-200 border-t-accent rounded-full animate-spin"></div></div>}>
            {currentPage === 'translate' && (
                <TranslationInterface isSidebarCollapsed={isSidebarCollapsed} />
            )}
            {currentPage === 'settings' && <SettingsPage />}
            {currentPage === 'saved-translations' && <SavedTranslationsPage />}
          </Suspense>
        </div>
        
        <footer className="text-center text-subtle text-xs mt-10 py-4 font-serif tracking-widest opacity-50 hidden md:block">
            NOVTL STUDIO &bull; LOCAL EDITION
        </footer>
      </main>

      {/* Chat Button */}
      <button
        onClick={openChat}
        className={`fixed right-4 md:right-8 p-4 bg-charcoal text-paper rounded-full shadow-2xl hover:bg-accent hover:scale-110 transition-all duration-300 z-50 group border border-white/10 
          ${currentPage === 'translate' ? 'bottom-32 md:bottom-32' : 'bottom-6 md:bottom-8'}`}
        title="Chat AI Assistant"
      >
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="relative inline-flex rounded-full h-3 w-3 bg-accentHover"></span>
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Drawers and Modals */}
      <AIChatDrawer 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
      />
      
      {isHelpOpen && (
          <HelpModal 
              isOpen={isHelpOpen} 
              onClose={() => setIsHelpOpen(false)} 
          />
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [isSystemReady, setIsSystemReady] = useState(false);

  useEffect(() => {
      // INIT SYSTEM SERVICES WITH UI FEEDBACK
      const startInit = async () => {
          try {
              await ensureDbReady();
          } catch (err) {
              console.error("System Init encountered issues (proceeding anyway):", err);
          } finally {
              setIsSystemReady(true);
          }
      };
      startInit();
  }, []);

  if (!isSystemReady) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F7F2] p-4 text-center">
               <div className="dango-loader text-5xl mb-4 animate-bounce">🍡</div>
               <h2 className="text-xl font-serif font-bold text-charcoal animate-pulse">NovTL Studio</h2>
               <p className="text-xs text-subtle mt-2">Initializing System...</p>
          </div>
      );
  }

  return (
    <AppProviders>
        <AppContent />
    </AppProviders>
  );
};

export default App;
