import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { installGlobalErrorSurface } from '../../src/utils/errorSurface';
import { useToastStore } from '../../src/store/toastStore';

/**
 * 렌더러에 에러 경계가 없어 렌더 중 throw가 앱 전체를 빈 창으로 만들고,
 * main에서 넘어온 거부(PathNotAllowedError 등)가 가드되지 않은 await 지점에서
 * unhandled rejection으로 조용히 사라지던 결함의 회귀 테스트.
 */

function Boom(): JSX.Element {
  throw new Error('boom');
}

function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(ui);
  });
  return {
    host,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  useToastStore.getState().clear();
  // React는 경계가 잡은 에러를 항상 console.error로 다시 뱉는다 — 테스트
  // 출력만 조용히 하고 호출 여부 자체는 검증하지 않는다.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
  it('에러가 없으면 children을 그대로 렌더한다', () => {
    const { host, cleanup } = mount(
      <ErrorBoundary>
        <p data-testid="child">ok</p>
      </ErrorBoundary>,
    );
    expect(host.querySelector('[data-testid="child"]')?.textContent).toBe('ok');
    cleanup();
  });

  it('children이 throw하면 빈 화면 대신 폴백을 렌더한다', () => {
    const { host, cleanup } = mount(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const fallback = host.querySelector('[data-testid="error-boundary-fallback"]');
    expect(fallback).not.toBeNull();
    // 빈 창이 아니라는 것이 핵심 — 사용자가 읽을 텍스트가 있어야 한다.
    expect((fallback?.textContent ?? '').length).toBeGreaterThan(0);
    cleanup();
  });

  it('폴백에 복구 동작(다시 불러오기)을 노출한다', () => {
    const { host, cleanup } = mount(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const reload = host.querySelector('[data-testid="error-boundary-reload"]');
    expect(reload).not.toBeNull();
    expect(reload?.tagName.toLowerCase()).toBe('button');
    cleanup();
  });

  it('원인 메시지를 폴백에 포함해 진단 가능하게 한다', () => {
    const { host, cleanup } = mount(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const detail = host.querySelector('[data-testid="error-boundary-detail"]');
    expect(detail?.textContent).toContain('boom');
    cleanup();
  });
});

describe('installGlobalErrorSurface', () => {
  it('가드되지 않은 promise 거부를 토스트로 surface한다 (재현 케이스)', () => {
    const uninstall = installGlobalErrorSurface();
    const ev = new Event('unhandledrejection') as Event & { reason?: unknown };
    ev.reason = new Error('path not allowed: /etc/passwd');
    window.dispatchEvent(ev);

    const toasts = useToastStore.getState().toasts;
    expect(toasts.length).toBe(1);
    expect(toasts[0]?.message).toContain('path not allowed');
    uninstall();
  });

  it('uninstall 후에는 더 이상 토스트를 만들지 않는다', () => {
    const uninstall = installGlobalErrorSurface();
    uninstall();
    const ev = new Event('unhandledrejection') as Event & { reason?: unknown };
    ev.reason = new Error('after uninstall');
    window.dispatchEvent(ev);
    expect(useToastStore.getState().toasts.length).toBe(0);
  });

  it('문자열 reason도 처리한다', () => {
    const uninstall = installGlobalErrorSurface();
    const ev = new Event('unhandledrejection') as Event & { reason?: unknown };
    ev.reason = 'plain string failure';
    window.dispatchEvent(ev);
    expect(useToastStore.getState().toasts[0]?.message).toContain('plain string failure');
    uninstall();
  });

  it('같은 메시지가 연달아 와도 토스트를 중복 쌓지 않는다', () => {
    const uninstall = installGlobalErrorSurface();
    for (let i = 0; i < 3; i++) {
      const ev = new Event('unhandledrejection') as Event & { reason?: unknown };
      ev.reason = new Error('repeated');
      window.dispatchEvent(ev);
    }
    expect(useToastStore.getState().toasts.length).toBe(1);
    uninstall();
  });
});
