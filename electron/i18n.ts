import { app } from 'electron';
import type { Preferences } from '@shared/ipc-contract';
import { menuLabels } from '@shared/menuLabels';

export type Lang = 'en' | 'ko';

/**
 * Strings used by the Electron main process. Two groups:
 *
 *   - `menu.*` — sourced from `@shared/menuLabels`, the single dictionary
 *     shared with the renderer. Before v0.1.12 these lived in two copies
 *     that drifted on every menu restructure (the v0.1.10 References /
 *     AI Assist menus shipped with the renderer copy updated but the
 *     main-process copy missing, so the native menu showed raw i18n keys).
 *
 *   - Main-process-only: context menu (right-click on the editor surface),
 *     the discard / unsaved-changes dialog raised from the main process,
 *     and the auto-updater notifications.
 *
 * Pure-data module — no React, no DOM. Safe to bundle into main.
 */
const dict: Record<Lang, Record<string, string>> = {
  en: {
    ...menuLabels.en,

    // Editor right-click context menu
    'context.cut': 'Cut',
    'context.copy': 'Copy',
    'context.paste': 'Paste',
    'context.addMemo': 'Add memo',
    'context.changes': 'Track changes',
    'context.cm.insert': 'Mark as insertion',
    'context.cm.delete': 'Mark as deletion',
    'context.cm.substitute': 'Mark as substitution',
    'context.cm.highlight': 'Mark as highlight',
    'context.cm.comment': 'Add reviewer comment',
    'context.insertLink': 'Insert link',
    'context.addToDictionary': 'Add to Dictionary',

    // Discard / unsaved-changes dialog (raised from main process)
    'discard.message': 'Save changes to "{name}"?',
    'discard.detail': "Your changes will be lost if you don't save.",
    'discard.save': 'Save',
    'discard.discard': "Don't Save",
    'discard.cancel': 'Cancel',

    // Auto-updater
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
  },
  ko: {
    ...menuLabels.ko,

    'context.cut': '잘라내기',
    'context.copy': '복사',
    'context.paste': '붙여넣기',
    'context.addMemo': '메모 추가',
    'context.changes': '변경 추적',
    'context.cm.insert': '삽입으로 표시',
    'context.cm.delete': '삭제로 표시',
    'context.cm.substitute': '치환으로 표시',
    'context.cm.highlight': '강조로 표시',
    'context.cm.comment': '주석 추가',
    'context.insertLink': '링크 삽입',
    'context.addToDictionary': '사전에 추가',

    'discard.message': '"{name}"의 변경사항을 저장할까요?',
    'discard.detail': '저장하지 않으면 변경사항이 사라집니다.',
    'discard.save': '저장',
    'discard.discard': '저장 안 함',
    'discard.cancel': '취소',

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
  },
};

/**
 * Resolve the user's `language` preference to a concrete UI language.
 * `'system'` consults `app.getLocale()` — anything starting with `ko`
 * gets Korean, everything else gets English.
 */
export function resolveLang(pref: Preferences['language']): Lang {
  if (pref === 'en' || pref === 'ko') return pref;
  return app.getLocale().toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function t(key: string, lang: Lang, vars?: Record<string, string>): string {
  const raw = dict[lang][key] ?? dict.en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`);
}
