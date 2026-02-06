
import React from 'react';
import { Page } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenHelp: () => void; 
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, isCollapsed, onToggleCollapse, onOpenHelp }) => {
  const { t } = useLanguage();
  
  const navItems: { id: Page; label: string; icon: string }[] = [
    { id: 'translate', label: t('sidebar.editor'), icon: '✍️' },
    { id: 'saved-translations', label: t('sidebar.collection'), icon: '📚' },
    { id: 'settings', label: t('sidebar.settings'), icon: '⚙️' },
  ];

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <aside 
        className={`hidden md:flex fixed left-0 top-0 h-full ${isCollapsed ? 'w-20' : 'w-64'} bg-white/80 dark:bg-black/40 backdrop-blur-xl border-r border-border flex-col z-50 transition-all duration-300 shadow-soft`}
      >
        <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} mb-4`}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('translate')} role="button" aria-label="Go to editor">
              <div className="relative">
                <div className="w-10 h-10 bg-charcoal rounded-xl flex items-center justify-center text-paper font-serif font-bold text-xl shadow-lg">
                  N
                </div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-bold text-charcoal tracking-tight font-serif">NovTL</h1>
              </div>
            </div>
          )}
          {isCollapsed && (
             <div className="w-10 h-10 bg-charcoal rounded-xl flex items-center justify-center text-paper font-serif font-bold text-xl shadow-lg cursor-pointer" onClick={() => onNavigate('translate')} role="button" aria-label="Go to editor">N</div>
          )}

          <button 
            onClick={onToggleCollapse}
            className={`p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-charcoal transition-colors ${isCollapsed ? 'absolute -right-3 top-8 bg-card shadow-md border border-border rounded-full' : ''}`}
            title={isCollapsed ? "Expand" : "Collapse"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
             {isCollapsed ? (
               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
             ) : (
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
             )}
          </button>
        </div>

        <nav className="flex-grow px-3 space-y-2" aria-label="Main Navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-4 py-3.5 px-3 rounded-xl transition-all duration-300 group relative overflow-hidden
                ${currentPage === item.id 
                  ? 'bg-paper dark:bg-white/10 text-charcoal shadow-sm' 
                  : 'text-gray-400 hover:text-charcoal hover:bg-white/50 dark:hover:bg-white/5'
                }`}
              title={isCollapsed ? item.label : ''}
              aria-label={item.label}
              aria-current={currentPage === item.id ? 'page' : undefined}
            >
              {currentPage === item.id && !isCollapsed && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r-full"></div>
              )}
              <span className={`text-xl transition-transform duration-300 ${currentPage === item.id ? 'scale-110' : 'group-hover:scale-110 grayscale group-hover:grayscale-0'}`} aria-hidden="true">
                  {item.icon}
              </span>
              {!isCollapsed && (
                <span className={`font-medium tracking-wide text-sm ${currentPage === item.id ? 'font-bold' : ''}`}>
                    {item.label}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className={`p-4 border-t border-border flex flex-col gap-2 ${isCollapsed ? 'items-center' : ''}`}>
             <button
                onClick={onOpenHelp}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-4 py-3 px-3 rounded-xl text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all duration-300 font-bold text-sm`}
                title={t('sidebar.help')}
             >
                  <span className="text-xl">❓</span>
                  {!isCollapsed && <span>{t('sidebar.help')}</span>}
             </button>
        </div>
      </aside>

      {/* MOBILE TOP NAVIGATION */}
      <nav className="md:hidden fixed top-0 left-0 right-0 bg-white/95 dark:bg-black/80 backdrop-blur-xl border-b border-border z-50 px-4 py-3 shadow-sm h-16 flex items-center justify-between" aria-label="Mobile Navigation">
         <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-charcoal rounded-lg flex items-center justify-center text-paper font-serif font-bold text-lg shadow-sm">
              N
            </div>
            <span className="text-lg font-bold text-charcoal font-serif tracking-tight">NovTL</span>
         </div>

         <div className="flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`p-2 rounded-lg transition-all flex flex-col items-center justify-center relative
                ${currentPage === item.id ? 'text-charcoal bg-gray-100 dark:bg-white/10' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}
              title={item.label}
              aria-label={item.label}
              aria-current={currentPage === item.id ? 'page' : undefined}
            >
              <span className="text-xl leading-none" aria-hidden="true">
                {item.icon}
              </span>
              {currentPage === item.id && (
                  <div className="absolute -bottom-1 w-1 h-1 bg-accent rounded-full"></div>
              )}
            </button>
          ))}
            {/* Mobile Help Button */}
            <button
              onClick={onOpenHelp}
              className="p-2 text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg ml-2"
              title={t('sidebar.help')}
            >
                <span className="text-xl font-bold">?</span>
            </button>
         </div>
      </nav>
    </>
  );
};

export default Sidebar;
