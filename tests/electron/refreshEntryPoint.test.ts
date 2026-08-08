import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AC-WS-058b — 수동 새로고침이 **호출 가능한** 진입점으로 존재한다 (REQ-WS-047a).
 *
 * 시각적 어포던스(버튼 위치·단축키)는 SPEC-2 소유이므로 여기서는 호출
 * 가능성만 본다. IPC 계약과 메뉴 커맨드 라우터 양쪽에 있어야 한다.
 */

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');

describe('IPC 계층', () => {
  it('ipc-contract에 projectRefresh가 선언되어 있다', () => {
    expect(read('shared/ipc-contract.ts')).toMatch(/projectRefresh:\s*\(/);
  });

  it('main이 project:refresh 핸들러를 등록한다', () => {
    expect(read('electron/ipc/project.ts')).toContain("ipcMain.handle('project:refresh'");
  });

  it('preload가 채널을 노출한다', () => {
    expect(read('electron/preload.ts')).toContain("invoke('project:refresh'");
  });

  it('핸들러가 경로를 검증한 뒤 동작한다 (REQ-WS-019)', () => {
    const src = read('electron/ipc/project.ts');
    const handler = src.slice(src.indexOf("ipcMain.handle('project:refresh'"));
    const body = handler.slice(0, handler.indexOf('});'));
    expect(body).toContain('assertAllowedPath');
    expect(body.indexOf('assertAllowedPath')).toBeLessThan(body.indexOf('refreshProjectTree'));
  });
});

describe('메뉴 커맨드 라우터', () => {
  it('MenuCommand에 refreshProjectTree가 있다', () => {
    expect(read('shared/ipc-contract.ts')).toContain("'refreshProjectTree'");
  });

  it('라우터가 그 커맨드를 처리한다', () => {
    const src = read('src/hooks/useMenuCommandRouter.ts');
    expect(src).toContain("cmd === 'refreshProjectTree'");
    expect(src).toContain('projectRefresh');
  });

  it('메뉴가 커맨드를 발신한다', () => {
    expect(read('electron/menu.ts')).toContain("send('refreshProjectTree')");
  });
});

describe('모든 신규 채널이 경로를 검증한다 — REQ-WS-019', () => {
  it('project:* 핸들러 전부가 assertAllowedPath를 호출한다', () => {
    const src = read('electron/ipc/project.ts');
    const handlers = [...src.matchAll(/ipcMain\.handle\('([^']+)'[\s\S]*?\n {2}\}\);/g)];
    expect(handlers.length).toBeGreaterThanOrEqual(5);
    for (const h of handlers) {
      expect(h[0], `${h[1]}가 경로 검증 없이 동작한다`).toContain('assertAllowedPath');
    }
  });
});
