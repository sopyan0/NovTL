
# 🍡 NovTL Studio - Professional AI Novel Translator

**NovTL Studio** is a professional, client-side SaaS application built with **React 19** designed for high-quality novel translation. It leverages advanced AI (Gemini, OpenAI, DeepSeek) to provide context-aware translations with a focus on literary nuance, glossary consistency, and reading experience.

---

## ⚠️ Important Disclaimer

**This application requires an external API Key to function.**
*   **Google Gemini:** Free tier available (Google AI Studio).
*   **OpenAI / DeepSeek / xAI:** Requires a paid account/credits.
*   **Note:** An API Key is **NOT included** in this purchase. Users must provide their own keys via the Settings menu.

---

## 📦 What's Included

When you purchase this script, you get the full source code package:
1.  **Full Source Code:** 100% Unencrypted TypeScript/React codebase.
2.  **PWA Ready:** Manifest and Service Worker pre-configured for "Install to Home Screen" functionality.
3.  **UI Kit:** Custom styled components using Tailwind CSS.
4.  **Build Scripts:** Vite configuration optimized for production.
5.  **Documentation:** This README guide.

---

## ✨ Key Features

### 🧠 1. Context-Aware Translation Engine
*   **Smart Chunking:** Intelligently splits long text without breaking sentences mid-flow.
*   **Memory Injection:** AI "remembers" the last 300 characters of the previous paragraph to ensure smooth narrative transitions.
*   **Streaming UI:** Real-time visual feedback (ChatGPT-style), no long loading times.

### 📚 2. Advanced Glossary System
*   **Absolute Consistency:** Define character names (e.g., "Ye Qiu") once, and the AI is forced to use them consistently.
*   **Auto-Injection:** Glossary terms are dynamically injected into the prompt only if found in the source text (Token Saver!).
*   **AI Chat Management:** Ask the built-in assistant (Danggo) to add/remove glossary terms via chat.

### 💾 3. Local-First & Data Ownership
*   **IndexedDB Storage:** Stores hundreds of novel chapters directly in the browser without consuming RAM (Lazy Loading).
*   **Full Backup & Restore:** Export entire projects, glossaries, and translation results to a `.json` file. Safe to move between devices.
*   **Serverless Architecture:** 100% Privacy. Data never leaves the user's device except to the AI API provider.

### 📖 4. Reading-Ready Output
*   **EPUB Generator:** Generate industry-standard `.epub` files directly in the browser. Compatible with Google Play Books & Apple Books.
*   **Focus Reading Mode:** Full-screen reading mode without editor distractions.

---

## 🛠️ Tech Stack

Built with **Modern Web Development Standards (2025)**:

*   **Core:** React 19 (Hooks, Suspense, Error Boundaries)
*   **Language:** TypeScript (Strict Mode)
*   **Build Tool:** Vite 5+ (Super fast HMR)
*   **Styling:** Tailwind CSS + Custom Design System (Paper/Charcoal Theme)
*   **AI SDK:** `@google/genai` (Gemini 2.5/3.0) & REST Fallback (OpenAI/DeepSeek)
*   **Storage:** Native IndexedDB (Custom Promise Wrapper)

---

## 🚀 Installation Guide (For Buyers)

**Prerequisites:**
*   **Node.js** (Version 18 or higher) installed on your computer.

### Step 1: Extract Files
Unzip the downloaded package to a folder on your computer.

### Step 2: Install Dependencies
Open your terminal (Command Prompt/Terminal), navigate to the extracted folder, and run:
```bash
npm install
```

### Step 3: Run Locally (Development)
To test the application on your local machine:
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🌐 Deployment Guide (Production)

Since this is a client-side application (SPA), you can host it for **FREE** on services like Vercel, Netlify, or Cloudflare Pages.

### Method 1: Build & Upload (Easiest)
1.  Run the build command in your terminal:
    ```bash
    npm run build
    ```
2.  A `dist` folder will be created in your project directory.
3.  Drag and drop the `dist` folder into **Netlify Drop** or upload it to your hosting provider's public directory.

### Method 2: Vercel/Netlify Git Integration
1.  Push the source code to your private GitHub repository.
2.  Connect your repository to Vercel/Netlify.
3.  The build settings should be automatically detected:
    *   **Framework Preset:** Vite
    *   **Build Command:** `npm run build`
    *   **Output Directory:** `dist`

---

## 📖 Quick Usage for End Users

1.  **Get API Key:** Obtain a key from Google AI Studio (Free) or OpenAI.
2.  **Settings:** Open the app, go to Settings, and paste your API Key.
3.  **Create Project:** Create a new project (e.g., "Fantasy Novel Vol 1").
4.  **Glossary:** Add important character names to the Glossary.
5.  **Translate:** Go to the Editor, paste your raw text, and click Translate.

---

## 📄 License

This item is sold under the standard **Envato/Codester License**.
*   **Regular License:** Use in a single end product, no charge to end users.
*   **Extended License:** Use in a single end product, end users can be charged.

---

*Built with ❤️ and 🍡 by NovTL Studio.*
