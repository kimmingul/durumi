import React from 'react';
import { t } from '../i18n/t';

/**
 * 렌더 중 throw를 잡아 빈 창 대신 복구 가능한 화면을 보여준다.
 *
 * 이전에는 `src/` 어디에도 ErrorBoundary / componentDidCatch가 없어서,
 * 렌더 트리 어딘가에서 throw가 나면 React가 전체를 언마운트하고 사용자는
 * 아무 설명 없는 빈 BrowserWindow를 보게 됐다.
 *
 * 폴백은 의도적으로 t()만 쓰고 다른 컴포넌트를 렌더하지 않는다 — 경계가
 * 잡아야 할 에러의 원인이 공용 컴포넌트일 수 있으므로, 폴백 자체가 다시
 * throw할 여지를 남기지 않는다.
 */

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // 파일 sink는 main 프로세스에만 있다(electron/log.ts). 렌더러는 DevTools
    // console에 남기고, 사용자에게는 아래 폴백으로 알린다.
    console.error('[renderer] uncaught render error', error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  override render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        data-testid="error-boundary-fallback"
        role="alert"
        style={{
          padding: '2rem',
          maxWidth: '42rem',
          margin: '4rem auto',
          fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.6,
        }}
      >
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>{t('app.error.title')}</h1>
        <p style={{ margin: '0 0 1rem' }}>{t('app.error.body')}</p>
        <pre
          data-testid="error-boundary-detail"
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.8rem',
            opacity: 0.75,
            margin: '0 0 1.25rem',
          }}
        >
          {error.message}
        </pre>
        <button data-testid="error-boundary-reload" type="button" onClick={this.handleReload}>
          {t('app.error.reload')}
        </button>
      </div>
    );
  }
}
