export type Lang = 'en' | 'ko';

/**
 * String tables for the renderer UI.
 *
 * Conventions:
 *  - Keys are dotted paths (`menu.file.new`) so we can group/grep them.
 *  - English is the source-of-truth + ultimate fallback (see `t.ts`).
 *  - Keep entries sorted within each grouping prefix.
 *  - Placeholder syntax is `{name}` (see `t(key, vars)`).
 */
export const dictionaries: Record<Lang, Record<string, string>> = {
  en: {
    // App menu
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
    'menu.file.closeWindow': 'Close Window',
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
    'menu.view': 'View',
    'menu.view.toggleTheme': 'Toggle Theme',
    'menu.view.toggleSourceMode': 'Toggle Source Mode',
    'menu.view.toggleSidebar': 'Toggle Sidebar',
    'menu.view.showFiles': 'Show Files',
    'menu.view.showOutline': 'Show Outline',
    'menu.view.openCustomCss': 'Open Custom CSS…',
    'menu.view.language': 'Language',
    'menu.view.language.system': 'System',
    'menu.view.language.en': 'English',
    'menu.view.language.ko': '한국어',
    'menu.help': 'Help',
    'menu.help.about': 'About Durumi',
    'menu.help.aboutDetail': 'Durumi — a paper crane for medical research.',
    'menu.help.checkForUpdates': 'Check for Updates…',
    'menu.help.openGitHub': 'Open GitHub',

    // Sidebar
    'sidebar.files': 'Files',
    'sidebar.outline': 'Outline',
    'sidebar.empty.files': 'No folders open.',
    'sidebar.empty.outline': 'No headings yet',
    'sidebar.openFolder': 'Open Folder…',

    // Discard / unsaved-changes dialog
    'discard.message': 'Save changes to "{name}"?',
    'discard.detail': "Your changes will be lost if you don't save.",
    'discard.save': 'Save',
    'discard.discard': "Don't Save",
    'discard.cancel': 'Cancel',

    // Image paste (C3)
    'image.noFileAlert': 'Save the document first to use image paste.',

    // Auto-updater (C8)
    'updates.upToDate': 'You are up to date',
    'updates.upToDateDetail': 'Durumi {version} is the latest version.',
    'updates.available': 'Update available',
    'updates.availableDetail': 'Durumi {version} is available. Download now?',
    'updates.downloaded': 'Update ready',
    'updates.downloadedDetail': 'Durumi {version} downloaded. Restart to apply.',
    'updates.devOnly': 'Updates only available in packaged builds',
    'updates.devOnlyDetail': 'Run a packaged build to check for updates.',
    'updates.checkFailed': 'Update check failed',
    'updates.btn.download': 'Download',
    'updates.btn.later': 'Later',
    'updates.btn.restart': 'Restart now',

    // Status bar
    'status.untitled': 'untitled.md',
    'status.charsLine': '{count} chars · UTF-8 · LF',
  },
  ko: {
    // App menu
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
    'menu.file.closeWindow': '창 닫기',
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
    'menu.view': '보기',
    'menu.view.toggleTheme': '테마 전환',
    'menu.view.toggleSourceMode': '소스 모드 전환',
    'menu.view.toggleSidebar': '사이드바 전환',
    'menu.view.showFiles': '파일 보기',
    'menu.view.showOutline': '목차 보기',
    'menu.view.openCustomCss': '사용자 CSS 열기…',
    'menu.view.language': '언어',
    'menu.view.language.system': '시스템',
    'menu.view.language.en': 'English',
    'menu.view.language.ko': '한국어',
    'menu.help': '도움말',
    'menu.help.about': 'Durumi 정보',
    'menu.help.aboutDetail': '두루미 — 의학 연구를 위한 종이학.',
    'menu.help.checkForUpdates': '업데이트 확인…',
    'menu.help.openGitHub': 'GitHub 열기',

    // Sidebar
    'sidebar.files': '파일',
    'sidebar.outline': '목차',
    'sidebar.empty.files': '열린 폴더가 없습니다.',
    'sidebar.empty.outline': '제목 없음',
    'sidebar.openFolder': '폴더 열기…',

    // Discard / unsaved-changes dialog
    'discard.message': '"{name}"의 변경사항을 저장할까요?',
    'discard.detail': '저장하지 않으면 변경사항이 사라집니다.',
    'discard.save': '저장',
    'discard.discard': '저장 안 함',
    'discard.cancel': '취소',

    // Image paste (C3)
    'image.noFileAlert': '이미지 붙여넣기를 사용하려면 먼저 문서를 저장하세요.',

    // Auto-updater (C8)
    'updates.upToDate': '최신 버전입니다',
    'updates.upToDateDetail': 'Durumi {version}이 최신 버전입니다.',
    'updates.available': '업데이트 가능',
    'updates.availableDetail': 'Durumi {version}을 사용할 수 있습니다. 지금 다운로드할까요?',
    'updates.downloaded': '업데이트 준비 완료',
    'updates.downloadedDetail': 'Durumi {version} 다운로드 완료. 적용하려면 다시 시작하세요.',
    'updates.devOnly': '업데이트는 패키지 빌드에서만 사용 가능합니다',
    'updates.devOnlyDetail': '업데이트를 확인하려면 패키지 빌드를 실행하세요.',
    'updates.checkFailed': '업데이트 확인 실패',
    'updates.btn.download': '다운로드',
    'updates.btn.later': '나중에',
    'updates.btn.restart': '지금 다시 시작',

    // Status bar
    'status.untitled': 'untitled.md',
    'status.charsLine': '{count}자 · UTF-8 · LF',
  },
};
