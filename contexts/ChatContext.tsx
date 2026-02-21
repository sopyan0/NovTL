
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { ChatMessage, PendingAction, AddGlossaryPayload, DeleteGlossaryPayload, GlossaryActionType } from '../types';
import { chatWithAssistant, chatWithAssistantStream, hasValidApiKey } from '../services/llmService';
import { generateId } from '../utils/id';
import { useSettings } from './SettingsContext';
import { useEditor } from './EditorContext';
import { searchTranslations, saveChatToDB, getChatHistoryFromDB, clearChatHistoryFromDB } from '../utils/storage';
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

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
        const next = [...prev, msg];
        messagesRef.current = next;
        return next;
    });
    saveChatToDB(msg).catch(e => console.error("Chat sync failed", e));
  }, []);

  const clearAllPendingActions = useCallback(() => {
      setMessages(prev => {
          const next = prev.map(m => {
              if (m.pendingAction) {
                  const { pendingAction, ...rest } = m;
                  saveChatToDB(rest).catch(console.error); 
                  return rest;
              }
              return m;
          });
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

            if (newItems.length === 0) return prevProject;
            newGlossary = [...newGlossary, ...newItems];
        } else {
             const deletePayload = payload as DeleteGlossaryPayload[];
             deletePayload.forEach(item => {
                 const target = item.original.toLowerCase().trim();
                 const index = newGlossary.findIndex(g => g.original.toLowerCase().trim() === target);
                 if (index !== -1) {
                     newGlossary.splice(index, 1);
                 }
             });
        }
        
        return { ...prevProject, glossary: newGlossary };
    });

    setMessages(prev => {
        const isEnglish = settings.appLanguage === 'en';
        const successTag = isEnglish ? "\n\n✅ *Action applied!*" : "\n\n✅ *Aksi berhasil diterapkan!*";
        
        const next = prev.map(m => {
            if (m.id === messageId) {
                const { pendingAction, ...cleanMessage } = m;
                const updatedMsg = { ...cleanMessage, text: m.text + successTag };
                saveChatToDB(updatedMsg).catch(console.error);
                return updatedMsg;
            }
            return m;
        });
        messagesRef.current = next;
        return next;
    });

  }, [updateProject, activeProject, settings.appLanguage]);

  const cancelAction = useCallback((messageId: string) => {
    setMessages(prev => {
        const isEnglish = settings.appLanguage === 'en';
        const cancelTag = isEnglish ? "\n\n❌ *Action cancelled.*" : "\n\n❌ *Aksi dibatalkan.*";

        const next = prev.map(m => {
            if (m.id === messageId) {
                const { pendingAction, ...cleanMessage } = m;
                const updatedMsg = { ...cleanMessage, text: m.text + cancelTag };
                saveChatToDB(updatedMsg).catch(console.error);
                return updatedMsg;
            }
            return m;
        });
        messagesRef.current = next;
        return next;
    });
    
    addMessage({
        id: generateId(),
        role: 'user',
        text: "[SYSTEM: User cancelled the proposed action.]",
        isHidden: true,
        timestamp: Date.now()
    });
  }, [addMessage, settings.appLanguage]);

  const processUserMessage = useCallback(async (textOverride?: string, isHiddenInfo: boolean = false, recursionDepth = 0, forceFullContext: boolean = false) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || (isTyping && !forceFullContext)) return;
    
    const isEnglish = settings.appLanguage === 'en';

    if (textToSend.trim().toLowerCase() === 'stop' || textToSend.trim().toLowerCase() === 'berhenti') {
        clearAllPendingActions();
        setInput('');
        const stopMsg = isEnglish ? '🛑 Danggo stopped.' : '🛑 Danggo berhenti.';
        addMessage({ id: generateId(), role: 'model', text: stopMsg, timestamp: Date.now() });
        return;
    }

    if (recursionDepth > 3) {
        addMessage({ id: generateId(), role: 'model', text: '⚠️ *System Loop Detected.*', timestamp: Date.now() });
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
            ? `⚠️ API Key Missing.`
            : `⚠️ Maaf Kak, Danggo tidak bisa jalan karena **API Key** kosong.`;
        addMessage({ id: generateId(), role: 'model', text: errorMsg, timestamp: Date.now() });
        return;
    }

    setIsTyping(true);

    // Placeholder Message ID
    const aiMsgId = generateId();
    const aiPlaceholder: ChatMessage = {
        id: aiMsgId,
        role: 'model',
        text: '', // Start empty for streaming
        timestamp: Date.now()
    };
    addMessage(aiPlaceholder);

    try {
        let accumulatedText = '';

        const result = await chatWithAssistantStream(
            textToSend, 
            settings, 
            activeProject, 
            messagesRef.current.slice(0, -1), // Exclude the placeholder we just added
            (chunk) => {
                accumulatedText += chunk;
                setMessages(prev => prev.map(m => 
                    m.id === aiMsgId ? { ...m, text: accumulatedText } : m
                ));
            },
            { sourceText: sourceText, translatedText: translatedText }, 
            settings.appLanguage || 'id',
            forceFullContext 
        );

        // Update final message with full text (ensure consistency)
        // If result.message differs (e.g. tool call result), append it or replace?
        // Usually result.message contains the text if type is NONE.
        // If type is NOT NONE (Tool Call), result.message is the confirmation prompt.
        
        if (result.type !== 'NONE') {
            // Tool call happened. The stream might have been empty or partial.
            // We should update the message with the tool confirmation text.
            accumulatedText += (accumulatedText ? '\n\n' : '') + result.message;
            setMessages(prev => prev.map(m => 
                m.id === aiMsgId ? { ...m, text: accumulatedText } : m
            ));
        }

        // Save to DB
        await saveChatToDB({ ...aiPlaceholder, text: accumulatedText });

        if (result.type === 'CLEAR_CHAT') {
            clearChat();
            return;
        }

        if (result.type === 'READ_FULL_EDITOR_AND_REPROCESS') {
            await processUserMessage(textToSend, true, recursionDepth + 1, true);
            return; 
        }

        if (result.type === 'READ_SAVED_TRANSLATION') {
            const query = result.payload.toLowerCase().trim();
            const matchedTranslations = await searchTranslations(settings.activeProjectId, query);

            let relevantContext = "";
            if (matchedTranslations.length > 0) {
                 relevantContext = matchedTranslations.map(m => 
                    `[HASIL PENCARIAN: "${m.name}"]\nTEMUAN:\n${m.translatedText.slice(0, 800)}...`
                 ).join('\n\n');
                 
                 const dataInjection = `[SYSTEM INFO: Danggo menemukan ${matchedTranslations.length} bab yang relevan di Library.]\n\n${relevantContext}`;
                 await processUserMessage(dataInjection, true, recursionDepth + 1);
            } else {
                const notFoundMsg = isEnglish ? "Not found in library." : "Tidak ditemukan di koleksi tersimpan.";
                // Append not found message
                const finalMsg = accumulatedText + '\n\n' + notFoundMsg;
                setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: finalMsg } : m));
                await saveChatToDB({ ...aiPlaceholder, text: finalMsg });
            }
            return;
        }

        let pendingAction: PendingAction | undefined;

        if (result.type === 'ADD_GLOSSARY') {
            const existingOrignals = new Set(activeProject.glossary.map(g => g.original.toLowerCase().trim()));
            const validItems = result.payload.filter(p => p.original && !existingOrignals.has(p.original.toLowerCase().trim()));
            
            if (validItems.length > 0) {
                pendingAction = { type: 'ADD_GLOSSARY', payload: validItems };
                if (validItems.length < result.payload.length) {
                    const extraMsg = isEnglish 
                        ? "\n(Some duplicates were automatically removed)" 
                        : "\n(Beberapa kata duplikat otomatis dibuang)";
                    
                    setMessages(prev => prev.map(m => 
                        m.id === aiMsgId ? { ...m, text: m.text + extraMsg } : m
                    ));
                    accumulatedText += extraMsg;
                }
            } else {
                const extraMsg = isEnglish 
                    ? "\n✨ All these words are already in your glossary! No changes needed." 
                    : "\n✨ Wah, semua kata tersebut ternyata sudah ada di glosarium Kakak! Tidak ada yang perlu ditambahkan.";
                setMessages(prev => prev.map(m => 
                    m.id === aiMsgId ? { ...m, text: m.text + extraMsg } : m
                ));
                accumulatedText += extraMsg;
            }
        } 
        else if (result.type === 'DELETE_GLOSSARY') {
            const verifiedPayload: DeleteGlossaryPayload[] = [];
            result.payload.forEach(req => {
                const reqLower = req.original.toLowerCase().trim();
                const match = activeProject.glossary.find(g => g.original.toLowerCase().trim() === reqLower);
                if (match) verifiedPayload.push({ original: match.original, translated: match.translated });
            });
            if (verifiedPayload.length > 0) {
                pendingAction = { type: 'DELETE_GLOSSARY', payload: verifiedPayload };
            } else {
                 const extraMsg = isEnglish ? "\nTerms not found in glossary." : "\nKata tidak ditemukan di glosarium.";
                 setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: m.text + extraMsg } : m));
                 accumulatedText += extraMsg;
            }
        }

        if (pendingAction) {
            setMessages(prev => prev.map(m => 
                m.id === aiMsgId ? { ...m, pendingAction } : m
            ));
            // Update DB with pending action
            await saveChatToDB({ ...aiPlaceholder, text: accumulatedText, pendingAction });
        } else {
            // Final save if no pending action (already saved text above, but good to ensure)
             await saveChatToDB({ ...aiPlaceholder, text: accumulatedText });
        }

    } catch (error: any) {
        const errorMsg = `Error: ${error.message}`;
        setMessages(prev => prev.map(m => 
            m.id === aiMsgId ? { ...m, text: errorMsg } : m
        ));
        await saveChatToDB({ ...aiPlaceholder, text: errorMsg });
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
