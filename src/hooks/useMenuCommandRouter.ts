import { useEffect } from 'react';
import type { EditorView } from '@codemirror/view';
import type { MenuCommand } from '@shared/ipc-contract';
import { useAppStore } from '../store/appStore';
import {
  activeDocument,
  isDirty as isDocumentDirty,
  isMarkdownPanel,
  requestClosePanel,
  useActiveDocument,
  useWorkspaceStore,
} from '../store/workspaceStore';
import { getActiveView } from '../store/panelViews';
import { dispatchPanelEvent } from '../editor/panelEvents';
import { useSidebarStore } from '../store/sidebarStore';
import { basenameOf } from '../utils/path';
import { useRightSidebarStore } from '../store/rightSidebarStore';
import { useLanguage, resolveRendererLang } from '../i18n/t';
import { currentParagraph } from '../editor/paragraphContext';
import { focusModeField, setFocusMode, setTypewriterMode, typewriterModeField } from '../editor/viewModes';
import { applyInlineFormat } from '../editor/keymap/pendingInlineFormat';
import { setHeading } from '../editor/keymap/setHeading';
import { insertTable as insertTableHelper } from '../editor/keymap/insertTable';
import { insertCodeBlock as insertCodeBlockHelper } from '../editor/keymap/insertCodeBlock';
import { toggleTask as toggleTaskHelper } from '../editor/keymap/toggleTask';
import { wrapComment } from '../editor/keymap/wrapComment';
import {
  wrapCmInsert,
  wrapCmDelete,
  wrapCmSubstitute,
  wrapCmHighlight,
  wrapCmComment,
} from '../editor/keymap/wrapCriticMarkup';
import { nextMemo, prevMemo } from '../editor/keymap/memoNav';
import { openSearch, openSearchAndReplace, gotoNext, gotoPrev } from '../editor/openSearch';
import { findTemplate } from '@shared/manuscriptTemplates';
import type { FileMenuCommands } from './useFileMenuCommands';
import type { ExportFlow } from './useExportFlow';
import type { CitationInsertFlow } from './useCitationInsertFlow';
import type { AiPalette } from './useAiPalette';
import type { WorkspaceMenu } from './useWorkspaceMenu';

/**
 * 마크다운 전용 커맨드를 활성 패널에 적용한다 — 대상이 없으면 **무동작**.
 *
 * 뷰를 인자가 아니라 **접근자**로 받는 것이 요점이다. 호출부가 뷰를 먼저 꺼내
 * 넘기면 그 순간 낡은 뷰 창이 다시 열린다.
 */
function applyToMarkdownView(
  mdView: () => EditorView | null,
  apply: (view: EditorView) => void,
): void {
  const v = mdView();
  if (!v) return;
  apply(v);
  v.focus();
}

interface MenuCommandRouterDeps {
  fileCommands: FileMenuCommands;
  exportFlow: ExportFlow;
  citationFlow: CitationInsertFlow;
  aiPalette: AiPalette;
  workspace: WorkspaceMenu;
  setQuickOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
}

/**
 * Central dispatcher for `window.api.onMenuCommand`. Translates every
 * `MenuCommand` variant into the right action across the file / export /
 * citation / AI palette / workspace / editor-formatting subsystems.
 *
 * Reads the active document from `workspaceStore` (`path`, `content`, 미저장
 * 여부) plus the appStore window-global slice (
 * `themePreference`) so the subscription re-binds whenever those snapshots
 * change — without that, async menu handlers would close over stale values.
 *
 * Every menu command in the renderer routes through here; if you add a new
 * `MenuCommand`, add its branch in this hook and not back in App.tsx.
 *
 * ## 뷰는 진입 시점이 아니라 **사용 시점**에 읽는다 (REQ-PANEL-031, OQ-4 후보 1)
 *
 * 예전에는 `const view = editorViewRef.current`가 이 `async` 핸들러의 첫 줄이었고
 * 그 아래로 `await` 분기가 여럿이었다. 비동기 커맨드를 처리하는 동안 활성 패널이
 * 바뀌면 그 지역 변수는 이미 활성이 아닌 패널의 뷰를 가리킨다 — 사용자가 보고
 * 있지 않은 문서가 조용히 바뀐다. 뷰가 하나뿐일 때만 무해했다.
 */
export function useMenuCommandRouter(deps: MenuCommandRouterDeps): void {
  const {
    fileCommands,
    exportFlow,
    citationFlow,
    aiPalette,
    workspace,
    setQuickOpen,
    setSettingsOpen,
    setShortcutsOpen,
  } = deps;

  const filePath = useActiveDocument((d) => d?.path ?? null);
  const content = useActiveDocument((d) => d?.content ?? '');
  const isDirty = useActiveDocument((d) => (d ? isDocumentDirty(d) : false));
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const toggleSidebarVisible = useSidebarStore((s) => s.toggleVisible);
  const showWith = useSidebarStore((s) => s.showWith);
  const toggleRightSidebarVisible = useRightSidebarStore((s) => s.toggleVisible);
  const rightSidebarShowWith = useRightSidebarStore((s) => s.showWith);
  const setRightSidebarVisible = useRightSidebarStore((s) => s.setVisible);
  const { setLang } = useLanguage();

  // v0.2.30 — 메모는 독립 패널이 아니라 오른쪽 사이드바의 탭이다.
  // "메모 패널 토글"은 이제 메모 탭이 보이는 상태를 토글한다: 이미 메모 탭이
  // 열려 있으면 사이드바를 닫고, 아니면 메모 탭으로 열어준다.
  function toggleMemoTab() {
    const s = useRightSidebarStore.getState();
    if (s.visible && s.activeTab === 'memo') {
      setRightSidebarVisible(false);
      return;
    }
    s.showWith('memo');
  }

  useEffect(() => {
    return window.api.onMenuCommand(async (cmd: MenuCommand) => {
      // 뷰 의존 커맨드의 대상은 **활성 패널**이며, 매 사용마다 다시 읽는다.
      const view = (): EditorView | null => getActiveView();
      // 마크다운 전용 커맨드는 활성 패널이 보조 패널이면 **아무 일도 하지 않는다**
      // (REQ-PANEL-032). 다른 패널로 우회 적용하지 않는다 — 사용자가 보고 있지
      // 않은 문서를 조용히 바꾸는 것이 최악의 결과이므로 "마지막 마크다운 패널로
      // 보낸다"는 대안은 채택되지 않는다.
      const mdView = (): EditorView | null => {
        const s = useWorkspaceStore.getState();
        if (s.activePanelId === null || !isMarkdownPanel(s, s.activePanelId)) return null;
        return getActiveView();
      };
      // SPEC-V03-WORKSPACE-001 REQ-WS-047a: 수동 새로고침의 **호출 가능한**
      // 진입점. 시각적 어포던스(버튼 위치·단축키)는 SPEC-2 소유이므로
      // 여기서는 메뉴 커맨드로만 노출한다.
      if (cmd === 'refreshProjectTree') {
        const path = activeDocument(useWorkspaceStore.getState())?.path ?? null;
        if (path) await window.api.projectRefresh(path);
        return;
      }
      if (cmd === 'new') { await fileCommands.doNew(); return; }
      if (cmd === 'open') { await fileCommands.doOpen(); return; }
      if (cmd === 'save') { await fileCommands.doSave(); return; }
      if (cmd === 'saveAs') { await fileCommands.doSaveAs(); return; }
      if (cmd === 'exportHtml') { await exportFlow.doExport('html'); return; }
      if (cmd === 'exportPdf') { await exportFlow.doExport('pdf'); return; }
      if (cmd === 'exportDocx') { await exportFlow.doPandocExport('docx'); return; }
      if (cmd === 'exportLatex') { await exportFlow.doPandocExport('latex'); return; }
      if (cmd === 'importDocx') { await exportFlow.doPandocImportDocx(); return; }
      if (cmd === 'toggleTheme') {
        const currentTheme = useAppStore.getState().theme;
        const next = currentTheme === 'dark' ? 'light' : 'dark';
        setThemePreference(next);
        void window.api.prefsSet({ theme: next });
        return;
      }
      // 모드 커맨드는 **활성 패널**에 작용하고 `prefs`에 쓰지 않는다
      // (REQ-PANEL-023·024). 예전에는 여기서 `prefs.editor.defaultMode`를
      // 덮어썼고, 그래서 마지막으로 모드를 바꾼 패널이 다음 세션의 모든 패널을
      // 규정했다 — 기각된 후보 2다.
      if (cmd === 'toggleSourceMode') {
        const panelId = useWorkspaceStore.getState().activePanelId;
        if (panelId !== null) useWorkspaceStore.getState().togglePanelSourceMode(panelId);
        return;
      }
      if (typeof cmd === 'object' && cmd.type === 'setEditMode') {
        const panelId = useWorkspaceStore.getState().activePanelId;
        if (panelId !== null) useWorkspaceStore.getState().setPanelDisplayMode(panelId, cmd.mode);
        return;
      }
      if (cmd === 'openFolder') { await workspace.openWorkspaceFolder(); return; }
      if (cmd === 'splitPanel') {
        // **분할은 빈 패널을 연다.** 같은 파일을 두 패널에 띄우는 것은 v0.3에서
        // 금지되어 있고(REQ-PANEL-011), 그 금지를 우회하지 않는다 — 문서↔뷰
        // 트랜잭션 동기화 프로토콜(`design.md` §2.5의 다섯 의무) 없이 중복 뷰를
        // 출하하면 한쪽의 키 입력이 다른 쪽에서 문서 전체 교체가 된다.
        // 따라서 v0.3의 분할은 "두 번째 파일을 열 자리를 만드는 것"이다.
        //
        // 새 원고 패널의 초기 모드는 `prefs.editor.defaultMode`다(REQ-PANEL-023).
        // 분할한 패널의 현재 모드를 물려주지 않는다 — 기본값의 의미가 "새 패널이
        // 어떻게 열리는가"이므로 출처는 언제나 그 하나여야 한다.
        useWorkspaceStore
          .getState()
          .openInNewPanel(null, '', 'markdown', useAppStore.getState().defaultMode);
        return;
      }
      if (cmd === 'closePanel') {
        // 마지막 패널은 닫히지 않는다(REQ-PANEL-004) — `closePanel`이 거부하므로
        // 이 커맨드는 그 경우 **무동작**이다. 메뉴 항목을 비활성화하는 대신
        // 무동작을 택한 이유: 비활성화하려면 main이 렌더러의 패널 수를 알아야
        // 하고, 그 채널 하나가 얻는 것보다 늘리는 표면이 크다.
        const panelId = useWorkspaceStore.getState().activePanelId;
        if (panelId === null) return;
        await requestClosePanel(panelId, {
          confirmDiscard: (name) => window.api.confirmDiscard(basenameOf(name)),
          save: () => fileCommands.doSave(),
        });
        return;
      }
      if (cmd === 'toggleSidebar') { toggleSidebarVisible(); return; }
      if (cmd === 'toggleRightSidebar') { toggleRightSidebarVisible(); return; }
      if (cmd === 'toggleMemoPanel') { toggleMemoTab(); return; }
      if (cmd === 'showFiles') { showWith('files'); return; }
      if (cmd === 'showOutline') { showWith('outline'); return; }
      if (cmd === 'showSearch') { showWith('search'); return; }
      // v0.2.30 — 메모/변경 탭은 오른쪽 사이드바로 이동했다. 메뉴 항목이 계속
      // 동작하도록 왼쪽이 아니라 오른쪽 사이드바를 연다.
      if (cmd === 'showMemos') { rightSidebarShowWith('memo'); return; }
      if (cmd === 'showChanges') { rightSidebarShowWith('changes'); return; }
      if (cmd === 'showReferences') { rightSidebarShowWith('references'); return; }
      if (cmd === 'showAi') { rightSidebarShowWith('ai'); return; }
      if (cmd === 'openKeyboardShortcuts') { setShortcutsOpen(true); return; }
      // 아래는 전부 마크다운 전용이다 — `mdView()`가 null이면 무동작으로 끝난다.
      if (cmd === 'addMemo') { applyToMarkdownView(mdView, wrapComment); return; }
      if (cmd === 'cmInsert') { applyToMarkdownView(mdView, wrapCmInsert); return; }
      if (cmd === 'cmDelete') { applyToMarkdownView(mdView, wrapCmDelete); return; }
      if (cmd === 'cmSubstitute') { applyToMarkdownView(mdView, wrapCmSubstitute); return; }
      if (cmd === 'cmHighlight') { applyToMarkdownView(mdView, wrapCmHighlight); return; }
      if (cmd === 'cmComment') { applyToMarkdownView(mdView, wrapCmComment); return; }
      if (cmd === 'nextMemo') { applyToMarkdownView(mdView, nextMemo); return; }
      if (cmd === 'prevMemo') { applyToMarkdownView(mdView, prevMemo); return; }
      if (cmd === 'toggleExportIncludeComments') {
        const prefs = await window.api.prefsGet();
        await window.api.prefsSet({ exportIncludeComments: !prefs.exportIncludeComments });
        return;
      }
      if (cmd === 'toggleExportPreserveAnnotations') {
        const prefs = await window.api.prefsGet();
        await window.api.prefsSet({ exportPreserveAnnotations: !prefs.exportPreserveAnnotations });
        return;
      }
      if (cmd === 'quickOpen') { setQuickOpen(true); return; }
      if (cmd === 'openSettings') { setSettingsOpen(true); return; }
      if (cmd === 'insertCitationFromDoi') { citationFlow.setCitationDialogOpen(true); return; }
      if (cmd === 'bulkInsertFromDoi') { citationFlow.setBulkDoiOpen(true); return; }
      if (cmd === 'importReferences') {
        const picked = await window.api.dialogPickFile({
          title: 'Import references',
          filters: [
            { name: 'BibTeX / RIS', extensions: ['bib', 'bibtex', 'ris'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        if (picked) await citationFlow.openImportDialog(picked);
        return;
      }
      if (cmd === 'aiCitationSuggest') {
        const [hasA, hasO] = await Promise.all([
          window.api.aiHasKey('anthropic'),
          window.api.aiHasKey('openai-compatible'),
        ]);
        // 뷰는 **await 이후**에 읽는다. 키 조회를 기다리는 동안 사용자가 다른
        // 패널로 옮겨갔다면 제안은 그 패널의 문단에 대한 것이어야 한다 —
        // 진입 시점의 뷰를 붙들면 보고 있지 않은 문서의 문단을 제안한다.
        const v = mdView();
        if (!v) return;
        const para = currentParagraph(v.state);
        citationFlow.setCiteSuggestState({
          open: true,
          paragraph: para?.text ?? '',
          insertAt: para?.to ?? v.state.selection.main.head,
          hasKey: hasA || hasO,
        });
        return;
      }
      if (cmd === 'openCitePalette') { citationFlow.setCitePaletteOpen(true); return; }
      if (cmd === 'openAiPalette') { await aiPalette.open(); return; }
      // 포커스/타이프라이터 모드는 마크다운 전용이 아니다 — 어떤 버퍼에서도
      // 의미가 있으므로 활성 패널의 뷰에 그대로 작용한다.
      if (cmd === 'toggleFocusMode') {
        const v = view();
        if (!v) return;
        const cur = v.state.field(focusModeField, false);
        v.dispatch({ effects: setFocusMode.of(!cur) });
        return;
      }
      if (cmd === 'toggleTypewriterMode') {
        const v = view();
        if (!v) return;
        const cur = v.state.field(typewriterModeField, false);
        v.dispatch({ effects: setTypewriterMode.of(!cur) });
        return;
      }
      if (cmd === 'languageChanged') {
        // Main process already updated prefs + rebuilt the menu; just
        // re-fetch so we apply the new resolved language to React.
        const prefs = await window.api.prefsGet();
        setLang(resolveRendererLang(prefs.language));
        return;
      }
      if (cmd === 'bold') { applyToMarkdownView(mdView, (v) => applyInlineFormat(v, 'bold')); return; }
      if (cmd === 'italic') { applyToMarkdownView(mdView, (v) => applyInlineFormat(v, 'italic')); return; }
      if (cmd === 'code') { applyToMarkdownView(mdView, (v) => applyInlineFormat(v, 'code')); return; }
      if (cmd === 'strikethrough') { applyToMarkdownView(mdView, (v) => applyInlineFormat(v, 'strike')); return; }
      if (cmd === 'insertTable') { applyToMarkdownView(mdView, insertTableHelper); return; }
      if (cmd === 'toggleTask') { applyToMarkdownView(mdView, toggleTaskHelper); return; }
      if (cmd === 'codeBlock') { applyToMarkdownView(mdView, insertCodeBlockHelper); return; }
      // 검색은 마크다운 전용이 아니다 — 보조 패널의 버퍼에서도 의미가 있다.
      if (cmd === 'find') { const v = view(); if (v) openSearch(v); return; }
      if (cmd === 'findAndReplace') { const v = view(); if (v) openSearchAndReplace(v); return; }
      if (cmd === 'findNext') { const v = view(); if (v) { gotoNext(v); v.focus(); } return; }
      if (cmd === 'findPrev') { const v = view(); if (v) { gotoPrev(v); v.focus(); } return; }
      if (cmd === 'link') {
        // v0.2.21 — route to the InsertLinkDialog (the same surface as the
        // toolbar's Link button) instead of inserting literal `[]()` text.
        // Pre-v0.2.21 the native menu's "링크 삽입" / Cmd+K / right-click
        // "Insert link" entry all dropped `[selection]()` directly into the
        // doc — confusing for the user who expected the same dialog the
        // toolbar opens. The dialog ALSO owns title-quote escaping and the
        // edit-existing-link replacement path (durumi:edit-link), so
        // routing here guarantees one shape of link insertion across all
        // three entry points (toolbar, native menu, right-click).
        //
        // EditorToolbar's `openLinkDialog` already handles the open path
        // (current selection → `linkInitialText`, no range to replace).
        // The event payload is empty by convention — the dialog reads the
        // current selection itself. The contract matches the existing
        // `durumi:edit-link` listener wiring.
        //
        // 발신 패널을 실어 보낸다(REQ-PANEL-034) — 그러지 않으면 패널마다 마운트된
        // 툴바가 모두 반응해 대화상자가 패널 수만큼 열린다.
        const v = mdView();
        if (!v) return;
        dispatchPanelEvent(v, 'durumi:open-link-dialog');
        v.focus();
        return;
      }
      if (typeof cmd === 'object' && cmd !== null && 'type' in cmd) {
        if (cmd.type === 'heading') {
          const level = cmd.level;
          applyToMarkdownView(mdView, (v) => setHeading(v, level));
          return;
        }
        if (cmd.type === 'openRecent') { await fileCommands.doOpenPath(cmd.path); return; }
        if (cmd.type === 'openRecentFolder') { await workspace.openRecentFolder(cmd.path); return; }
        if (cmd.type === 'closeFolder') { workspace.closeWorkspaceFolder(cmd.path); return; }
        if (cmd.type === 'newFromTemplate') {
          const tpl = findTemplate(cmd.templateId);
          if (!tpl) return;
          await fileCommands.loadTemplate(tpl.content);
          return;
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filePath,
    content,
    isDirty,
    themePreference,
    fileCommands,
    exportFlow,
    citationFlow,
    aiPalette,
    workspace,
  ]);
}
