import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import './lib/firebase';

// Registrar Service Worker para PWA e deep linking
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed, ignore
    });
  });
}

// Handler para deep links em PWA/app
const handleDeepLink = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const sharedUrl = urlParams.get('url') || urlParams.get('text');
  if (sharedUrl && window.location.pathname === '/share') {
    // Processar link compartilhado
    console.log('Deep link received:', sharedUrl);
  }
};
handleDeepLink();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
