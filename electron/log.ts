import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * main 프로세스 파일 로그.
 *
 * 이전에는 레벨도 파일 sink도 없는 ad-hoc `console.*` 호출만 있었고, 그
 * 결과 `src/i18n/dict.ts`의 "see logs for details" 안내가 가리킬 실제 로그가
 * 존재하지 않았다(패키징된 앱에서 DevTools console은 사용자가 열지 않는다).
 *
 * 설계는 새로 만든 것이 아니라 `electron/assetProtocol.ts`의 파일 append
 * 선례를 일반화한 것이다 — 타임스탬프 + 한 줄, 최선 노력, 실패는 삼킴.
 *
 * 렌더러는 대상이 아니다. 렌더러 로그를 IPC로 모으는 것은 팬아웃과 잡음
 * 제어가 따로 필요해 범위에서 제외했고, 렌더러는 DevTools console을 계속
 * 쓴다(`ErrorBoundary`가 그 경로를 담당).
 */

export type LogLevel = 'info' | 'warn' | 'error';

export const LOG_FILE_NAME = 'durumi.log';
/** 회전 임계치. 넘으면 `durumi.log.1`로 한 번 회전한다(세대는 1개만 유지). */
export const MAX_LOG_BYTES = 1_048_576;

const LEVEL_LABEL: Record<LogLevel, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

function logPath(): string {
  return join(app.getPath('userData'), LOG_FILE_NAME);
}

/**
 * 사용자 홈 경로를 `~`로 치환한다. 로그에는 문서 경로가 자주 들어가는데,
 * 사용자가 이 파일을 이슈에 붙일 때 계정명이 그대로 노출되지 않도록 한다.
 */
export function redactHome(text: string): string {
  let home: string;
  try {
    home = app.getPath('home');
  } catch {
    return text;
  }
  if (!home) return text;
  return text.split(home).join('~');
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err === undefined) return '';
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** 상한을 넘었으면 한 세대 회전한다. 실패는 삼킨다(로깅이 앱을 막지 않는다). */
async function rotateIfNeeded(target: string): Promise<void> {
  try {
    const info = await fs.stat(target);
    if (info.size <= MAX_LOG_BYTES) return;
    await fs.rename(target, `${target}.1`);
  } catch {
    /* 파일이 없거나(첫 기록) stat/rename이 실패하면 그냥 append로 진행한다 */
  }
}

/**
 * 한 줄을 기록한다. 최선 노력 — 어떤 실패도 호출자에게 전파하지 않는다.
 * 호출자는 반환 Promise를 무시해도 된다(기존 console.warn 호출을 그대로 대체).
 */
export async function log(
  level: LogLevel,
  scope: string,
  message: string,
  err?: unknown,
): Promise<void> {
  const detail = messageOf(err);
  const body = detail ? `${message} — ${detail}` : message;
  const redacted = redactHome(body);

  // 콘솔에도 낸다. `pnpm dev` 중에는 터미널이 유일하게 즉시 보이는 출력이고,
  // 파일 sink는 패키징된 앱에서 남는 durable 기록이다. 둘은 대체 관계가
  // 아니라 서로 다른 상황을 커버한다.
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleFn(`[${scope}] ${redacted}`);

  try {
    const target = logPath();
    await rotateIfNeeded(target);
    const line = `${new Date().toISOString()} ${LEVEL_LABEL[level]} [${scope}] ${redacted}\n`;
    await fs.appendFile(target, line);
  } catch {
    /* 파일 로깅은 최선 노력 — 콘솔 출력은 이미 나갔다 */
  }
}

export function logInfo(scope: string, message: string, err?: unknown): Promise<void> {
  return log('info', scope, message, err);
}

export function logWarn(scope: string, message: string, err?: unknown): Promise<void> {
  return log('warn', scope, message, err);
}

export function logError(scope: string, message: string, err?: unknown): Promise<void> {
  return log('error', scope, message, err);
}
