
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { AppSettings, AssistantAction, EditorContextType, NovelProject, ChatMessage, AddGlossaryPayload, DeleteGlossaryPayload } from "../types"; 
import { DEFAULT_MODELS } from "../constants";

// --- CONFIGURATION ---

const API_ENDPOINTS: Record<string, string> = {
  'OpenAI (GPT)': 'https://api.openai.com/v1/chat/completions',
  'DeepSeek': 'https://api.deepseek.com/chat/completions',
  'Grok (xAI)': 'https://api.x.ai/v1/chat/completions'
};

interface AIClientConfig {
  provider: string;
  model: string;
  apiKey: string;
  endpoint?: string;
}

const getAIClientConfig = (settings: AppSettings): AIClientConfig => {
  const provider = settings.activeProvider;
  let apiKey = settings.apiKeys[provider] || '';
  
  let modelName = settings.selectedModel[provider] || DEFAULT_MODELS[provider];
  return { 
    provider, 
    model: modelName, 
    apiKey,
    endpoint: API_ENDPOINTS[provider]
  };
};

export const hasValidApiKey = (settings: AppSettings): boolean => {
  const config = getAIClientConfig(settings);
  return !!config.apiKey && config.apiKey.length > 5;
};

// --- HELPER: ERROR MAPPING (Premium UX) ---
const mapAIError = (error: any): string => {
  const msg = error.message || String(error);
  // STANDARDIZED ENGLISH ERRORS FOR GLOBAL TEMPLATE
  if (msg.includes('401') || msg.includes('API key not valid')) return "Invalid API Key. Please check your Settings.";
  if (msg.includes('429') || msg.includes('Quota exceeded')) return "API Quota Exceeded or Rate Limited. Please wait a moment.";
  if (msg.includes('503') || msg.includes('Overloaded')) return "AI Server is overloaded. Try again in 1 minute.";
  if (msg.includes('AbortedByUser')) return "Process stopped by user.";
  return `AI Error: ${msg.slice(0, 50)}...`;
};

// --- HELPER: SMART CHUNKING & CONTEXT ---

const splitTextByParagraphs = (text: string, maxLength: number = 3500): string[] => {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let currentChunk = "";
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (para.length > maxLength) {
        if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }
        let i = 0;
        while (i < para.length) {
            chunks.push(para.slice(i, i + maxLength));
            i += maxLength;
        }
    } else if ((currentChunk.length + para.length) < maxLength) {
      currentChunk += para + '\n';
    } else {
      chunks.push(currentChunk.trim());
      currentChunk = para + '\n';
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks.filter(c => c.length > 0);
};

// UPDATE: Token Saver - Only take the beginning and end if text is too long
const getSmartSnippet = (text: string, maxLen: number = 1000): string => {
    if (!text) return "(Empty)";
    if (text.length <= maxLen) return text;
    
    // Take 60% from start (important for character intro) and 40% from end (latest context)
    const headLen = Math.floor(maxLen * 0.6);
    const tailLen = Math.floor(maxLen * 0.4);
    
    const hiddenCount = text.length - (headLen + tailLen);
    
    return text.slice(0, headLen) + 
           `\n\n... [${hiddenCount} chars cut to save quota] ...\n\n` + 
           text.slice(-tailLen);
};

// --- HELPER: REGEX ESCAPE ---
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- HELPER: SIMPLE NON-STREAMING GENERATION (FOR PASS 1) ---
const generateTextSimple = async (
    prompt: string, 
    systemInstruction: string,
    config: AIClientConfig
): Promise<string> => {
    if (config.provider === 'Gemini') {
        const ai = new GoogleGenAI({ apiKey: config.apiKey });
        const response = await ai.models.generateContent({
            model: config.model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { systemInstruction, temperature: 0.3 }
        });
        return response.text || "";
    } else if (config.endpoint) {
        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: prompt }
                ],
                stream: false
            })
        });
        const json = await response.json();
        return json.choices[0]?.message?.content || "";
    }
    return "";
};

// --- CORE GENERATION (TRANSLATION ENGINE) ---

export const translateTextStream = async (
  text: string, 
  settings: AppSettings, 
  project: NovelProject,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  mode: 'standard' | 'high_quality' = 'standard' // NEW PARAMETER
): Promise<{ result: string, detectedLanguage: string | null }> => {
  const config = getAIClientConfig(settings);
  if (!config.apiKey) throw new Error(`API Key for ${config.provider} is missing.`);

  const instruction = project.translationInstruction || "Novel style that flows naturally.";
  const targetLang = project.targetLanguage || "Indonesian";
  const glossary = project.glossary || [];

  // OPTIMIZATION: Regex-based Glossary Matching (Faster O(n) vs O(nm))
  const glossaryMap = new Map(glossary.map(item => [item.original.toLowerCase(), item]));
  const glossaryKeys = Array.from(glossaryMap.keys()).sort((a, b) => b.length - a.length);
  const glossaryPattern = glossaryKeys.length > 0
    ? new RegExp(`(${glossaryKeys.map(escapeRegExp).join('|')})`, 'gi')
    : null;

  const chunks = splitTextByParagraphs(text, 3500); 
  let fullText = "";
  let previousContextSource = ""; 

  for (const [index, chunk] of chunks.entries()) {
      if (signal?.aborted) throw new Error('AbortedByUser');

      let attempts = 0;
      const maxAttempts = 3;
      let success = false;
      let lastError: any;

      while (attempts < maxAttempts && !success) {
          let currentChunkAccumulator = ""; 

          try {
                if (signal?.aborted) throw new Error('AbortedByUser');

                let relevantGlossary: typeof glossary = [];
                if (glossaryPattern) {
                    const matches = chunk.match(glossaryPattern) || [];
                    const foundKeys = new Set(matches.map(m => m.toLowerCase()));
                    relevantGlossary = Array.from(foundKeys).map(k => glossaryMap.get(k)!).filter(Boolean);
                }
            
                const glossaryText = relevantGlossary.length > 0 
                    ? `\n[GLOSSARY - STRICTLY FOLLOW]\n${relevantGlossary.map(item => `${item.original}=${item.translated}`).join('\n')}\n`
                    : "";

                const contextPrompt = index > 0 
                    ? `\n[PREVIOUS CONTEXT]\n...${previousContextSource.slice(-300)}\n`
                    : "";

                // --- LOGIC TWO-PASS VS STANDARD ---
                
                let promptToStream = "";
                let systemInstruction = "";

                if (mode === 'high_quality') {
                    // PASS 1: DRAFTING (Hidden from UI)
                    // We generate a rough, accurate translation first without streaming to UI
                    const draftSystem = `Role: Translator. Task: Translate STRICTLY to ${targetLang}. Focus on accuracy and meaning. Do not worry about flow yet.`;
                    const draftPrompt = `${glossaryText}${contextPrompt}\n[SOURCE]\n${chunk}`;
                    
                    const draftResult = await generateTextSimple(draftPrompt, draftSystem, config);

                    if (signal?.aborted) throw new Error('AbortedByUser');

                    // PASS 2: POLISHING (Stream to UI)
                    // We take the draft and ask AI to make it a novel
                    systemInstruction = `Role: Professional Novel Editor. 
Task: Rewrite the provided draft into high-quality ${targetLang} novel prose.
Style: ${instruction}.
Rules: 
1. Fix stiff/robotic phrasing. 
2. Make it flow naturally. 
3. Keep all meanings and glossary terms intact.`;

                    promptToStream = `[DRAFT TEXT]\n${draftResult}\n\n[INSTRUCTION]\nPolish this draft into a final novel version. Output ONLY the final text.`;

                } else {
                    // STANDARD MODE (Single Pass)
                    systemInstruction = `Role: Professional Novel Translator. 
Target Language: ${targetLang}.
Style: ${instruction}.
Rules:
1. Translate ONLY the text in [CURRENT SOURCE].
2. Do not output the glossary or context.
3. Maintain continuity with previous context.`;

                    promptToStream = `${glossaryText}${contextPrompt}\n[CURRENT SOURCE]\n${chunk}`;
                }

                // --- STREAMING EXECUTION (Pass 2 or Standard) ---

                if (config.provider === 'Gemini') {
                    const ai = new GoogleGenAI({ apiKey: config.apiKey }); 
                    const responseStream = await ai.models.generateContentStream({
                        model: config.model,
                        contents: [{ role: 'user', parts: [{ text: promptToStream }] }], 
                        config: { 
                            systemInstruction, 
                            temperature: mode === 'high_quality' ? 0.7 : 0.5, // More creative for polish
                        },
                    });

                    for await (const chunkResp of responseStream) {
                        if (signal?.aborted) throw new Error('AbortedByUser');
                        const chunkText = chunkResp.text || "";
                        currentChunkAccumulator += chunkText;
                        onChunk(chunkText); 
                    }
                } else if (config.endpoint) {
                    const response = await fetch(config.endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${config.apiKey}`
                        },
                        body: JSON.stringify({
                            model: config.model,
                            messages: [
                                { role: 'system', content: systemInstruction },
                                { role: 'user', content: promptToStream }
                            ],
                            stream: true
                        }),
                        signal
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error?.message || `HTTP Error ${response.status}`);
                    }

                    const reader = response.body?.getReader();
                    const decoder = new TextDecoder();
                    if (!reader) throw new Error("Failed to read stream.");

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunkData = decoder.decode(value);
                        const lines = chunkData.split('\n').filter(line => line.trim() !== '');
                        for (const line of lines) {
                            if (line.includes('[DONE]')) break;
                            if (!line.startsWith('data: ')) continue;
                            try {
                                const json = JSON.parse(line.replace('data: ', ''));
                                const content = json.choices[0]?.delta?.content || "";
                                if (content) {
                                    currentChunkAccumulator += content; 
                                    onChunk(content);
                                }
                            } catch (e) {}
                        }
                    }
                }
                
                fullText += currentChunkAccumulator;
                success = true;

          } catch (err: any) {
              lastError = err;
              if (err.message === 'AbortedByUser' || signal?.aborted) {
                  throw new Error('AbortedByUser');
              }
              attempts++;
              if (attempts < maxAttempts) {
                  await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
              }
          }
      } 

      if (!success) {
          throw new Error(mapAIError(lastError));
      }

      if (!fullText.endsWith('\n\n')) {
             fullText += '\n\n';
             onChunk('\n\n');
      }
      previousContextSource = chunk;
      if (index < chunks.length - 1) {
             await new Promise(r => setTimeout(r, 500));
      }
  }

  return { result: fullText.trim(), detectedLanguage: null };
};

// --- CHAT & TOOLS ---

const glossaryToolGemini: FunctionDeclaration = {
  name: 'manage_glossary',
  description: 'Add or Delete glossary items based on user request. Use this tool when user says "add to glossary" or "save terms".',
  parameters: {
    type: Type.OBJECT,
    properties: { 
      action: { type: Type.STRING, enum: ['ADD', 'DELETE'] },
      items: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                original: { type: Type.STRING },
                translated: { type: Type.STRING }
            },
            required: ['original']
        }
      }
    },
    required: ['action', 'items'],
  },
};

const memoryToolGemini: FunctionDeclaration = {
  name: 'read_historical_content',
  description: 'STRICTLY FOR SEARCHING NEW INFO. Do NOT use this tool if the user asks for comparison, reasoning, or logic about characters/events ALREADY discussed in the chat history. Only use if user explicitly asks to "search", "find", or "read" a chapter.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      search_query: { type: Type.STRING, description: "The keyword, character name, or topic to look for." }
    },
    required: ['search_query']
  }
};

const readFullContentTool: FunctionDeclaration = {
  name: 'read_full_editor_content',
  description: 'CRITICAL: Use this tool ONLY when you need to read the FULL text in the editor to find details that are missing from the snippet (e.g., middle of the text).',
  parameters: { type: Type.OBJECT, properties: {}, required: [] }
};

export const chatWithAssistant = async (
    userMessage: string, 
    settings: AppSettings, 
    project: NovelProject,
    history: ChatMessage[],
    editorContext?: Pick<EditorContextType, 'sourceText' | 'translatedText'>,
    language: 'en' | 'id' = 'id',
    forceFullContext: boolean = false 
): Promise<AssistantAction> => {
  const userLower = userMessage.toLowerCase().trim();
  if (['reset', 'clear'].includes(userLower)) {
      const msg = language === 'en' ? "Danggo's memory cleared! 🍡" : "Memori Danggo sudah dibersihkan! 🍡";
      return { type: 'CLEAR_CHAT', message: msg };
  }

  const config = getAIClientConfig(settings);
  if (!config.apiKey) throw new Error(`API Key for ${config.provider} not found.`);

  const glossary = project.glossary || [];
  const glossarySummary = glossary.length > 500
    ? glossary.slice(0, 500).map(g => `${g.original}(${g.translated})`).join(", ") + `... (+${glossary.length - 500} others)`
    : glossary.map(g => `${g.original}(${g.translated})`).join(", ") || (language === 'en' ? "Glossary empty." : "Glosarium kosong.");

  let contextInjection = "";
  if (editorContext) {
      if (forceFullContext) {
          contextInjection = `\n[FULL EDITOR CONTENT - READ MODE ACTIVE]\nSOURCE:\n${editorContext.sourceText}\n\nTRANSLATION:\n${editorContext.translatedText}\n`;
      } else {
          contextInjection = `\n[CURRENT EDITOR SNIPPET]\n(Text is truncated to save tokens. Only Start & End shown)\nSOURCE:\n${getSmartSnippet(editorContext.sourceText, 1000)}\n\nTRANSLATION:\n${getSmartSnippet(editorContext.translatedText, 1000)}\n`;
      }
  }

  const systemPromptID = `Kamu adalah Danggo🍡, Asisten Penulis Novel yang teliti dan kreatif.
    
    KONTEKS GLOSARIUM SAAT INI:
    [${glossarySummary}]
    
    INSTRUKSI UTAMA & PEMBATASAN TOOL:
    1. PRIORITAS UTAMA: Gunakan Ingatan/Context Window untuk menjawab. Cek history percakapan DULU.
    2. JANGAN GUNAKAN TOOL 'read_historical_content' jika user bertanya perbandingan, alasan, atau logika (Contoh: "Apa beda A dan B?", "Kenapa X terjadi?"). Jawablah menggunakan otakmu sendiri berdasarkan informasi yang BARU SAJA kamu baca/diskusikan.
    3. HANYA gunakan 'read_historical_content' jika user berkata "Cari...", "Baca Chapter X", atau bertanya fakta spesifik yang BELUM pernah dibahas sama sekali di sesi ini.
    4. Jika user meminta menambah glosarium dari editor, BACA 'SOURCE' dan 'TRANSLATION'. Panggil 'manage_glossary' (ADD).
    5. Jawab santai dan sopan dalam Bahasa Indonesia.`;

  const systemPromptEN = `You are Danggo🍡, a meticulous and creative Novel Author Assistant.
    
    CURRENT GLOSSARY CONTEXT:
    [${glossarySummary}]
    
    CORE INSTRUCTIONS & TOOL RESTRICTIONS:
    1. TOP PRIORITY: Use your Context Window/Memory first. Check chat history BEFORE calling tools.
    2. DO NOT USE 'read_historical_content' for reasoning, comparison, or logic questions (e.g., "Difference between A and B?", "Why did X happen?"). Answer using your own brain based on recent chat history.
    3. ONLY use 'read_historical_content' if user explicitly says "Search...", "Read Chapter X", or asks for purely new specific facts not yet discussed.
    4. If user wants to add glossary, READ 'SOURCE' and 'TRANSLATION'. Call 'manage_glossary' (ADD).
    5. Answer friendly in English.`;

  const systemPrompt = language === 'en' ? systemPromptEN : systemPromptID;

  const historyContent = history.map(m => ({ 
    role: m.role === 'model' ? 'model' as const : 'user' as const, 
    parts: [{ text: m.text.slice(0, 1000) }] 
  })).slice(-6); 

  const finalUserMessage = `${userMessage}\n\n${contextInjection}`;

  if (config.provider === 'Gemini') {
    try {
      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const response = await ai.models.generateContent({
        model: config.model,
        contents: [
          ...historyContent,
          { role: 'user', parts: [{ text: finalUserMessage }] }
        ],
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: [glossaryToolGemini, memoryToolGemini, readFullContentTool] }],
          temperature: 0.5 
        }
      });

      const fc = response.functionCalls?.[0];
      if (fc) {
          return handleToolCall(fc.name, fc.args, language);
      }
      const defaultMsg = language === 'en' ? "Danggo is ready to help!" : "Danggo siap membantu, Kak!";
      return { type: 'NONE', message: response.text || defaultMsg };
    } catch (err: any) {
        throw new Error(mapAIError(err));
    }
  } else if (config.endpoint) {
      try {
          const response = await fetch(config.endpoint, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${config.apiKey}`
              },
              body: JSON.stringify({
                  model: config.model,
                  messages: [
                      { role: 'system', content: systemPrompt },
                      ...history.slice(-6).map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
                      { role: 'user', content: finalUserMessage }
                  ],
                  temperature: 0.5
              })
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const json = await response.json();
          return { type: 'NONE', message: json.choices[0].message.content };
      } catch (err: any) {
          throw new Error(mapAIError(err));
      }
  }
  
  return { type: 'NONE', message: language === 'en' ? "Provider not supported for chat yet." : "Maaf Kak, provider ini belum didukung untuk chat." };
};

function handleToolCall(name: string, args: any, language: 'en' | 'id'): AssistantAction {
    if (name === 'read_full_editor_content') {
        const msg = language === 'en' ? "Reading the full text for you..." : "Sedang membaca keseluruhan teks di editor...";
        return { type: 'READ_FULL_EDITOR_AND_REPROCESS', message: msg };
    }

    if (name === 'manage_glossary') {
        const { action, items } = args;
        if (action === 'ADD') {
            const payload: AddGlossaryPayload[] = items.map((i: any) => ({
                original: String(i.original || '').trim(),
                translated: String(i.translated || '').trim()
            })).filter((i: any) => i.original !== '');
            
            const count = payload.length;
            const msg = language === 'en' 
                ? `Danggo found ${count} terms to add. Do you agree?` 
                : `Danggo menemukan ${count} istilah untuk ditambahkan. Setuju, Kak?`;
            return { type: 'ADD_GLOSSARY', payload, message: msg };
        } else {
            if (items.length > 50) {
                 const msg = language === 'en'
                    ? "For safety, Danggo cannot delete more than 50 words at once. Please use Settings! 🛡️"
                    : "Demi keamanan, Danggo tidak bisa menghapus lebih dari 50 kata sekaligus. Silakan hapus secara bertahap atau gunakan menu Setelan ya! 🛡️";
                 return { type: 'NONE', message: msg };
            }
            const payload: DeleteGlossaryPayload[] = items.map((i: any) => ({
                original: String(i.original || '').trim()
            })).filter((i: any) => i.original !== '');
            const msg = language === 'en'
                ? "Danggo has prepared the deletion. Please confirm below!"
                : "Danggo sudah siapkan penghapusan kata. Konfirmasi di bawah ya!";
            return { type: 'DELETE_GLOSSARY', payload, message: msg };
        }
    }
    if (name === 'read_historical_content') {
        const { search_query } = args;
        const msg = language === 'en'
            ? `Searching for "${search_query}" in your library...`
            : `Mencari "${search_query}" di seluruh bab novel Kakak...`;
        return {
            type: 'READ_SAVED_TRANSLATION',
            payload: String(search_query || ''),
            message: msg
        };
    }
    const msg = language === 'en' ? "Danggo doesn't understand that instruction." : "Danggo tidak mengerti instruksi itu.";
    return { type: 'NONE', message: msg };
}
