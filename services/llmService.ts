
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { AppSettings, AssistantAction, EditorContextType, NovelProject, ChatMessage, AddGlossaryPayload, DeleteGlossaryPayload } from "../types"; 
import { DEFAULT_MODELS } from "../constants";

// --- CONFIGURATION ---

const API_ENDPOINTS: Record<string, string> = {
  'OpenAI (GPT)': 'https://api.openai.com/v1/chat/completions',
  'DeepSeek': 'https://api.api.deepseek.com/chat/completions',
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

const getSmartSnippet = (text: string, maxLen: number = 1000): string => {
    if (!text) return "(Empty)";
    if (text.length <= maxLen) return text;
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
  mode: 'standard' | 'high_quality' = 'standard'
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
                
                let promptToStream = "";
                let systemInstruction = "";

                if (mode === 'high_quality') {
                    const draftSystem = `Role: Translator. Task: Translate STRICTLY to ${targetLang}. Focus on accuracy and meaning.`;
                    const draftPrompt = `${glossaryText}${contextPrompt}\n[SOURCE]\n${chunk}`;
                    const draftResult = await generateTextSimple(draftPrompt, draftSystem, config);
                    if (signal?.aborted) throw new Error('AbortedByUser');

                    systemInstruction = `Role: Professional Novel Editor. Rewrite the provided draft into high-quality ${targetLang} novel prose. Style: ${instruction}.`;
                    promptToStream = `[DRAFT TEXT]\n${draftResult}\n\n[INSTRUCTION]\nPolish this draft. Output ONLY final text.`;
                } else {
                    systemInstruction = `Role: Professional Novel Translator. Target: ${targetLang}. Style: ${instruction}. Rules: 1. Translate ONLY [CURRENT SOURCE]. 2. No glossary/context in output.`;
                    promptToStream = `${glossaryText}${contextPrompt}\n[CURRENT SOURCE]\n${chunk}`;
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
                    const response = await fetch(config.endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
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

// --- CHAT & TOOLS ---

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

const readFullContentTool: FunctionDeclaration = {
  name: 'read_full_editor_content',
  description: 'Read the ENTIRE text in the current editor. ONLY use if user explicitly asks about the current active chapter in detail.',
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
          contextInjection = `\n[FULL EDITOR CONTENT]\nSOURCE:\n${editorContext.sourceText}\n\nTRANSLATION:\n${editorContext.translatedText}\n`;
      } else {
          contextInjection = `\n[EDITOR SNIPPET]\nSOURCE:\n${getSmartSnippet(editorContext.sourceText, 1000)}\n\nTRANSLATION:\n${getSmartSnippet(editorContext.translatedText, 1000)}\n`;
      }
  }

  const systemPromptID = `Kamu adalah Danggo🍡, Asisten Novel.
    
    KONTEKS GLOSARIUM: [${glossarySummary}]
    
    PERATURAN SANGAT KETAT:
    1. JANGAN panggil tool 'manage_glossary' jika user hanya menyapa (Halo, Hai, dsb) atau bertanya hal umum.
    2. HANYA panggil tool jika ada instruksi EKSPLESIT seperti "tambah kata X", "simpan glosarium", atau "hapus kata Y".
    3. Jika user bertanya tentang isi novel, BACA 'EDITOR SNIPPET' yang diberikan.
    4. Jawablah dengan ramah dan singkat. Fokus pada bantuan menulis.
    5. Jika tidak yakin butuh tool, JANGAN gunakan tool. Cukup jawab dengan teks biasa.`;

  const systemPromptEN = `You are Danggo🍡, a Novel Assistant.
    
    GLOSSARY: [${glossarySummary}]
    
    STRICT RULES:
    1. DO NOT call 'manage_glossary' for greetings (Hello, Hi) or casual chat.
    2. ONLY use tools if user EXPLICITLY asks to "add term X", "save glossary", or "delete term Y".
    3. Use the 'EDITOR SNIPPET' to answer questions about the current story.
    4. Keep answers friendly and concise.
    5. When in doubt, DO NOT call tools. Just reply with text.`;

  const systemPrompt = language === 'en' ? systemPromptEN : systemPromptID;

  const historyContent = history.filter(m => !m.isHidden).map(m => ({ 
    role: m.role === 'model' ? 'model' as const : 'user' as const, 
    parts: [{ text: m.text.slice(0, 500) }] 
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
          temperature: 0.4
        }
      });

      const fc = response.functionCalls?.[0];
      if (fc) return handleToolCall(fc.name, fc.args, language);
      return { type: 'NONE', message: response.text || (language === 'en' ? "Ready!" : "Siap membantu!") };
    } catch (err: any) {
        throw new Error(mapAIError(err));
    }
  }
  return { type: 'NONE', message: language === 'en' ? "Provider not supported for chat." : "Provider ini belum mendukung chat." };
};

function handleToolCall(name: string, args: any, language: 'en' | 'id'): AssistantAction {
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
    if (name === 'read_historical_content') {
        return { type: 'READ_SAVED_TRANSLATION', payload: String(args.search_query || ''), message: language === 'en' ? "Searching library..." : "Mencari di koleksi..." };
    }
    return { type: 'NONE', message: "..." };
}
