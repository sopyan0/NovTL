
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { AppSettings, AssistantAction, EditorContextType, NovelProject, ChatMessage, AddGlossaryPayload, DeleteGlossaryPayload } from "../types"; 
import { DEFAULT_MODELS } from "../constants";
import { searchTranslations, getTranslationSummariesByProjectId } from "../utils/storage";

// --- CONFIGURATION ---

const API_ENDPOINTS: Record<string, string> = {
  'OpenAI (GPT)': 'https://api.openai.com/v1/chat/completions',
  'DeepSeek': 'https://api.deepseek.com/chat/completions',
  'Grok (xAI)': 'https://api.x.ai/v1/chat/completions',
  'OpenRouter': 'https://openrouter.ai/api/v1/chat/completions'
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
  if (msg.includes('401') || msg.includes('API key not valid')) return "Invalid API Key. Please check your Settings.";
  if (msg.includes('429') || msg.includes('Quota exceeded')) return "API Quota Exceeded. Please wait a moment or check your plan.";
  if (msg.includes('503') || msg.includes('Overloaded')) return "AI Server is overloaded. Try again in 1 minute.";
  if (msg.includes('AbortedByUser')) return "Process stopped by user.";
  if (msg.includes('TokenLimit')) return "Input too long for this model. Try shortening the chapter.";
  return `AI Error: ${msg.slice(0, 50)}...`;
};

// --- HELPER: TOKENIZER ESTIMATION ---
const estimateTokens = (text: string): number => {
    return Math.ceil(text.length / 3.5);
};

// --- HELPER: SMART CHUNKING & CONTEXT ---

const splitTextByParagraphs = (text: string, maxTokens: number = 3000): string[] => {
  const maxChars = maxTokens * 3.5; 
  
  if (text.length <= maxChars) return [text];
  
  const chunks: string[] = [];
  let currentChunk = "";
  const paragraphs = text.split('\n');
  
  for (const para of paragraphs) {
    const paraLen = para.length;
    
    if (paraLen > maxChars) {
        if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }
        
        let i = 0;
        while (i < paraLen) {
            chunks.push(para.slice(i, i + maxChars));
            i += maxChars;
        }
    } 
    else if ((currentChunk.length + paraLen) > maxChars) {
      chunks.push(currentChunk.trim());
      currentChunk = para + '\n';
    } 
    else {
      currentChunk += para + '\n';
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  
  return chunks.filter(c => c.length > 0);
};

const getSmartSnippet = (text: string, maxLen: number = 2500): string => {
    if (!text) return "(KOSONG)";
    if (text.length <= maxLen) return text;
    // Prioritize the END of the text if it's a draft, assuming user is working at the bottom
    // But for general context, a mix is better.
    const headLen = Math.floor(maxLen * 0.3);
    const tailLen = Math.floor(maxLen * 0.7);
    const hiddenCount = text.length - (headLen + tailLen);
    return text.slice(0, headLen) + 
           `\n\n... [${hiddenCount} chars cut] ...\n\n` + 
           text.slice(-tailLen);
};

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const generateTextSimple = async (
    prompt: string, 
    systemInstruction: string,
    config: AIClientConfig
): Promise<string> => {
    if (estimateTokens(prompt + systemInstruction) > 1000000) { 
         throw new Error("TokenLimit: Input text is way too huge even for Gemini Flash.");
    }

    if (config.provider === 'Gemini') {
        const ai = new GoogleGenAI({ apiKey: config.apiKey });
        const response = await ai.models.generateContent({
            model: config.model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { systemInstruction, temperature: 0.3 }
        });
        return response.text || "";
    } else if (config.endpoint) {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        };
        
        if (config.provider === 'OpenRouter') {
            headers['HTTP-Referer'] = 'https://novtl.studio'; // Required by OpenRouter
            headers['X-Title'] = 'NovTL Studio';
        }

        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers,
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

// --- MODEL FETCHING (DYNAMIC) ---
export const fetchAvailableModels = async (provider: string, apiKey: string): Promise<string[]> => {
    const cleanKey = apiKey?.trim();
    if (!cleanKey) return [];

    try {
        let url = '';
        let headers: Record<string, string> = {};

        if (provider === 'Gemini') {
            // Revert to using Header for Gemini as it was working previously
            // Using query param (?key=) caused issues for the user
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models`, {
                headers: {
                    'x-goog-api-key': cleanKey
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.error?.message || `Gemini API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            // Filter only models that support content generation
            return (data.models || [])
                .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
                .map((m: any) => m.name.replace('models/', ''))
                .sort();
        }

        // Standard OpenAI-compatible endpoints
        if (provider === 'OpenRouter') {
            url = 'https://openrouter.ai/api/v1/models';
            headers = { 
                'Authorization': `Bearer ${cleanKey}`,
                'HTTP-Referer': 'https://novtl.studio',
                'X-Title': 'NovTL Studio'
            };
        } else if (provider === 'OpenAI (GPT)') {
            url = 'https://api.openai.com/v1/models';
            headers = { 'Authorization': `Bearer ${cleanKey}` };
        } else if (provider === 'DeepSeek') {
            url = 'https://api.deepseek.com/models';
            headers = { 'Authorization': `Bearer ${cleanKey}` };
        } else if (provider === 'Grok (xAI)') {
            url = 'https://api.x.ai/v1/models';
            headers = { 'Authorization': `Bearer ${cleanKey}` };
        }

        if (url) {
            try {
                const response = await fetch(url, { headers });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => null);
                    const errorMessage = errorData?.error?.message || errorData?.message || `HTTP Error ${response.status}`;
                    if (response.status === 401) throw new Error(`Invalid API Key for ${provider} (401). Please check your key.`);
                    throw new Error(errorMessage);
                }

                const data = await response.json();
                
                if (!data.data || !Array.isArray(data.data)) {
                    throw new Error(`Unexpected response format from ${provider}`);
                }

                // Map to ID and sort alphabetically
                return data.data.map((m: any) => m.id).sort();
            } catch (fetchError: any) {
                // Handle CORS errors specifically for OpenAI/DeepSeek/Grok
                if (fetchError.message === 'Failed to fetch' || fetchError.name === 'TypeError') {
                    throw new Error(`Connection failed. ${provider} likely blocks direct browser access (CORS). Please use OpenRouter or a proxy.`);
                }
                throw fetchError;
            }
        }

        return [];
    } catch (error: any) {
        console.error("Failed to fetch models:", error);
        throw new Error(error.message || "Unknown error during model fetch");
    }
};

// --- CORE GENERATION (TRANSLATION ENGINE) ---
export const translateTextStream = async (
  text: string, 
  settings: AppSettings, 
  project: NovelProject,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  mode: 'standard' | 'high_quality' = 'standard',
  previousChapterContext?: string
): Promise<{ result: string, detectedLanguage: string | null }> => {
  const config = getAIClientConfig(settings);
  if (!config.apiKey) throw new Error(`API Key for ${config.provider} is missing.`);

  const instruction = project.translationInstruction || "Novel style that flows naturally.";
  const targetLang = project.targetLanguage || "Indonesian";
  const glossary = project.glossary || [];

  const glossaryMap = new Map(glossary.map(item => [item.original.toLowerCase(), item]));
  const glossaryKeys = Array.from(glossaryMap.keys()).sort((a, b) => b.length - a.length);
  const glossaryPattern = glossaryKeys.length > 0
    ? new RegExp(`(${glossaryKeys.map(escapeRegExp).join('|')})`, 'gi')
    : null;

  const chunks = splitTextByParagraphs(text, 2500); 
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
                
                // CONTEXT LOGIC
                let contextPrompt = "";
                if (index === 0 && previousChapterContext) {
                    contextPrompt = `\n[STORY CONTEXT FROM PREVIOUS CHAPTER]\n(The story continues from here)...${previousChapterContext}\n`;
                } else if (index > 0) {
                    contextPrompt = `\n[PREVIOUS CHUNK CONTEXT]\n...${previousContextSource.slice(-300)}\n`;
                }
                
                let promptToStream = "";
                let systemInstruction = "";

                if (mode === 'high_quality') {
                    const draftSystem = `Role: Translator. Task: Translate STRICTLY to ${targetLang}. Focus on accuracy and meaning.`;
                    const draftPrompt = `${glossaryText}${contextPrompt}\n[SOURCE]\n${chunk}`;
                    
                    if (estimateTokens(draftSystem + draftPrompt) > 120000) { 
                        throw new Error("TokenLimit: Chunk is too complex even after splitting.");
                    }

                    const draftResult = await generateTextSimple(draftPrompt, draftSystem, config);
                    if (signal?.aborted) throw new Error('AbortedByUser');

                    systemInstruction = `Role: Professional Novel Editor. Rewrite the provided draft into high-quality ${targetLang} novel prose. Style: ${instruction}.`;
                    promptToStream = `[DRAFT TEXT]\n${draftResult}\n\n[INSTRUCTION]\nPolish this draft. Output ONLY final text.`;
                } else {
                    systemInstruction = `Role: Professional Novel Translator. Target: ${targetLang}. Style: ${instruction}. Rules: 1. Translate ONLY [CURRENT SOURCE]. 2. No glossary/context in output.`;
                    promptToStream = `${glossaryText}${contextPrompt}\n[CURRENT SOURCE]\n${chunk}`;
                }
                
                if (estimateTokens(systemInstruction + promptToStream) > 120000) {
                     throw new Error("TokenLimit: Chunk is too complex.");
                }

                if (config.provider === 'Gemini') {
                    const ai = new GoogleGenAI({ apiKey: config.apiKey }); 
                    const responseStream = await ai.models.generateContentStream({
                        model: config.model,
                        contents: [{ role: 'user', parts: [{ text: promptToStream }] }], 
                        config: { systemInstruction, temperature: mode === 'high_quality' ? 0.7 : 0.5 },
                    });
                    for await (const chunkResp of responseStream) {
                        if (signal?.aborted) throw new Error('AbortedByUser');
                        const chunkText = chunkResp.text || "";
                        currentChunkAccumulator += chunkText;
                        onChunk(chunkText); 
                    }
                } else if (config.endpoint) {
                    const headers: Record<string, string> = { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${config.apiKey}` 
                    };
                    
                    if (config.provider === 'OpenRouter') {
                        headers['HTTP-Referer'] = 'https://novtl.studio';
                        headers['X-Title'] = 'NovTL Studio';
                    }

                    const response = await fetch(config.endpoint, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            model: config.model,
                            messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: promptToStream }],
                            stream: true
                        }),
                        signal
                    });
                    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
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
              if (err.message === 'AbortedByUser' || signal?.aborted) throw new Error('AbortedByUser');
              
              if (err.message.includes('TokenLimit') || err.message.includes('Invalid API Key')) {
                  throw err;
              }

              attempts++;
              if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
          }
      } 
      if (!success) throw new Error(mapAIError(lastError));
      if (!fullText.endsWith('\n\n')) { fullText += '\n\n'; onChunk('\n\n'); }
      previousContextSource = chunk;
      if (index < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  return { result: fullText.trim(), detectedLanguage: null };
};

// --- CHAT & TOOLS (UPDATED FOR MULTI-PROVIDER SUPPORT) ---

// 1. Gemini Tool Definitions (Google SDK Format)
const glossaryToolGemini: FunctionDeclaration = {
  name: 'manage_glossary',
  description: 'Add or Delete glossary items. CRITICAL: Use ONLY when user EXPLICITLY asks to "add", "save", or "delete" specific terms. DO NOT use for general chat or greetings.',
  parameters: {
    type: Type.OBJECT,
    properties: { 
      action: { type: Type.STRING, enum: ['ADD', 'DELETE'] },
      items: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: { original: { type: Type.STRING }, translated: { type: Type.STRING } },
            required: ['original']
        }
      }
    },
    required: ['action', 'items'],
  },
};

const memoryToolGemini: FunctionDeclaration = {
  name: 'read_historical_content',
  description: 'Search for info in saved chapters. ONLY use if user asks to "search", "find", or "read" a previous chapter.',
  parameters: {
    type: Type.OBJECT,
    properties: { search_query: { type: Type.STRING, description: "Keyword or topic to look for." } },
    required: ['search_query']
  }
};

const readFullContentToolGemini: FunctionDeclaration = {
  name: 'read_full_editor_content',
  description: 'Read the ENTIRE text in the current editor. ONLY use if user explicitly asks about the current active chapter in detail.',
  parameters: { type: Type.OBJECT, properties: {}, required: [] }
};

// 2. OpenAI/DeepSeek/Grok Tool Definitions (Standard JSON Schema)
const openAITools = [
    {
        type: "function",
        function: {
            name: "manage_glossary",
            description: "Add or Delete glossary items. CRITICAL: Use ONLY when user EXPLICITLY asks to 'add', 'save', or 'delete' terms.",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["ADD", "DELETE"] },
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                original: { type: "string" },
                                translated: { type: "string" }
                            },
                            required: ["original"]
                        }
                    }
                },
                required: ["action", "items"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_historical_content",
            description: "Search for info in saved chapters. ONLY use if user asks to 'search', 'find', or 'read' a previous chapter.",
            parameters: {
                type: "object",
                properties: {
                    search_query: { type: "string", description: "Keyword or topic to look for." }
                },
                required: ["search_query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_full_editor_content",
            description: "Read the ENTIRE text in the current editor. Use only if user asks about current chapter detail.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    }
];

// --- GLOSSARY EXTRACTION ---
export const extractGlossaryFromText = async (
    sourceText: string,
    translatedText: string,
    settings: AppSettings,
    language: 'en' | 'id' = 'id'
): Promise<{ original: string; translated: string }[]> => {
    const config = getAIClientConfig(settings);
    if (!config.apiKey) throw new Error("API Key missing");

    const prompt = language === 'en' 
        ? `Analyze the following Source Text and Translated Text. Extract ALL proper nouns (Character Names, Locations, Techniques, Organizations, Items, Ranks) that are important for consistency.
           Be thorough. If a term appears multiple times, it is likely important.
           Return ONLY a JSON array of objects with "original" and "translated" keys.
           Example: [{"original": "Yun Che", "translated": "Yun Che"}, {"original": "Frozen Cloud Asgard", "translated": "Istana Awan Beku"}]`
        : `Analisis Teks Asli dan Terjemahan berikut. Ekstrak SEMUA kata benda khusus (Nama Karakter, Lokasi, Jurus, Organisasi, Item, Tingkatan) yang penting untuk konsistensi.
           Jadilah teliti. Jika sebuah istilah muncul berkali-kali, kemungkinan besar itu penting.
           Kembalikan HANYA array JSON berisi objek dengan key "original" dan "translated".
           Contoh: [{"original": "Yun Che", "translated": "Yun Che"}, {"original": "Frozen Cloud Asgard", "translated": "Istana Awan Beku"}]`;

    const content = `[SOURCE TEXT]\n${sourceText.slice(0, 3000)}\n\n[TRANSLATED TEXT]\n${translatedText.slice(0, 3000)}`;

    try {
        const result = await generateTextSimple(content, prompt, config);
        // Clean markdown code blocks if present
        const cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Glossary extraction failed:", e);
        return [];
    }
};

// --- CHAT WITH ASSISTANT (STREAMING) ---
export const chatWithAssistantStream = async (
    userMessage: string, 
    settings: AppSettings, 
    project: NovelProject,
    history: ChatMessage[],
    onChunk: (text: string) => void,
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
          contextInjection = `\n[FULL EDITOR CONTENT]\nSOURCE:\n${editorContext.sourceText}\n\nTRANSLATION:\n${editorContext.translatedText}\n`;
      } else {
          contextInjection = `\n[EDITOR DRAFT - CURRENTLY EDITING]\nNOTE: Teks ini adalah Draft aktif yang sedang dikerjakan user di Editor. INI BUKAN DARI LIBRARY.\nSOURCE SNIPPET:\n${getSmartSnippet(editorContext.sourceText, 1000)}\n\nTRANSLATION SNIPPET:\n${getSmartSnippet(editorContext.translatedText, 1000)}\n`;
      }
  }

  const systemPromptID = `Kamu adalah Danggo🍡, Asisten Novel.
    
    KONTEKS GLOSARIUM SAAT INI: [${glossarySummary}]
    
    PERATURAN PENTING:
    1. Anda bisa melihat teks di 'EDITOR DRAFT'.
    2. Jika user bertanya "cari tentang X", gunakan tool 'read_historical_content'.
    3. Jika user bertanya tentang kata spesifik yang TIDAK ada di snippet, JANGAN MENGARANG. Katakan: "Saya tidak melihat teks tersebut di potongan yang saya baca. Bisa tolong copy-paste bagian itu?"
    4. CEK GLOSARIUM DI ATAS DULU sebelum menyarankan penambahan kata.
    5. HANYA panggil tool jika ada instruksi EKSPLESIT.`;

  const systemPromptEN = `You are Danggo🍡, a Novel Assistant.
    
    CURRENT GLOSSARY CONTEXT: [${glossarySummary}]
    
    IMPORTANT RULES:
    1. You can see the 'EDITOR DRAFT'.
    2. If user asks to "search for X", use 'read_historical_content' tool.
    3. If user asks about specific text NOT in the snippet, DO NOT HALLUCINATE. Say: "I cannot see that text in my current snippet. Could you copy-paste it for me?"
    4. CHECK THE GLOSSARY ABOVE FIRST before suggesting additions.
    5. ONLY use tools if explicitly asked.`;

  const systemPrompt = language === 'en' ? systemPromptEN : systemPromptID;
  const finalUserMessage = `${userMessage}\n\n${contextInjection}`;

  // --- GEMINI STREAMING ---
  if (config.provider === 'Gemini') {
    try {
      const historyContent = history.filter(m => !m.isHidden).map(m => ({ 
        role: m.role === 'model' ? 'model' as const : 'user' as const, 
        parts: [{ text: m.text.slice(0, 500) }] 
      })).slice(-6);

      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const model = ai.getGenerativeModel({
        model: config.model,
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: [glossaryToolGemini, memoryToolGemini, readFullContentToolGemini] }],
        generationConfig: { temperature: 0.4 }
      });

      const chat = model.startChat({ history: historyContent });
      const result = await chat.sendMessageStream(finalUserMessage);

      let fullText = '';
      for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
              fullText += chunkText;
              onChunk(chunkText);
          }
      }

      const response = await result.response;
      const fc = response.functionCalls()?.[0];
      
      if (fc) return handleToolCall(fc.name, fc.args, settings.activeProjectId, language);
      return { type: 'NONE', message: fullText || (language === 'en' ? "Ready!" : "Siap membantu!") };

    } catch (err: any) {
        throw new Error(mapAIError(err));
    }
  } 
  
  // --- FALLBACK FOR OTHERS (NON-STREAMING FOR NOW, BUT SIMULATED) ---
  else {
      // Reuse existing logic but call onChunk at the end
      const result = await chatWithAssistant(userMessage, settings, project, history, editorContext, language, forceFullContext);
      if (result.message) onChunk(result.message);
      return result;
  }
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
          contextInjection = `\n[FULL EDITOR CONTENT]\nSOURCE:\n${editorContext.sourceText}\n\nTRANSLATION:\n${editorContext.translatedText}\n`;
      } else {
          contextInjection = `\n[EDITOR DRAFT - CURRENTLY EDITING]\nNOTE: Teks ini adalah Draft aktif yang sedang dikerjakan user di Editor. INI BUKAN DARI LIBRARY.\nSOURCE SNIPPET:\n${getSmartSnippet(editorContext.sourceText, 1000)}\n\nTRANSLATION SNIPPET:\n${getSmartSnippet(editorContext.translatedText, 1000)}\n`;
      }
  }

  const systemPromptID = `Kamu adalah Danggo🍡, Asisten Novel.
    
    KONTEKS GLOSARIUM SAAT INI: [${glossarySummary}]
    
    PERATURAN PENTING:
    1. Anda bisa melihat teks di 'EDITOR DRAFT'.
    2. Jika user bertanya "cari tentang X", gunakan tool 'read_historical_content'.
    3. Jika user bertanya tentang kata spesifik yang TIDAK ada di snippet, JANGAN MENGARANG. Katakan: "Saya tidak melihat teks tersebut di potongan yang saya baca. Bisa tolong copy-paste bagian itu?"
    4. CEK GLOSARIUM DI ATAS DULU sebelum menyarankan penambahan kata.
    5. HANYA panggil tool jika ada instruksi EKSPLESIT.`;

  const systemPromptEN = `You are Danggo🍡, a Novel Assistant.
    
    CURRENT GLOSSARY CONTEXT: [${glossarySummary}]
    
    IMPORTANT RULES:
    1. You can see the 'EDITOR DRAFT'.
    2. If user asks to "search for X", use 'read_historical_content' tool.
    3. If user asks about specific text NOT in the snippet, DO NOT HALLUCINATE. Say: "I cannot see that text in my current snippet. Could you copy-paste it for me?"
    4. CHECK THE GLOSSARY ABOVE FIRST before suggesting additions.
    5. ONLY use tools if explicitly asked.`;

  const systemPrompt = language === 'en' ? systemPromptEN : systemPromptID;

  // Formatting History for API
  const finalUserMessage = `${userMessage}\n\n${contextInjection}`;

  // --- GEMINI PROVIDER ---
  if (config.provider === 'Gemini') {
    try {
      const historyContent = history.filter(m => !m.isHidden).map(m => ({ 
        role: m.role === 'model' ? 'model' as const : 'user' as const, 
        parts: [{ text: m.text.slice(0, 500) }] 
      })).slice(-6);

      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const response = await ai.models.generateContent({
        model: config.model,
        contents: [
          ...historyContent,
          { role: 'user', parts: [{ text: finalUserMessage }] }
        ],
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: [glossaryToolGemini, memoryToolGemini, readFullContentToolGemini] }],
          temperature: 0.4
        }
      });

      const fc = response.functionCalls?.[0];
      if (fc) return handleToolCall(fc.name, fc.args, settings.activeProjectId, language);
      return { type: 'NONE', message: response.text || (language === 'en' ? "Ready!" : "Siap membantu!") };
    } catch (err: any) {
        throw new Error(mapAIError(err));
    }
  } 
  
  // --- STANDARD PROVIDERS (OpenAI, DeepSeek, Grok, OpenRouter) ---
  else if (config.endpoint) {
    try {
        const historyContent = history.filter(m => !m.isHidden).map(m => ({ 
            role: m.role === 'model' ? 'assistant' : 'user', 
            content: m.text.slice(0, 500) 
        })).slice(-6);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        };

        if (config.provider === 'OpenRouter') {
            headers['HTTP-Referer'] = 'https://novtl.studio';
            headers['X-Title'] = 'NovTL Studio';
        }

        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...historyContent,
                    { role: 'user', content: finalUserMessage }
                ],
                tools: openAITools,
                tool_choice: "auto",
                temperature: 0.4
            })
        });

        const json = await response.json();
        
        if (!response.ok) {
            throw new Error(json.error?.message || `API Error ${response.status}`);
        }

        const choice = json.choices?.[0];
        if (!choice) throw new Error("Empty response from AI");

        // Handle Tool Calls (Standard format)
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            const toolCall = choice.message.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            return handleToolCall(toolCall.function.name, args, settings.activeProjectId, language);
        }

        return { 
            type: 'NONE', 
            message: choice.message.content || (language === 'en' ? "No response." : "Tidak ada respon.") 
        };

    } catch (err: any) {
        throw new Error(mapAIError(err));
    }
  }

  return { type: 'NONE', message: language === 'en' ? "Provider not supported for chat." : "Provider ini belum mendukung chat." };
};

async function handleToolCall(name: string, args: any, projectId: string, language: 'en' | 'id'): Promise<AssistantAction> {
    if (name === 'read_full_editor_content') {
        const msg = language === 'en' ? "Reading full text..." : "Membaca teks lengkap...";
        return { type: 'READ_FULL_EDITOR_AND_REPROCESS', message: msg };
    }
    if (name === 'manage_glossary') {
        const { action, items } = args;
        if (action === 'ADD') {
            const payload: AddGlossaryPayload[] = items.map((i: any) => ({
                original: String(i.original || '').trim(),
                translated: String(i.translated || '').trim()
            })).filter((i: any) => i.original !== '');
            if (payload.length === 0) return { type: 'NONE', message: language === 'en' ? "No terms found to add." : "Tidak ada kata untuk ditambah." };
            return { type: 'ADD_GLOSSARY', payload, message: language === 'en' ? `Add ${payload.length} terms?` : `Tambah ${payload.length} kata ke glosarium?` };
        } else {
            const payload: DeleteGlossaryPayload[] = items.map((i: any) => ({ original: String(i.original || '').trim() })).filter((i: any) => i.original !== '');
            return { type: 'DELETE_GLOSSARY', payload, message: language === 'en' ? "Confirm deletion?" : "Konfirmasi hapus kata?" };
        }
    }
    // REVISI: Menggunakan SQL Search yang efisien
    if (name === 'read_historical_content') {
        return { type: 'READ_SAVED_TRANSLATION', payload: String(args.search_query || ''), message: language === 'en' ? "Searching library..." : "Mencari di koleksi..." };
    }
    return { type: 'NONE', message: "..." };
}
