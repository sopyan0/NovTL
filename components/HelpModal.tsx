
import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useLanguage } from '../contexts/LanguageContext';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'start' | 'api' | 'glossary' | 'faq'>('start');
  const modalRef = useFocusTrap(isOpen, onClose);
  const { t } = useLanguage();

  if (!isOpen) return null;

  const tabs = [
    { id: 'start', label: t('help.tabs.start') },
    { id: 'api', label: t('help.tabs.api') },
    { id: 'glossary', label: t('help.tabs.glossary') },
    { id: 'faq', label: t('help.tabs.faq') },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-charcoal/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        tabIndex={-1}
        className="bg-paper w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-300"
      >
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center bg-card">
            <div>
                <h2 className="text-2xl font-serif font-bold text-charcoal">{t('help.title')}</h2>
                <p className="text-xs text-subtle mt-1">{t('help.subtitle')}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-border rounded-full transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-6 py-4 text-sm font-bold whitespace-nowrap transition-all border-b-2 ${
                        activeTab === tab.id 
                        ? 'border-accent text-accent bg-accent/5' 
                        : 'border-transparent text-subtle hover:text-charcoal hover:bg-gray-50 dark:hover:bg-border'
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar bg-paper leading-relaxed text-charcoal text-sm md:text-base">
            {activeTab === 'start' && (
                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <h3 className="font-serif font-bold text-xl">{t('help.start.title')}</h3>
                    <p>{t('help.start.desc')}</p>
                    <ol className="list-decimal pl-5 space-y-2 marker:text-accent marker:font-bold">
                        <li><strong>{t('help.start.step1')}:</strong> {t('help.start.step1Desc')}</li>
                        <li><strong>{t('help.start.step2')}:</strong> {t('help.start.step2Desc')}</li>
                        <li><strong>{t('help.start.step3')}:</strong> {t('help.start.step3Desc')}</li>
                        <li><strong>{t('help.start.step4')}:</strong> Simpan bab Anda dengan tombol 'Save'. Sistem otomatis mendeteksi nomor bab selanjutnya (Auto-Increment) agar tidak menimpa bab lama.</li>
                    </ol>
                </div>
            )}

            {activeTab === 'api' && (
                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <h3 className="font-serif font-bold text-xl">{t('help.api.title')}</h3>
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                        <p className="text-blue-800 dark:text-blue-200 font-bold mb-2">{t('help.api.geminiTitle')}</p>
                        <ul className="list-disc pl-5 text-sm space-y-1 text-blue-700 dark:text-blue-300">
                            <li>{t('help.api.step1')} <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline font-bold">Google AI Studio</a>.</li>
                            <li>{t('help.api.step2')}</li>
                            <li>{t('help.api.step3')}</li>
                        </ul>
                    </div>
                </div>
            )}

            {activeTab === 'glossary' && (
                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <h3 className="font-serif font-bold text-xl">{t('help.glossary.title')}</h3>
                    <p>{t('help.glossary.desc')}</p>
                    <ul className="space-y-3">
                        <li className="flex gap-3 items-start">
                            <span className="bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-200 p-2 rounded-lg text-xs font-bold mt-1">1</span>
                            <div>{t('help.glossary.step1')}</div>
                        </li>
                        <li className="flex gap-3 items-start">
                            <span className="bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-200 p-2 rounded-lg text-xs font-bold mt-1">2</span>
                            <div>{t('help.glossary.step2')}</div>
                        </li>
                    </ul>
                </div>
            )}

            {activeTab === 'faq' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                    <div>
                        <h4 className="font-bold text-charcoal">{t('help.faq.q1')}</h4>
                        <p className="text-subtle text-sm">{t('help.faq.a1')}</p>
                    </div>
                    <div>
                        <h4 className="font-bold text-charcoal">{t('help.faq.q2')}</h4>
                        <p className="text-subtle text-sm">{t('help.faq.a2')}</p>
                    </div>
                    <div>
                        <h4 className="font-bold text-charcoal">{t('help.faq.q3')}</h4>
                        <p className="text-subtle text-sm">{t('help.faq.a3')}</p>
                    </div>
                </div>
            )}
        </div>
        
        <div className="p-4 bg-card border-t border-border text-center">
            <button onClick={onClose} className="text-accent font-bold text-sm hover:underline">{t('help.close')}</button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
