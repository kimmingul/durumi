import type { PreferencesPatch } from './ipc-contract';

/**
 * `Preferences` 값 도메인 검증 — 순수 함수, main/renderer 양쪽에서 쓴다.
 *
 * 경로 필드(`workspaceFolders`/`recentFiles`/`recentFolders`)는 신뢰 경계
 * 방어라 `electron/pathGuard.ts`의 `assertPrefsPatchAllowed`가 담당한다.
 * 이 모듈은 그와 다른 계층 — 숫자 범위와 enum 멤버십, 즉 입력 검증이다.
 * 이전에는 후자가 아예 없어서 렌더러가 보낸 음수·NaN·스키마 밖 문자열이
 * 그대로 `preferences.json`에 기록됐다.
 *
 * 정책:
 * - enum 위반 → 해당 필드를 drop (기존 저장값 유지가 정상 폴백)
 * - 숫자 범위 위반 → clamp (사용자 의도에 가장 가까운 값으로 보정)
 * - 숫자가 아니거나 NaN/Infinity → drop (보정할 의도를 추정할 수 없다)
 *
 * 폭 경계는 여기가 단일 원천이다. 렌더러 스토어
 * (`src/store/{sidebar,rightSidebar,memoPanel}Store.ts`)가 이 상수를
 * import한다 — main과 renderer가 각자 상수를 갖고 어긋나는 것을 막는다.
 */

export const WIDTH_BOUNDS = {
  sidebar: { min: 180, max: 480 },
  rightSidebar: { min: 200, max: 560 },
  memoPanel: { min: 220, max: 560 },
} as const;

export const GHOST_TEXT_BOUNDS = {
  /** 유휴 트리거 지연. 0 = 즉시, 상한은 사실상 '사용 안 함'. */
  idleMs: { min: 0, max: 60_000 },
  /** 세션당 LLM 호출 상한. 비용 방어 장치라 음수는 무의미하다. */
  sessionCap: { min: 0, max: 10_000 },
} as const;

interface NumericBound {
  readonly min: number;
  readonly max: number;
}

/** 최상위 enum 필드. */
const TOP_LEVEL_ENUMS: Readonly<Record<string, readonly string[]>> = {
  theme: ['system', 'light', 'dark'],
  language: ['system', 'en', 'ko'],
};

/** `<top>.<field>` 형태의 중첩 enum 필드. */
const NESTED_ENUMS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  sidebar: { activeTab: ['files', 'outline', 'search', 'comments', 'changes'] },
  rightSidebar: { activeTab: ['references', 'ai'] },
  memoPanel: { groupBy: ['line', 'tag', 'author', 'status'] },
  ai: { provider: ['anthropic', 'openai-compatible'] },
  editor: {
    defaultMode: ['wysiwyg', 'typora', 'markdown'],
    tableStyleFormat: ['pandoc', 'html'],
  },
};

/** `<top>.<field>` 형태의 중첩 숫자 필드와 그 경계. */
const NESTED_NUMBERS: Readonly<Record<string, Readonly<Record<string, NumericBound>>>> = {
  sidebar: { width: WIDTH_BOUNDS.sidebar },
  rightSidebar: { width: WIDTH_BOUNDS.rightSidebar },
  memoPanel: { width: WIDTH_BOUNDS.memoPanel },
  ai: {
    ghostTextIdleMs: GHOST_TEXT_BOUNDS.idleMs,
    ghostTextSessionCap: GHOST_TEXT_BOUNDS.sessionCap,
  },
};

export interface SanitizeResult {
  /** 검증을 통과했거나 보정된 patch. 입력은 변형하지 않는다. */
  patch: PreferencesPatch;
  /** drop 또는 clamp된 필드의 점 표기 경로. 로깅·진단용. */
  rejected: string[];
}

/** 유한한 숫자를 경계 안 정수로 보정한다. 보정이 일어나면 changed=true. */
function clampInt(value: number, bound: NumericBound): { value: number; changed: boolean } {
  const rounded = Math.round(value);
  const clamped = Math.min(bound.max, Math.max(bound.min, rounded));
  return { value: clamped, changed: clamped !== value };
}

/**
 * patch에서 값 도메인을 위반한 필드를 drop하거나 clamp한다.
 * 검증 대상이 아닌 필드는 그대로 통과시킨다.
 */
export function sanitizePreferencesPatch(patch: PreferencesPatch): SanitizeResult {
  const rejected: string[] = [];
  const out: Record<string, unknown> = { ...(patch as Record<string, unknown>) };

  for (const [key, allowed] of Object.entries(TOP_LEVEL_ENUMS)) {
    if (!(key in out)) continue;
    const v = out[key];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !allowed.includes(v)) {
      delete out[key];
      rejected.push(key);
    }
  }

  // 중첩 필드는 해당 하위 객체가 patch에 있을 때만 손댄다. 하위 객체를
  // 복사해서 수정하므로 입력 patch는 그대로 유지된다.
  const nestedKeys = new Set([...Object.keys(NESTED_ENUMS), ...Object.keys(NESTED_NUMBERS)]);
  for (const top of nestedKeys) {
    const sub = out[top];
    if (sub === null || typeof sub !== 'object' || Array.isArray(sub)) continue;
    const copy: Record<string, unknown> = { ...(sub as Record<string, unknown>) };

    for (const [field, allowed] of Object.entries(NESTED_ENUMS[top] ?? {})) {
      if (!(field in copy)) continue;
      const v = copy[field];
      if (v === undefined) continue;
      if (typeof v !== 'string' || !allowed.includes(v)) {
        delete copy[field];
        rejected.push(`${top}.${field}`);
      }
    }

    for (const [field, bound] of Object.entries(NESTED_NUMBERS[top] ?? {})) {
      if (!(field in copy)) continue;
      const v = copy[field];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        delete copy[field];
        rejected.push(`${top}.${field}`);
        continue;
      }
      const { value, changed } = clampInt(v, bound);
      copy[field] = value;
      if (changed) rejected.push(`${top}.${field}`);
    }

    out[top] = copy;
  }

  return { patch: out as PreferencesPatch, rejected };
}
