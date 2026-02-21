import React from 'react';
import { useBatchTranslation } from '../contexts/BatchTranslationContext';
import { useSettings } from '../contexts/SettingsContext';

const BatchProgressWidget: React.FC = () => {
    const { isBatchTranslating, batchProgress, stopBatchTranslation } = useBatchTranslation();
    const { settings } = useSettings();

    if (!isBatchTranslating) return null;

    const percentage = Math.round((batchProgress.current / batchProgress.total) * 100) || 0;

    return (
        <div className="fixed top-24 right-4 md:right-8 z-[9999] animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="bg-paper/90 backdrop-blur-md border border-border shadow-2xl rounded-2xl p-4 flex items-center gap-4 max-w-xs md:max-w-sm">
                {/* Circular Progress / Image */}
                <div className="relative w-12 h-12 flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            className="text-gray-200 dark:text-gray-700"
                        />
                        <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            strokeDasharray={125.6}
                            strokeDashoffset={125.6 - (125.6 * percentage) / 100}
                            className="text-accent transition-all duration-500 ease-out"
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-charcoal">
                        {percentage}%
                    </div>
                </div>

                {/* Text Info */}
                <div className="flex-grow min-w-0">
                    <h4 className="text-sm font-bold text-charcoal truncate">Batch Translating...</h4>
                    <p className="text-xs text-subtle truncate">{batchProgress.current} / {batchProgress.total} - {batchProgress.currentTitle}</p>
                </div>

                {/* Stop Button */}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Hentikan proses batch?')) {
                            stopBatchTranslation();
                        }
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 transition-colors"
                    title="Stop Batch"
                >
                    ⏹
                </button>
            </div>
        </div>
    );
};

export default BatchProgressWidget;
