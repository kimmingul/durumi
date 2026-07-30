import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LanguageProvider, resolveRendererLang } from './i18n/t';
import { installGlobalErrorSurface } from './utils/errorSurface';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('root element not found');

// Resolve initial language synchronously from navigator.language so the
// first paint already uses the right strings. App.tsx will reconcile with
// the persisted preference once `prefsGet` resolves.
const initialLang = resolveRendererLang(undefined);

// 가드되지 않은 IPC 거부를 토스트로 흘리는 전역 그물. 트리 밖에서 한 번만
// 설치한다 — 렌더 트리가 죽어도 계속 살아 있어야 한다.
installGlobalErrorSurface();

// ErrorBoundary는 LanguageProvider 안쪽에 둔다 — 폴백이 t()로 사용자 언어를
// 쓰기 때문이다. Provider 자체가 throw할 가능성은 없다(순수 컨텍스트).
createRoot(container).render(
  <React.StrictMode>
    <LanguageProvider initial={initialLang}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>,
);
