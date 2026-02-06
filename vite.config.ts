
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// CUSTOM PLUGIN: Force copy files from root to dist after build
const copyRootFiles = () => {
  return {
    name: 'copy-root-files',
    closeBundle: async () => {
      const filesToCopy = [
        'manifest.json', 
        'sw.js', 
        'icon-192.png', 
        'icon-512.png', 
        'icon.svg'
      ];
      
      // Ensure dist folder exists
      if (!fs.existsSync(path.resolve(__dirname, 'dist'))) {
         fs.mkdirSync(path.resolve(__dirname, 'dist'));
      }

      filesToCopy.forEach(file => {
        const src = path.resolve(__dirname, file);
        const dest = path.resolve(__dirname, 'dist', file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      });
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // PENTING: Harus relative path untuk Electron & Capacitor
  plugins: [
    react(), 
    copyRootFiles()
  ],
  define: {
    'process.env': {}
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0, 
    chunkSizeWarningLimit: 1600,
  }
})
