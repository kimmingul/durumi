import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { StatusBar } from '../../src/components/StatusBar';
import { useAppStore } from '../../src/store/appStore';

/**
 * 상태바 안내 배선 테스트. 판정 로직 자체는
 * `tests/editor/headingHint.test.ts` 가 덮는다 — 여기서는 스토어 플래그가
 * 실제로 렌더에 반영되는지만 본다.
 */

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<StatusBar />);
  });
  return {
    host,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => {
  useAppStore.setState({ headingHint: false, content: '', filePath: null });
});

afterEach(() => {
  useAppStore.setState({ headingHint: false });
});

describe('StatusBar — 제목 공백 안내', () => {
  it('플래그가 꺼져 있으면 표시하지 않는다', () => {
    const { host, cleanup } = mount();
    expect(host.querySelector('[data-testid="status-heading-hint"]')).toBeNull();
    cleanup();
  });

  it('플래그가 켜지면 안내를 표시한다', () => {
    const { host, cleanup } = mount();
    act(() => {
      useAppStore.getState().setHeadingHint(true);
    });
    const hint = host.querySelector('[data-testid="status-heading-hint"]');
    expect(hint).not.toBeNull();
    expect((hint?.textContent ?? '').length).toBeGreaterThan(0);
    cleanup();
  });

  it('스크린리더에 알리되 시선을 뺏지 않는 속성을 갖는다', () => {
    const { host, cleanup } = mount();
    act(() => {
      useAppStore.getState().setHeadingHint(true);
    });
    const hint = host.querySelector('[data-testid="status-heading-hint"]');
    expect(hint?.getAttribute('role')).toBe('status');
    expect(hint?.getAttribute('aria-live')).toBe('polite');
    cleanup();
  });

  it('플래그가 다시 꺼지면 사라진다', () => {
    const { host, cleanup } = mount();
    act(() => {
      useAppStore.getState().setHeadingHint(true);
    });
    expect(host.querySelector('[data-testid="status-heading-hint"]')).not.toBeNull();
    act(() => {
      useAppStore.getState().setHeadingHint(false);
    });
    expect(host.querySelector('[data-testid="status-heading-hint"]')).toBeNull();
    cleanup();
  });
});
