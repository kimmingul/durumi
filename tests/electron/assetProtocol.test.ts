import { describe, expect, it, vi } from 'vitest';

/**
 * 이 파일이 지키는 것은 단 하나, `durumi-asset` 스킴의 **권한 등록 계약**이다.
 *
 * 왜 단위 테스트로 고정하는가: `corsEnabled`는 기본값이 false이고, 빠져 있어도
 * 이미지 위젯(`<img src="durumi-asset://...">`)은 멀쩡히 동작한다. 교차 출처
 * 이미지 표시는 CORS 없이 허용되기 때문이다. 깨지는 것은 렌더러의 `fetch()`
 * 하나뿐이고, 그 fetch의 유일한 프로덕션 소비자인
 * `src/export/inlineImages.ts`의 기본 fetcher는 실패를 `{ ok: false }`로
 * 삼켜 경고만 남긴다. 그래서 이 플래그가 빠지면 "HTML 이미지 인라인"이
 * 조용히 무력화되고, 아무 테스트도 빨개지지 않은 채 릴리스가 나간다.
 * 실제로 그렇게 나갔다.
 *
 * e2e(`e2e/pending-assets-migration.spec.ts`의 fetch 200 단언,
 * `e2e/round-trip.spec.ts`의 data: URI 단언)가 최종 그물이지만, 그건 Electron을
 * 띄워야 돌아간다. 여기서 플래그 자체를 고정해 두면 누가 "안 쓰는 권한 같은데"
 * 하고 지우는 순간 `pnpm test`에서 바로 잡힌다.
 */

const registerSchemesAsPrivileged = vi.fn();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/durumi-test-userdata' },
  protocol: {
    registerSchemesAsPrivileged: (...args: unknown[]) =>
      registerSchemesAsPrivileged(...args),
    handle: vi.fn(),
  },
}));

describe('registerAssetProtocolSchemes', () => {
  it('registers durumi-asset with corsEnabled so renderer fetch() works', async () => {
    registerSchemesAsPrivileged.mockClear();
    const { registerAssetProtocolSchemes } = await import('../../electron/assetProtocol');

    registerAssetProtocolSchemes();

    expect(registerSchemesAsPrivileged).toHaveBeenCalledTimes(1);
    const schemes = registerSchemesAsPrivileged.mock.calls[0]![0] as Array<{
      scheme: string;
      privileges: Record<string, boolean>;
    }>;
    const asset = schemes.find((s) => s.scheme === 'durumi-asset');
    expect(asset).toBeDefined();

    // 이 플래그가 없으면 Chromium이 렌더러의 fetch를 아예 막는다
    // (TypeError: Failed to fetch). 이미지 인라인 내보내기의 전제 조건.
    expect(asset!.privileges.corsEnabled).toBe(true);

    // 같이 걸려 있어야 fetch가 스킴에 도달한다. 둘은 한 쌍이다 —
    // supportFetchAPI만 켜고 corsEnabled를 빼면 교차 출처에서 막힌다.
    expect(asset!.privileges.supportFetchAPI).toBe(true);

    // 경로 가드가 유일한 신뢰 경계라는 전제를 함께 고정한다. standard가
    // 꺼지면 URL 파서가 달라져 `?p=` 왕복 자체가 깨진다.
    expect(asset!.privileges.standard).toBe(true);
    expect(asset!.privileges.secure).toBe(true);
  });
});
