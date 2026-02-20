
import { AppSettings, NovelProject } from "./types";

export const LANGUAGES = [
  "Auto Detect",
  "Indonesia", "Inggris", "Korea", "Jepang", "Mandarin", 
  "Prancis", "Jerman", "Spanyol", "Arab", "Rusia"
];

export const STORAGE_KEY = 'novtl_settings_v3_projects'; 

export const LLM_PROVIDERS = ['Gemini', 'OpenAI (GPT)', 'DeepSeek', 'Grok (xAI)', 'OpenRouter'];

// Updated based on Google GenAI SDK guidelines
export const PROVIDER_MODELS: Record<string, string[]> = {
  'Gemini': [
      'gemini-3-flash-preview', 
      'gemini-3-pro-preview',
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-2.0-flash-exp'
  ],
  'OpenAI (GPT)': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  'DeepSeek': ['deepseek-chat', 'deepseek-reasoner'],
  'Grok (xAI)': ['grok-2-latest', 'grok-beta'],
  'OpenRouter': [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'meta-llama/llama-3.1-70b-instruct',
      'meta-llama/llama-3.1-405b-instruct',
      'google/gemini-pro-1.5',
      'mistralai/mistral-large',
      'openai/gpt-4o',
      'nousresearch/hermes-3-llama-3.1-405b'
  ]
};

export const DEFAULT_MODELS: Record<string, string> = {
  'Gemini': 'gemini-3-flash-preview', 
  'OpenAI (GPT)': 'gpt-4o', 
  'DeepSeek': 'deepseek-chat',
  'Grok (xAI)': 'grok-2-latest',
  'OpenRouter': 'anthropic/claude-3.5-sonnet'
};

const DEFAULT_PROJECT_ID = 'default-project-001';

const DEFAULT_PROJECT: NovelProject = {
  id: DEFAULT_PROJECT_ID,
  name: 'Novel Baru',
  sourceLanguage: 'Auto Detect',
  targetLanguage: 'Indonesia',
  // Translated to Indonesian default
  translationInstruction: 'Terjemahkan dengan nuansa sastra novel yang mengalir alami. Pertahankan istilah khusus jika ada di glosarium.',
  glossary: []
};

export const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'Gemini',
  apiKeys: {},
  selectedModel: DEFAULT_MODELS,
  activeProjectId: DEFAULT_PROJECT_ID,
  projects: [DEFAULT_PROJECT],
  version: 1,
  appLanguage: 'id', // Default to Indonesian
  theme: 'light',
  translationMode: 'standard',
  customModels: {} 
};
