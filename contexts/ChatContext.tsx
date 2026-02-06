import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { ChatMessage, PendingAction, AddGlossaryPayload, DeleteGlossaryPayload, GlossaryActionType } from '../types';
import { chatWithAssistant, hasValidApiKey } from '../services/llmService';
import { generateId } from '../utils/id';
import { useSettings } from './SettingsContext';
import { useEditor } from './EditorContext';
import { getTranslationsByProjectId, saveChatToDB, getChatHistoryFromDB, clearChatHistoryFromDB } from '../utils/storage';
import { useAuth } from './AuthContext';

interface ChatContextType {
  messages: ChatMessage[];
  input: string;
  setInput: (val: string) => void;
  isTyping: boolean;
  processUserMessage: (textOverride?: string, isHiddenInfo?: boolean, recursionDepth?: number) => Promise<void>;
  executeGlossaryAction: (type: GlossaryActionType, payload: any[], messageId: string) => void;
  cancelAction: (messageId: string) => void;
  clearChat: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const WELCOME_MSG_ID = "Halo Kakak Author! 🍡 Danggo siap membantu mengelola glosarium novel Kakak. Ada yang bisa Danggo bantu hari ini?";
const WELCOME_MSG_EN = "Hello Author! 🍡 Danggo is ready to help manage your novel's glossary. How can I help you today?";

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings, activeProject, updateProject } = useSettings();
  const { sourceText, translatedText } = useEditor();
  const { user } = useAuth();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]); 

  // --- INITIALIZATION (LOAD FROM DB) ---
  useEffect(() => {
    const initChat = async () => {
        const isEnglish = settings.appLanguage === 'en';
        
        if (user) {
            try {
                const dbMessages = await getChatHistoryFromDB();
                if (dbMessages.length > 0) {
                    setMessages(dbMessages);
                    messagesRef.current = dbMessages;
                    return;
                }
            } catch (e) {
                console.warn("Failed to load chat from DB", e);
            }
        }

        // Default Welcome Message if no history
        const initialText = isEnglish ? WELCOME_MSG_EN : WELCOME_MSG_ID;
        const initial: ChatMessage = { 
            id: generateId(), 
            role: 'model', 
            text: initialText,
            timestamp: Date.now()
        };
        setMessages([initial]);
        messagesRef.current = [initial];
    };

    initChat();
  }, [user, settings.appLanguage]);

  // HELPER: Add message to State AND DB
  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
        const next = [...prev, msg];
        messagesRef.current = next;
        return next;
    });
    // Sync to DB
    saveChatToDB(msg).catch(e => console.error("Chat sync failed", e));
  }, []);

  const updateMessageText = useCallback((id: string, newText: string) => {
      setMessages(prev => {
          const next = prev.map(m => m.id === id ? { ...m, text: newText, pendingAction: undefined } : m);
          messagesRef.current = next;
          return next;
      });
      // Update in DB
      const updatedMsg = messagesRef.current.find(m => m.id === id);
      if (updatedMsg) {
          saveChatToDB({ ...updatedMsg, text: newText }).catch(e => console.error("Chat update failed", e));
      }
  }, []);

  const clearAllPendingActions = useCallback(() => {
      setMessages(prev => {
          const next = prev.map(m => ({ ...m, pendingAction: undefined }));
          messagesRef.current = next;
          return next;
      });
  }, []);

  const clearChat = useCallback(async () => {
      const isEnglish = settings.appLanguage === 'en';
      const resetMsg: ChatMessage = { 
          id: generateId(), 
          role: 'model', 
          text: isEnglish 
            ? 'Chat memory cleared! Danggo is ready to start fresh. 🍡' 
            : 'Memori chat sudah Danggo bersihkan! Danggo siap mulai dari awal. 🍡',
          timestamp: Date.now()
      };
      
      setMessages([resetMsg]);
      messagesRef.current = [resetMsg];
      
      try {
          await clearChatHistoryFromDB();
          await saveChatToDB(resetMsg);
      } catch (e) {
          console.error("Failed to clear chat DB", e);
      }
  }, [settings.appLanguage]);

  const executeGlossaryAction = useCallback((type: GlossaryActionType, payload: any[], messageId: string) => {
    const targetMsg = messagesRef.current.find(m => m.id === messageId);
    if (!targetMsg) return;

    updateProject(activeProject.id, prevProject => {
        let newGlossary = [...prevProject.glossary];
        const isEnglish = settings.appLanguage === 'en';

        if (type === 'ADD_GLOSSARY') {
            const addPayload = payload as AddGlossaryPayload[];
            const existingOrignals = new Set(newGlossary.map(g => g.original.toLowerCase().trim()));
            
            const newItems = addPayload
                .filter(item => item.original && !existingOrignals.has(item.original.toLowerCase().trim()))
                .map((item) => ({
                    id: generateId(),
                    original: item.original.trim(),
                    translated: item.translated.trim(),
                    sourceLanguage: activeProject.sourceLanguage
                }));

            if (newItems.length === 0 && addPayload.length > 0) {
                 setTimeout(() => {
                    const dupMsg = isEnglish 
                        ? 'Those words are already in your glossary. I won\'t add duplicates! ✨'
                        : 'Ternyata kata tersebut sudah ada di glosarium Kakak. Danggo tidak menambahkannya lagi agar tidak duplikat ya! ✨';
                    addMessage({ id: generateId(), role: 'model', text: dupMsg, timestamp: Date.now() });
                 }, 300);
                 return prevProject;
            }
            newGlossary = [...newGlossary, ...newItems];
        } else {
             // DELETE ACTION (FIXED LOGIC FOR DUPLICATES)
             const confirmMsg = isEnglish
                ? "Are you sure you want to delete these words?"
                : "Yakin ingin menghapus kata-kata ini?";
             
             const confirmDelete = window.confirm(confirmMsg);
             if (!confirmDelete) return prevProject;

             const deletePayload = payload as DeleteGlossaryPayload[];
             deletePayload.forEach(item => {
                 const target = item.original.toLowerCase().trim();
                 const index = newGlossary.findIndex(g => g.original.toLowerCase().trim() === target);
                 if (index !== -1) {
                     newGlossary.splice(index, 1);
                 }
             });
        }
        
        const successTag = isEnglish ? "\n\n✅ *Action applied!*" : "\n\n✅ *Aksi berhasil diterapkan!*";
        updateMessageText(messageId, targetMsg.text + successTag);
        return { ...prevProject, glossary: newGlossary };
    });
  }, [updateProject, activeProject, updateMessageText, addMessage, settings.appLanguage]);

  const cancelAction = useCallback((messageId: string) => {
    const targetMsg = messagesRef.current.find(m => m.id === messageId);
    if (!targetMsg) return;
    
    const isEnglish = settings.appLanguage === 'en';
    const cancelTag = isEnglish ? "\n\n❌ *Action cancelled.*" : "\n\n❌ *Aksi dibatalkan.*";

    updateMessageText(messageId, targetMsg.text + cancelTag);
    
    addMessage({
        id: generateId(),
        role: 'user',
        text: "[SYSTEM: User cancelled the proposed action. Do not execute it.]",
        isHidden: true,
        timestamp: Date.now()
    });
  }, [updateMessageText, addMessage, settings.appLanguage]);

  const processUserMessage = useCallback(async (textOverride?: string, isHiddenInfo: boolean = false, recursionDepth = 0, forceFullContext: boolean = false) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || (isTyping && !forceFullContext)) return;
    
    const isEnglish = settings.appLanguage === 'en';

    if (textToSend.trim().toLowerCase() === 'stop' || textToSend.trim().toLowerCase() === 'berhenti') {
        clearAllPendingActions();
        setInput('');
        const stopMsg = isEnglish ? '🛑 Danggo stopped. Anything else?' : '🛑 Danggo berhenti dan reset status. Ada yang lain?';
        addMessage({ id: generateId(), role: 'model', text: stopMsg, timestamp: Date.now() });
        return;
    }

    if (recursionDepth > 3) {
        addMessage({ id: generateId(), role: 'model', text: '⚠️ *System Loop Detected.* Stopping context retrieval.', timestamp: Date.now() });
        setIsTyping(false);
        return;
    }

    if (!isHiddenInfo && !forceFullContext) {
        clearAllPendingActions();
        setInput('');
    }
    
    if (!forceFullContext) {
        const userMsg: ChatMessage = { 
            id: generateId(), 
            role: 'user', 
            text: textToSend, 
            isHidden: isHiddenInfo, 
            timestamp: Date.now() 
        };
        addMessage(userMsg);
    }

    if (!hasValidApiKey(settings)) {
        const errorMsg = isEnglish 
            ? `⚠️ Sorry, I can't run because **API Key ${settings.activeProvider}** is missing. \n\nPlease enter it in **Settings** or via the 🔑 API button!`
            : `⚠️ Maaf Kak, Danggo tidak bisa jalan karena **API Key ${settings.activeProvider}** masih kosong. \n\nSilakan masukkan kuncinya di menu **Setelan** atau lewat tombol 🔑 API di halaman utama ya!`;
        
        addMessage({ 
            id: generateId(), 
            role: 'model', 
            text: errorMsg, 
            timestamp: Date.now() 
        });
        return;
    }

    setIsTyping(true);

    try {
        const result = await chatWithAssistant(
            textToSend, 
            settings, 
            activeProject, 
            messagesRef.current,
            { sourceText: sourceText, translatedText: translatedText }, 
            settings.appLanguage || 'id',
            forceFullContext 
        );

        if (result.type === 'CLEAR_CHAT') {
            clearChat();
            return;
        }

        if (result.type === 'READ_FULL_EDITOR_AND_REPROCESS') {
            console.log("Danggo requesting full context...");
            await processUserMessage(textToSend, true, recursionDepth + 1, true);
            return; 
        }

        if (result.type === 'READ_SAVED_TRANSLATION') {
            // ... (Same logic as before, just kept concise for XML)
            const query = result.payload.toLowerCase().trim();
            const allTranslations = await getTranslationsByProjectId(settings.activeProjectId);
            const titleMatch = allTranslations.find(t => t.name.toLowerCase().includes(query));

            let relevantContext = "";
            let matchCount = 0;
            let foundTitle = "";

            if (titleMatch) {
                const SAFE_LIMIT = 20000;
                const contentPreview = titleMatch.translatedText.slice(0, SAFE_LIMIT);
                relevantContext = `[DITEMUKAN BAB UTUH: "${titleMatch.name}"]\nISI KONTEN:\n${contentPreview}`;
                matchCount = 1;
                foundTitle = titleMatch.name;
            } else {
                 // Search Logic
                 const contentMatches = allTranslations.filter(t => t.translatedText.toLowerCase().includes(query));
                 const topMatches = contentMatches.slice(0, 5);
                 matchCount = topMatches.length;
                 if (topMatches.length > 0) {
                     relevantContext = topMatches.map(m => `SUMBER: **${m.name}**\nTEMUAN:\n${m.translatedText.slice(0, 500)}...`).join('\n\n');
                 }
            }

            if (matchCount > 0) {
                const dataInjection = `[SYSTEM INFO: Danggo mencari "${result.payload}" dan menemukan data ini.]\n\n${relevantContext}`;
                await processUserMessage(dataInjection, true, recursionDepth + 1);
            } else {
                const notFoundMsg = isEnglish ? "I searched but couldn't find it." : "Danggo mencari tapi tidak ketemu, Kak.";
                addMessage({ id: generateId(), role: 'model', text: notFoundMsg, timestamp: Date.now() });
            }
            return;
        }

        let pendingAction: PendingAction | undefined;
        let finalMessage = result.message;

        if (result.type === 'ADD_GLOSSARY') {
             // ... (Glossary Logic Same)
            const existingOrignals = new Set(activeProject.glossary.map(g => g.original.toLowerCase().trim()));
            const validItems = result.payload.filter(p => p.original && !existingOrignals.has(p.original.toLowerCase().trim()));
            if (validItems.length > 0) {
                pendingAction = { type: 'ADD_GLOSSARY', payload: validItems };
            } else if (result.message.includes('tambah') || result.message.includes('add')) {
                const dupMsg = isEnglish ? 'Duplicates detected! ✨' : 'Kata sudah ada di glosarium! ✨';
                addMessage({ id: generateId(), role: 'model', text: dupMsg, timestamp: Date.now() });
                setIsTyping(false);
                return;
            }
        } else if (result.type === 'DELETE_GLOSSARY') {
            const verifiedPayload: DeleteGlossaryPayload[] = [];
            result.payload.forEach(req => {
                const reqLower = req.original.toLowerCase().trim();
                const match = activeProject.glossary.find(g => g.original.toLowerCase().trim() === reqLower);
                if (match) verifiedPayload.push({ original: match.original, translated: match.translated });
            });
            if (verifiedPayload.length > 0) {
                pendingAction = { type: 'DELETE_GLOSSARY', payload: verifiedPayload };
            }
        }

        addMessage({
            id: generateId(),
            role: 'model',
            text: finalMessage,
            pendingAction,
            timestamp: Date.now()
        });

    } catch (error: any) {
        addMessage({ id: generateId(), role: 'model', text: `Error: ${error.message}`, timestamp: Date.now() });
    } finally {
        setIsTyping(false);
    }

  }, [input, isTyping, settings, activeProject, sourceText, translatedText, addMessage, clearChat, clearAllPendingActions]);

  return (
    <ChatContext.Provider value={{ messages, input, setInput, isTyping, processUserMessage, executeGlossaryAction, cancelAction, clearChat }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used within ChatProvider");
  return context;
};