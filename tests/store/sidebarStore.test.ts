import { describe, it, expect, beforeEach } from 'vitest';
import { useSidebarStore } from '../../src/store/sidebarStore';

beforeEach(() => {
  useSidebarStore.setState({
    visible: true,
    activeTab: 'files',
    width: 240,
    workspaceFolders: [],
    activeHeadingLine: null,
    gitStatus: {},
  });
});

describe('sidebarStore', () => {
  it('toggleVisible flips visible', () => {
    const before = useSidebarStore.getState().visible;
    useSidebarStore.getState().toggleVisible();
    expect(useSidebarStore.getState().visible).toBe(!before);
  });

  it('showWith makes sidebar visible and sets the tab', () => {
    useSidebarStore.setState({ visible: false, activeTab: 'files' });
    useSidebarStore.getState().showWith('outline');
    const s = useSidebarStore.getState();
    expect(s.visible).toBe(true);
    expect(s.activeTab).toBe('outline');
  });

  it('setActiveTab changes the tab', () => {
    useSidebarStore.getState().setActiveTab('outline');
    expect(useSidebarStore.getState().activeTab).toBe('outline');
  });

  it('setWidth clamps below 180 to 180', () => {
    useSidebarStore.getState().setWidth(50);
    expect(useSidebarStore.getState().width).toBe(180);
  });

  it('setWidth clamps above 480 to 480', () => {
    useSidebarStore.getState().setWidth(1000);
    expect(useSidebarStore.getState().width).toBe(480);
  });

  it('setWidth accepts a value within range', () => {
    useSidebarStore.getState().setWidth(300);
    expect(useSidebarStore.getState().width).toBe(300);
  });

  it('addFolder appends a path to workspaceFolders', () => {
    useSidebarStore.getState().addFolder('/Users/me/notes');
    expect(useSidebarStore.getState().workspaceFolders).toEqual(['/Users/me/notes']);
  });

  it('addFolder is a no-op when the folder is already in the list', () => {
    useSidebarStore.getState().addFolder('/a');
    useSidebarStore.getState().addFolder('/a');
    expect(useSidebarStore.getState().workspaceFolders).toEqual(['/a']);
  });

  it('addFolder preserves order across multiple distinct adds', () => {
    useSidebarStore.getState().addFolder('/a');
    useSidebarStore.getState().addFolder('/b');
    useSidebarStore.getState().addFolder('/c');
    expect(useSidebarStore.getState().workspaceFolders).toEqual(['/a', '/b', '/c']);
  });

  it('removeFolder removes one entry, leaves others', () => {
    useSidebarStore.setState({ workspaceFolders: ['/a', '/b', '/c'] });
    useSidebarStore.getState().removeFolder('/b');
    expect(useSidebarStore.getState().workspaceFolders).toEqual(['/a', '/c']);
  });

  it('removeFolder on an unknown path is a no-op', () => {
    useSidebarStore.setState({ workspaceFolders: ['/a'] });
    useSidebarStore.getState().removeFolder('/nope');
    expect(useSidebarStore.getState().workspaceFolders).toEqual(['/a']);
  });

  it('setWorkspaceFolders dedupes while preserving order', () => {
    useSidebarStore.getState().setWorkspaceFolders(['/a', '/b', '/a', '/c', '/b']);
    expect(useSidebarStore.getState().workspaceFolders).toEqual(['/a', '/b', '/c']);
  });

  it('setActiveHeadingLine stores the line', () => {
    useSidebarStore.getState().setActiveHeadingLine(42);
    expect(useSidebarStore.getState().activeHeadingLine).toBe(42);
  });

  it('updateGitStatus stores statuses keyed by root', () => {
    useSidebarStore.getState().updateGitStatus('/a', { 'foo.md': 'modified' });
    useSidebarStore.getState().updateGitStatus('/b', { 'bar.md': 'untracked' });
    const s = useSidebarStore.getState().gitStatus;
    expect(s['/a']).toEqual({ 'foo.md': 'modified' });
    expect(s['/b']).toEqual({ 'bar.md': 'untracked' });
  });

  it('updateGitStatus replaces a root\'s status map (does not merge)', () => {
    useSidebarStore.getState().updateGitStatus('/a', { 'foo.md': 'modified', 'bar.md': 'modified' });
    useSidebarStore.getState().updateGitStatus('/a', { 'foo.md': 'modified' });
    expect(useSidebarStore.getState().gitStatus['/a']).toEqual({ 'foo.md': 'modified' });
  });

  it('removeFolder also drops the root\'s gitStatus entry', () => {
    useSidebarStore.setState({ workspaceFolders: ['/a', '/b'] });
    useSidebarStore.getState().updateGitStatus('/a', { 'foo.md': 'modified' });
    useSidebarStore.getState().updateGitStatus('/b', { 'bar.md': 'modified' });
    useSidebarStore.getState().removeFolder('/a');
    const s = useSidebarStore.getState();
    expect(s.workspaceFolders).toEqual(['/b']);
    expect(s.gitStatus).toEqual({ '/b': { 'bar.md': 'modified' } });
  });
});
