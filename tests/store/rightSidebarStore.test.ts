import { describe, it, expect, beforeEach } from 'vitest';
import { useRightSidebarStore } from '../../src/store/rightSidebarStore';

// Reset the store to its documented defaults before every test so each case
// runs in isolation. The store does not persist to disk itself — persistence
// flows through `RightSidebar.tsx` -> `window.api.prefsSet`, covered elsewhere.
beforeEach(() => {
  useRightSidebarStore.setState({
    visible: false,
    activeTab: 'references',
    width: 280,
  });
});

describe('rightSidebarStore', () => {
  it('starts with the documented defaults (hidden, references, width=280)', () => {
    const s = useRightSidebarStore.getState();
    expect(s.visible).toBe(false);
    expect(s.activeTab).toBe('references');
    expect(s.width).toBe(280);
  });

  it('toggleVisible flips visible and persists across consecutive calls', () => {
    expect(useRightSidebarStore.getState().visible).toBe(false);
    useRightSidebarStore.getState().toggleVisible();
    expect(useRightSidebarStore.getState().visible).toBe(true);
    useRightSidebarStore.getState().toggleVisible();
    expect(useRightSidebarStore.getState().visible).toBe(false);
    useRightSidebarStore.getState().toggleVisible();
    expect(useRightSidebarStore.getState().visible).toBe(true);
  });

  it("showWith('ai') sets visible=true AND activeTab='ai' in one shot", () => {
    useRightSidebarStore.setState({ visible: false, activeTab: 'references' });
    useRightSidebarStore.getState().showWith('ai');
    const s = useRightSidebarStore.getState();
    expect(s.visible).toBe(true);
    expect(s.activeTab).toBe('ai');
  });

  it("showWith('references') also opens the pane and selects References", () => {
    useRightSidebarStore.setState({ visible: false, activeTab: 'ai' });
    useRightSidebarStore.getState().showWith('references');
    const s = useRightSidebarStore.getState();
    expect(s.visible).toBe(true);
    expect(s.activeTab).toBe('references');
  });

  it('setActiveTab changes activeTab without affecting visibility', () => {
    useRightSidebarStore.setState({ visible: false, activeTab: 'references' });
    useRightSidebarStore.getState().setActiveTab('ai');
    expect(useRightSidebarStore.getState().activeTab).toBe('ai');
    // Toggling tab on a hidden pane must NOT pop it open — that's showWith's job.
    expect(useRightSidebarStore.getState().visible).toBe(false);

    useRightSidebarStore.setState({ visible: true, activeTab: 'references' });
    useRightSidebarStore.getState().setActiveTab('ai');
    expect(useRightSidebarStore.getState().activeTab).toBe('ai');
    expect(useRightSidebarStore.getState().visible).toBe(true);
  });

  it('setVisible explicitly sets visibility without touching the active tab', () => {
    useRightSidebarStore.setState({ visible: false, activeTab: 'ai' });
    useRightSidebarStore.getState().setVisible(true);
    expect(useRightSidebarStore.getState().visible).toBe(true);
    expect(useRightSidebarStore.getState().activeTab).toBe('ai');
    useRightSidebarStore.getState().setVisible(false);
    expect(useRightSidebarStore.getState().visible).toBe(false);
    expect(useRightSidebarStore.getState().activeTab).toBe('ai');
  });

  it('setWidth clamps below the 200 minimum', () => {
    useRightSidebarStore.getState().setWidth(50);
    expect(useRightSidebarStore.getState().width).toBe(200);
    useRightSidebarStore.getState().setWidth(-10000);
    expect(useRightSidebarStore.getState().width).toBe(200);
    useRightSidebarStore.getState().setWidth(0);
    expect(useRightSidebarStore.getState().width).toBe(200);
  });

  it('setWidth clamps above the 560 maximum', () => {
    useRightSidebarStore.getState().setWidth(800);
    expect(useRightSidebarStore.getState().width).toBe(560);
    useRightSidebarStore.getState().setWidth(99999);
    expect(useRightSidebarStore.getState().width).toBe(560);
  });

  it('setWidth accepts any value within [200, 560] verbatim', () => {
    useRightSidebarStore.getState().setWidth(200);
    expect(useRightSidebarStore.getState().width).toBe(200);
    useRightSidebarStore.getState().setWidth(560);
    expect(useRightSidebarStore.getState().width).toBe(560);
    useRightSidebarStore.getState().setWidth(333);
    expect(useRightSidebarStore.getState().width).toBe(333);
  });

  it('each setter is idempotent — calling with the same value yields the same state', () => {
    useRightSidebarStore.setState({ visible: true, activeTab: 'ai', width: 300 });

    useRightSidebarStore.getState().setVisible(true);
    useRightSidebarStore.getState().setVisible(true);
    expect(useRightSidebarStore.getState().visible).toBe(true);

    useRightSidebarStore.getState().setActiveTab('ai');
    useRightSidebarStore.getState().setActiveTab('ai');
    expect(useRightSidebarStore.getState().activeTab).toBe('ai');

    useRightSidebarStore.getState().setWidth(300);
    useRightSidebarStore.getState().setWidth(300);
    expect(useRightSidebarStore.getState().width).toBe(300);

    useRightSidebarStore.getState().showWith('ai');
    useRightSidebarStore.getState().showWith('ai');
    const s = useRightSidebarStore.getState();
    expect(s.visible).toBe(true);
    expect(s.activeTab).toBe('ai');
  });
});
