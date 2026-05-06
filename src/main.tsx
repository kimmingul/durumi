import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LanguageProvider, resolveRendererLang } from './i18n/t';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('root element not found');

// Resolve initial language synchronously from navigator.language so the
// first paint already uses the right strings. App.tsx will reconcile with
// the persisted preference once `prefsGet` resolves.
const initialLang = resolveRendererLang(undefined);

createRoot(container).render(
  <React.StrictMode>
    <LanguageProvider initial={initialLang}>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);
