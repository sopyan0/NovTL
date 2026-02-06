
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // IMPORT CSS FILE HERE
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('NovTL SW registered: ', registration.scope);
      })
      .catch((err) => {
        console.warn('NovTL SW registration skipped/failed:', err);
      });
  });
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
