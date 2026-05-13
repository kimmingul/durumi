/**
 * Single source of truth for native-menu i18n labels (v0.1.12).
 *
 * Before this module, `electron/i18n.ts` and `src/i18n/dict.ts` each owned a
 * private copy of the same `menu.*` keys, and they were repeatedly going out
 * of sync — most visibly the v0.1.10 menu restructure left `menu.references`,
 * `menu.aiAssist`, and the renamed reference submenu items defined only on
 * the renderer side, so the native menu bar showed raw i18n keys instead of
 * their labels.
 *
 * This file holds the authoritative `menu.*` labels (EN + KO) and is imported
 * by both:
 *   - `electron/i18n.ts` — spreads into its main-process dict
 *   - `src/i18n/dict.ts` — spreads into the renderer dict (for the
 *     KeyboardShortcutsDialog and any other UI that references menu labels)
 *
 * Pure-data module, no React / DOM / Electron imports — safe to bundle into
 * the main process.
 */

export type MenuLang = 'en' | 'ko';

export const menuLabels: Record<MenuLang, Record<string, string>> = {
  en: {
    // App / File
    'menu.file': 'File',
    'menu.file.new': 'New',
    'menu.file.newWindow': 'New Window',
    'menu.file.open': 'Open…',
    'menu.file.openFolder': 'Open Folder…',
    'menu.file.closeFolder': 'Close Folder',
    'menu.file.noFoldersOpen': 'No folders open',
    'menu.file.openRecent': 'Open Recent',
    'menu.file.noRecent': 'No recent files',
    'menu.file.save': 'Save',
    'menu.file.saveAs': 'Save As…',
    'menu.file.export': 'Export',
    'menu.file.exportHtml': 'HTML…',
    'menu.file.exportPdf': 'PDF…',
    'menu.file.exportDocx': 'Word (.docx)…',
    'menu.file.exportLatex': 'LaTeX (.tex)…',
    'menu.file.newFromTemplate': 'New from Template',
    'menu.file.import': 'Import',
    'menu.file.importDocx': 'Word (.docx)…',
    'menu.file.quickOpen': 'Quick Open…',
    'menu.file.closeWindow': 'Close Window',
    'menu.app.settings': 'Settings…',
    'menu.file.settings': 'Settings…',

    // Edit
    'menu.edit': 'Edit',
    'menu.edit.find': 'Find',
    'menu.edit.findAndReplace': 'Find and Replace',
    'menu.edit.findNext': 'Find Next',
    'menu.edit.findPrev': 'Find Previous',
    'menu.edit.bold': 'Bold',
    'menu.edit.italic': 'Italic',
    'menu.edit.inlineCode': 'Inline Code',
    'menu.edit.insertLink': 'Insert Link',
    'menu.edit.heading': 'Heading',
    'menu.edit.strikethrough': 'Strikethrough',
    'menu.edit.insertTable': 'Insert Table',
    'menu.edit.toggleTask': 'Toggle Task Marker',
    'menu.edit.codeBlock': 'Code Block',
    'menu.edit.openMacrosConfig': 'Open Macros Config…',
    'menu.edit.resetMacrosDefaults': 'Reset Macros to Medical Defaults',

    // View
    'menu.view': 'View',
    'menu.view.toggleTheme': 'Toggle Theme',
    'menu.view.toggleSourceMode': 'Toggle Markdown Source',
    'menu.view.toggleSidebar': 'Toggle Sidebar',
    'menu.view.toggleRightSidebar': 'Toggle Right Sidebar',
    'menu.view.showFiles': 'Show Files',
    'menu.view.showOutline': 'Show Outline',
    'menu.view.showSearch': 'Find in Files',
    'menu.view.focusMode': 'Focus Mode',
    'menu.view.typewriterMode': 'Typewriter Mode',
    'menu.view.openCustomCss': 'Open Custom CSS…',
    'menu.view.language': 'Language',
    'menu.view.language.system': 'System',
    'menu.view.language.en': 'English',
    'menu.view.language.ko': '한국어',
    'menu.view.editMode': 'Edit Mode',
    'menu.view.editMode.wysiwyg': 'Document',
    'menu.view.editMode.typora': 'Live',
    'menu.view.editMode.markdown': 'Source',
    'menu.view.toggleMemoPanel': 'Toggle Memo Panel',

    // Review (memo + change tracking + export toggles)
    'menu.review': 'Review',
    'menu.review.addMemo': 'Add memo',
    'menu.review.toggleMemoPanel': 'Toggle memo panel',
    'menu.review.changes': 'Track changes',
    'menu.review.cm.insert': 'Mark as insertion',
    'menu.review.cm.delete': 'Mark as deletion',
    'menu.review.cm.substitute': 'Mark as substitution',
    'menu.review.cm.highlight': 'Mark as highlight',
    'menu.review.cm.comment': 'Add reviewer comment',
    'menu.review.showMemos': 'Show Memos tab',
    'menu.review.showChanges': 'Show Changes tab',
    'menu.review.nextMemo': 'Next memo',
    'menu.review.prevMemo': 'Previous memo',
    'menu.review.exportIncludeComments': 'Include memos in export',
    'menu.review.exportPreserveAnnotations': 'Include track changes in export',
    // Items below were moved out of "Review" by v0.1.10 into dedicated
    // "References" and "AI Assist" top-level menus, but the i18n keys keep
    // the legacy `menu.review.*` namespace so the renderer's shortcut
    // dialog continues to refer to them by stable names.
    'menu.review.openCitePalette': 'Insert citation into text…',
    'menu.review.insertCitationFromDoi': 'Add reference from DOI…',
    'menu.review.bulkInsertFromDoi': 'Bulk import from DOI…',
    'menu.review.importReferences': 'Import from file (.bib / .ris)…',
    'menu.review.aiCitationSuggest': 'Suggest citation locations with AI…',
    'menu.review.showReferences': 'Open References sidebar',
    'menu.review.openAiPalette': 'Polish selection with AI…',
    'menu.review.showAi': 'Open AI sidebar',

    // References (v0.1.10) — top-level menu
    'menu.references': 'References',

    // AI Assist (v0.1.10) — top-level menu
    'menu.aiAssist': 'AI Assist',

    // Help
    'menu.help': 'Help',
    'menu.help.about': 'About Durumi',
    'menu.help.aboutDetail': 'Durumi — a paper crane for medical research.',
    'menu.help.shortcuts': 'Keyboard shortcuts…',
    'menu.help.checkForUpdates': 'Check for Updates…',
    'menu.help.openGitHub': 'Open GitHub',
  },

  ko: {
    // App / File
    'menu.file': '파일',
    'menu.file.new': '새 파일',
    'menu.file.newWindow': '새 창',
    'menu.file.open': '열기…',
    'menu.file.openFolder': '폴더 열기…',
    'menu.file.closeFolder': '폴더 닫기',
    'menu.file.noFoldersOpen': '열린 폴더 없음',
    'menu.file.openRecent': '최근 파일',
    'menu.file.noRecent': '최근 파일 없음',
    'menu.file.save': '저장',
    'menu.file.saveAs': '다른 이름으로 저장…',
    'menu.file.export': '내보내기',
    'menu.file.exportHtml': 'HTML…',
    'menu.file.exportPdf': 'PDF…',
    'menu.file.exportDocx': 'Word (.docx)…',
    'menu.file.exportLatex': 'LaTeX (.tex)…',
    'menu.file.newFromTemplate': '템플릿으로 새로 만들기',
    'menu.file.import': '가져오기',
    'menu.file.importDocx': 'Word (.docx)…',
    'menu.file.quickOpen': '빠르게 열기…',
    'menu.file.closeWindow': '창 닫기',
    'menu.app.settings': '설정…',
    'menu.file.settings': '설정…',

    // Edit
    'menu.edit': '편집',
    'menu.edit.find': '찾기',
    'menu.edit.findAndReplace': '찾아 바꾸기',
    'menu.edit.findNext': '다음 찾기',
    'menu.edit.findPrev': '이전 찾기',
    'menu.edit.bold': '굵게',
    'menu.edit.italic': '기울임',
    'menu.edit.inlineCode': '인라인 코드',
    'menu.edit.insertLink': '링크 삽입',
    'menu.edit.heading': '제목',
    'menu.edit.strikethrough': '취소선',
    'menu.edit.insertTable': '표 삽입',
    'menu.edit.toggleTask': '할 일 표시 전환',
    'menu.edit.codeBlock': '코드 블록',
    'menu.edit.openMacrosConfig': '매크로 설정 열기…',
    'menu.edit.resetMacrosDefaults': '매크로를 의학연구 기본값으로 초기화',

    // View
    'menu.view': '보기',
    'menu.view.toggleTheme': '테마 전환',
    'menu.view.toggleSourceMode': '마크다운 소스 전환',
    'menu.view.toggleSidebar': '사이드바 토글',
    'menu.view.toggleRightSidebar': '오른쪽 사이드바 토글',
    'menu.view.showFiles': '파일 보기',
    'menu.view.showOutline': '목차 보기',
    'menu.view.showSearch': '파일에서 찾기',
    'menu.view.focusMode': '포커스 모드',
    'menu.view.typewriterMode': '타자기 모드',
    'menu.view.openCustomCss': '사용자 CSS 열기…',
    'menu.view.language': '언어',
    'menu.view.language.system': '시스템',
    'menu.view.language.en': 'English',
    'menu.view.language.ko': '한국어',
    'menu.view.editMode': '편집 모드',
    'menu.view.editMode.wysiwyg': '문서',
    'menu.view.editMode.typora': '라이브',
    'menu.view.editMode.markdown': '소스',
    'menu.view.toggleMemoPanel': '메모 패널 토글',

    // Review
    'menu.review': '검토',
    'menu.review.addMemo': '메모 추가',
    'menu.review.toggleMemoPanel': '메모 패널 표시/숨기기',
    'menu.review.changes': '변경 추적',
    'menu.review.cm.insert': '삽입 표시',
    'menu.review.cm.delete': '삭제 표시',
    'menu.review.cm.substitute': '치환 표시',
    'menu.review.cm.highlight': '강조 표시',
    'menu.review.cm.comment': '주석 표시',
    'menu.review.showMemos': '메모 탭 보이기',
    'menu.review.showChanges': '변경 탭 보이기',
    'menu.review.nextMemo': '다음 메모로 이동',
    'menu.review.prevMemo': '이전 메모로 이동',
    'menu.review.exportIncludeComments': '내보내기에 메모 포함',
    'menu.review.exportPreserveAnnotations': '내보내기에 변경 표시 포함',
    'menu.review.openCitePalette': '본문에 인용 삽입…',
    'menu.review.insertCitationFromDoi': 'DOI로 참고문헌 추가…',
    'menu.review.bulkInsertFromDoi': 'DOI 일괄 가져오기…',
    'menu.review.importReferences': '외부 파일에서 가져오기 (.bib / .ris)…',
    'menu.review.aiCitationSuggest': 'AI 인용 위치 추천…',
    'menu.review.showReferences': '참고문헌 사이드바 열기',
    'menu.review.openAiPalette': 'AI로 선택영역 다듬기…',
    'menu.review.showAi': 'AI 사이드바 열기',

    // References (v0.1.10) — top-level menu
    'menu.references': '참고문헌',

    // AI Assist (v0.1.10) — top-level menu
    'menu.aiAssist': 'AI 작성 도우미',

    // Help
    'menu.help': '도움말',
    'menu.help.about': 'Durumi 정보',
    'menu.help.aboutDetail': '두루미 — 의학 연구를 위한 종이학.',
    'menu.help.shortcuts': '키보드 단축키…',
    'menu.help.checkForUpdates': '업데이트 확인…',
    'menu.help.openGitHub': 'GitHub 열기',
  },
};
