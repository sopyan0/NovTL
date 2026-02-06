
import { AppSettings, NovelProject } from "./types";

export const LANGUAGES = [
  "Auto Detect",
  "Indonesia", "Inggris", "Korea", "Jepang", "Mandarin", 
  "Prancis", "Jerman", "Spanyol", "Arab", "Rusia"
];

export const STORAGE_KEY = 'novtl_settings_v3_projects'; 

export const LLM_PROVIDERS = ['Gemini', 'OpenAI (GPT)', 'DeepSeek', 'Grok (xAI)'];

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
  'Grok (xAI)': ['grok-2-latest', 'grok-beta']
};

export const DEFAULT_MODELS: Record<string, string> = {
  'Gemini': 'gemini-3-flash-preview', 
  'OpenAI (GPT)': 'gpt-4o', 
  'DeepSeek': 'deepseek-chat',
  'Grok (xAI)': 'grok-2-latest'
};

const DEFAULT_PROJECT_ID = 'default-project-001';

const DEFAULT_PROJECT: NovelProject = {
  id: DEFAULT_PROJECT_ID,
  name: 'New Novel',
  sourceLanguage: 'Auto Detect',
  targetLanguage: 'Indonesia',
  // Translated to English for Global marketplace standards
  translationInstruction: 'Translate with high nuance accuracy. Capture idioms and cultural context, ensuring the text flows naturally like a best-selling novel.',
  glossary: []
};

export const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'Gemini',
  apiKeys: {},
  selectedModel: DEFAULT_MODELS,
  activeProjectId: DEFAULT_PROJECT_ID,
  projects: [DEFAULT_PROJECT],
  version: 1,
  appLanguage: 'en', 
  theme: 'light',
  translationMode: 'standard' // Default to standard
};
