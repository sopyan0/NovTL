
import React from 'react';
import { Page } from '../types';

interface NavbarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const Navbar: React.FC<NavbarProps> = ({ currentPage, onNavigate }) => {
  return (
    <nav className="sticky top-0 z-50 bg-[#f8f5f2]/80 backdrop-blur-md border-b border-stone-200/50 py-3 transition-all">
      <div className="container mx-auto px-4 max-w-6xl flex flex-col md:flex-row items-center justify-between gap-3 md:gap-0">
        
        {/* Logo Section - Lebih Clean */}
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onNavigate('translate')}>
          <div className="relative">
            <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center text-[#f8f5f2] font-serif font-bold text-2xl shadow-lg group-hover:rotate-3 transition-transform duration-300">
              N
            </div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-[#f8f5f2]"></div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-stone-900 tracking-tight font-serif leading-none group-hover:text-indigo-700 transition-colors">
              NovTL
            </h1>
            <span className="text-[0.6rem] uppercase tracking-[0.2em] text-stone-500 font-medium">
              AI Translator
            </span>
          </div>
        </div>

        {/* Navigation Buttons - Floating Tab Style */}
        <div className="flex p-1 bg-stone-200/50 rounded-2xl backdrop-blur-sm border border-stone-200/50">
          <button
            onClick={() => onNavigate('translate')}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${
              currentPage === 'translate' 
                ? 'bg-white text-stone-900 shadow-sm scale-100' 
                : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50'
            }`}
          >
            <span>✍️</span> Editor
          </button>
          <button
            onClick={() => onNavigate('saved-translations')}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${
              currentPage === 'saved-translations' 
                ? 'bg-white text-stone-900 shadow-sm scale-100' 
                : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50'
            }`}
          >
            <span>📚</span> Koleksi
          </button>
          <button
            onClick={() => onNavigate('settings')}
            className={`px-3 py-2 rounded-xl transition-all duration-300 ${
              currentPage === 'settings' 
                ? 'bg-white text-stone-900 shadow-sm' 
                : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50'
            }`}
            title="Pengaturan"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
