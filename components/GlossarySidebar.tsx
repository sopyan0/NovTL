import React from 'react';

interface GlossarySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isExtracting: boolean;
  extractedGlossary: { original: string; translated: string; selected: boolean }[];
  setExtractedGlossary: React.Dispatch<React.SetStateAction<{ original: string; translated: string; selected: boolean }[]>>;
  onSave: () => void;
}

export const GlossarySidebar: React.FC<GlossarySidebarProps> = ({
  isOpen,
  onClose,
  isExtracting,
  extractedGlossary,
  setExtractedGlossary,
  onSave
}) => {
  return (
    <div className={`fixed inset-y-0 right-0 w-80 bg-paper shadow-2xl z-[60] transform transition-transform duration-300 flex flex-col border-l border-border ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="p-4 border-b border-border bg-card flex justify-between items-center">
        <h3 className="font-bold text-charcoal font-serif">Ekstrak Glosarium</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">✕</button>
      </div>

      <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
        {isExtracting ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-subtle">Menganalisis teks...</span>
          </div>
        ) : extractedGlossary.length === 0 ? (
          <div className="text-center text-subtle text-sm mt-10">Tidak ada istilah baru ditemukan.</div>
        ) : (
          <div className="space-y-3">
            {extractedGlossary.map((item, idx) => (
              <div key={idx} className={`p-3 rounded-xl border transition-all ${item.selected ? 'bg-accent/5 border-accent' : 'bg-card border-border opacity-60'}`}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => setExtractedGlossary(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p))}
                    className="mt-1"
                  />
                  <div className="flex-grow min-w-0">
                    <input
                      value={item.original}
                      onChange={(e) => setExtractedGlossary(prev => prev.map((p, i) => i === idx ? { ...p, original: e.target.value } : p))}
                      className="w-full bg-transparent text-xs font-bold text-charcoal outline-none border-b border-transparent focus:border-accent mb-1"
                    />
                    <input
                      value={item.translated}
                      onChange={(e) => setExtractedGlossary(prev => prev.map((p, i) => i === idx ? { ...p, translated: e.target.value } : p))}
                      className="w-full bg-transparent text-xs text-accent outline-none border-b border-transparent focus:border-accent"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border bg-card space-y-2">
        <button
          onClick={onSave}
          disabled={isExtracting || extractedGlossary.filter(g => g.selected).length === 0}
          className="w-full py-3 bg-accent text-white rounded-xl font-bold text-sm shadow-md hover:bg-accentHover disabled:opacity-50"
        >
          Simpan ({extractedGlossary.filter(g => g.selected).length})
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 bg-gray-100 text-charcoal rounded-xl font-bold text-sm hover:bg-gray-200"
        >
          Batal
        </button>
      </div>
    </div>
  );
};
