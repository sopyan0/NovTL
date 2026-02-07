
import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useChat } from '../contexts/ChatContext';

interface AIChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIChatDrawer: React.FC<AIChatDrawerProps> = ({ isOpen, onClose }) => {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const previousLengthRef = useRef(0);
  
  // A11y: Pass the container ref to the focus trap hook, ensure it has tabIndex={-1}
  const drawerRef = useFocusTrap(isOpen, onClose);
  
  const {
    messages,
    input,
    setInput,
    isTyping,
    processUserMessage,
    executeGlossaryAction,
    cancelAction,
    clearChat
  } = useChat();

  useEffect(() => {
    if (isOpen && messages.length > previousLengthRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      previousLengthRef.current = messages.length;
    }
  }, [messages.length, isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    processUserMessage();
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-charcoal/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
        onClick={onClose}
        aria-hidden="true"
      />
      <aside 
        ref={drawerRef}
        tabIndex={-1} // Important for focus trap fallback
        className={`fixed top-0 right-0 h-full w-full md:w-[450px] bg-paper shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Danggo Assistant Chat"
      >
        
        {/* HEADER */}
        <div className="p-5 bg-card border-b border-border flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-charcoal rounded-xl flex items-center justify-center text-white font-serif font-bold text-xl">🍡</div>
                <h3 className="font-bold text-charcoal font-serif text-lg">Danggo Asisten</h3>
            </div>
            <div className="flex items-center gap-1">
                <button 
                  onClick={clearChat}
                  className="p-2 text-subtle hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Hapus Chat"
                  aria-label="Bersihkan riwayat chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
                <button onClick={onClose} className="p-2 text-subtle hover:bg-gray-100 dark:hover:bg-border rounded-lg" aria-label="Tutup chat">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        </div>
        
        <div className="flex-grow overflow-y-auto p-4 space-y-6 custom-scrollbar bg-paper">
            {messages.filter(m => !m.isHidden).map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm transition-all overflow-hidden ${msg.role === 'user' ? 'bg-accent text-white' : 'bg-card border border-border text-charcoal'}`}>
                        {/* MARKDOWN RENDERER DENGAN SUPPORT TABEL */}
                        <div className={`prose prose-sm max-w-none prose-invert ${msg.role === 'user' ? 'prose-headings:text-white prose-p:text-white prose-strong:text-white' : ''}`}>
                            <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    // Custom rendering untuk tabel agar bisa discroll horizontal
                                    table: ({node, ...props}) => (
                                        <div className="overflow-x-auto my-4 rounded-lg border border-white/20">
                                            <table className="min-w-full divide-y divide-white/20 text-left text-xs" {...props} />
                                        </div>
                                    ),
                                    th: ({node, ...props}) => <th className="px-3 py-2 bg-black/10 font-bold" {...props} />,
                                    td: ({node, ...props}) => <td className="px-3 py-2 border-t border-white/10" {...props} />
                                }}
                            >
                                {msg.text}
                            </ReactMarkdown>
                        </div>
                    </div>

                    {msg.pendingAction && (
                      <div className="mt-3 w-[85%] bg-card border-2 border-accent/20 rounded-2xl p-4 shadow-xl animate-in zoom-in-95 duration-300 ring-4 ring-accent/5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xl">⚠️</span>
                          <p className="text-[10px] font-bold text-accent uppercase tracking-[0.2em]">Konfirmasi Diperlukan</p>
                        </div>
                        <div className="bg-paper rounded-xl p-3 mb-4 space-y-2 border border-border">
                          <p className="text-[11px] text-subtle font-medium">
                            Terapkan {msg.pendingAction.type === 'ADD_GLOSSARY' ? 'penambahan' : 'penghapusan'} berikut?
                          </p>
                          <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar">
                            {msg.pendingAction.type === 'ADD_GLOSSARY' 
                                ? msg.pendingAction.payload.map((p, i) => (
                                    <div key={i} className="text-[10px] font-mono p-2 rounded border bg-card border-border flex justify-between">
                                        <span className="text-subtle">{p.original}</span>
                                        <span className="text-accent font-bold">→ {p.translated}</span>
                                    </div>
                                ))
                                : msg.pendingAction.payload.map((p, i) => (
                                    <div key={i} className="text-[10px] font-mono p-2 rounded border bg-red-50 text-red-600 border-red-100 flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <span className="font-bold">🗑️ Hapus: {p.original}</span>
                                            {p.translated && <span className="text-[9px] opacity-70">({p.translated})</span>}
                                        </div>
                                    </div>
                                ))
                            }
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => executeGlossaryAction(msg.pendingAction!.type, msg.pendingAction!.payload, msg.id)}
                            className="flex-grow py-3 bg-accent text-white rounded-xl text-xs font-bold shadow-md hover:bg-accentHover active:scale-95 transition-all"
                          >
                            Setujui
                          </button>
                          <button 
                            onClick={() => cancelAction(msg.id)}
                            className="px-4 py-3 bg-gray-100 dark:bg-border text-charcoal rounded-xl text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}
                </div>
            ))}
            <div aria-live="polite">
                {isTyping && <div className="text-[11px] text-subtle italic animate-pulse flex items-center gap-2 pl-2">
                <div className="flex gap-1">
                    <span className="w-1 h-1 bg-accent rounded-full animate-bounce"></span>
                    <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
                Danggo sedang merenung...
                </div>}
            </div>
            <div ref={chatEndRef} />
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 bg-card border-t border-border">
            <div className="flex items-center gap-2 bg-paper p-2 rounded-2xl border border-border focus-within:border-accent/30 transition-colors shadow-inner-light">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Tanya Danggo..."
                    className="flex-grow bg-transparent border-none focus:ring-0 text-sm p-2 text-charcoal placeholder-gray-400 dark:placeholder-gray-600"
                />
                <button type="submit" disabled={!input.trim() || isTyping} className="p-2.5 bg-charcoal text-white rounded-xl shadow-md disabled:opacity-30 active:scale-90 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                </button>
            </div>
        </form>
      </aside>
    </>
  );
};

export default AIChatDrawer;
