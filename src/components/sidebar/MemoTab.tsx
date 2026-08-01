import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import type { Comment } from '@shared/comments';
import { memoIdFor, type MemoMeta } from '@shared/memoSidecar';
import type { MemoGroupBy } from '@shared/ipc-contract';
import { useDocComments } from '../../hooks/useDocComments';
import { useMemoPanelStore } from '../../store/memoPanelStore';
import { useMemoSidecarStore } from '../../store/memoSidecarStore';
import { MemoCard } from '../MemoCard';
import { t, useLanguage } from '../../i18n/t';

interface MemoTabProps {
  view: EditorView | null;
  content: string;
}

interface MemoGroup {
  key: string;
  label: string;
  memos: Comment[];
}

/**
 * 메모 탭. 문서의 `%% memo %%` 하나당 카드 하나를 보여준다.
 *
 * v0.2.30 이전에는 에디터와 오른쪽 사이드바 사이에 독립 패널(`MemoPanel`)로
 * 떠 있었고, 자체 폭 스토어와 "메모가 1개 이상이면 자동 노출" 규칙을 가지고
 * 있었다. 지금은 오른쪽 사이드바의 한 탭이므로 폭은 사이드바가 소유하고,
 * 자동 노출 대신 탭의 개수 배지로 새 메모를 알린다.
 *
 * 렌더링 모드(그룹 기준 드롭다운):
 *  - "line"(기본): `view.coordsAtPos(memo.from)` 으로 소스 줄에 맞춰 카드를
 *    절대 위치로 배치한다.
 *  - "tag" / "author" / "status": 섹션 구분선 아래로 자연스러운 flex 흐름에
 *    쌓는다. 임의 재정렬에서는 줄 정렬을 유지할 수 없으므로 버린다.
 */
export function MemoTab({ view, content }: MemoTabProps) {
  useLanguage();
  const memos = useDocComments(content);
  const focusedFrom = useMemoPanelStore((s) => s.focusedFrom);
  const setFocusedFrom = useMemoPanelStore((s) => s.setFocusedFrom);
  const sidecar = useMemoSidecarStore((s) => s.sidecar);

  // prefs(`prefs.memoPanel`)로 오가는 탭 로컬 UI 상태.
  const [groupBy, setGroupBy] = useState<MemoGroupBy>('line');
  const [hideResolved, setHideResolved] = useState(true);

  // 에디터가 스크롤되거나 선택이 바뀌면 카드 위치가 따라가도록 강제 리렌더한다.
  // 레이아웃 상태를 저장하지 않고 매 렌더마다 `view.coordsAtPos`로 다시 계산한다.
  const [, setLayoutTick] = useState(0);
  const stackRef = useRef<HTMLDivElement | null>(null);

  // 마운트 시 한 번 prefs에서 groupBy + hideResolved 초기값을 읽어온다.
  useEffect(() => {
    let cancelled = false;
    void window.api.prefsGet().then((prefs) => {
      if (cancelled) return;
      if (prefs.memoPanel?.groupBy) setGroupBy(prefs.memoPanel.groupBy);
      if (typeof prefs.memoPanel?.hideResolvedDefault === 'boolean') {
        setHideResolved(prefs.memoPanel.hideResolvedDefault);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // `coordsAtPos` 결과를 바꿀 수 있는 모든 이벤트(스크롤/리사이즈/선택 변경)에
  // 맞춰 카드 위치를 다시 계산한다.
  useEffect(() => {
    if (!view) return;
    const recompute = () => setLayoutTick((n) => n + 1);
    const scroller = view.scrollDOM;
    scroller.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);
    // CodeMirror는 레이아웃 후 `geometry` 측정 이벤트를 보내지만, 안전망으로
    // 단순 인터벌을 함께 건다(탭이 떠 있는 동안에만 도므로 비용이 작다).
    const id = window.setInterval(recompute, 250);
    return () => {
      scroller.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
      window.clearInterval(id);
    };
  }, [view]);

  // groupBy / hideResolved 저장 — 인라인 디바운스.
  // 폭은 더 이상 이 탭이 소유하지 않으므로 패치에서 뺀다(오른쪽 사이드바 소유).
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void window.api.prefsSet({
        memoPanel: { hideResolvedDefault: hideResolved, groupBy },
      });
    }, 500);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [hideResolved, groupBy]);

  // 해결됨 숨김 필터는 두 렌더 경로가 공유하도록 한 번만 적용한다.
  const visibleMemos = useMemo(() => {
    if (!hideResolved) return memos;
    return memos.filter((m) => !sidecar.memos[memoIdFor(m)]?.resolved);
  }, [memos, hideResolved, sidecar]);

  // line 이외 모드의 그룹 목록. 읽기 순서를 안정적으로 유지하려고 그룹 내부는
  // 줄 번호로 정렬한다.
  const groups: MemoGroup[] = useMemo(() => {
    if (groupBy === 'line' || visibleMemos.length === 0) return [];
    return groupMemos(visibleMemos, groupBy, sidecar.memos);
  }, [groupBy, visibleMemos, sidecar]);

  // "line" 모드에서 각 카드의 세로 위치를 계산한다. 카드는 세로로 쌓이며,
  // 두 메모가 겹치는 슬롯으로 계산되면 뒤쪽 카드를 앞 카드 높이만큼 밀어낸다
  // (첫 페인트에서 mount-후-측정을 피하려고 보수적인 64px 최소값을 쓴다).
  const MIN_CARD_GAP = 8;
  const MIN_CARD_HEIGHT = 64;
  const stackTopOffset = stackRef.current?.getBoundingClientRect().top ?? 0;
  let prevBottom = -Infinity;
  const positions = visibleMemos.map((memo) => {
    let top = 0;
    if (view) {
      const coords = view.coordsAtPos(memo.from);
      if (coords) {
        top = Math.max(0, Math.round(coords.top - stackTopOffset));
      }
    }
    if (top < prevBottom + MIN_CARD_GAP) top = prevBottom + MIN_CARD_GAP;
    prevBottom = top + MIN_CARD_HEIGHT;
    return top;
  });

  return (
    <div className="cm-memo-tab" data-testid="memo-tab">
      <div className="cm-memo-panel-controls">
        <label className="cm-memo-panel-groupby">
          <span className="cm-memo-panel-groupby-label">
            {t('memo.panel.groupBy.label')}
          </span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as MemoGroupBy)}
            data-testid="memo-panel-groupby"
          >
            <option value="line">{t('memo.panel.groupBy.line')}</option>
            <option value="tag">{t('memo.panel.groupBy.tag')}</option>
            <option value="author">{t('memo.panel.groupBy.author')}</option>
            <option value="status">{t('memo.panel.groupBy.status')}</option>
          </select>
        </label>
        <label className="cm-memo-panel-hideresolved">
          <input
            type="checkbox"
            checked={hideResolved}
            onChange={(e) => setHideResolved(e.target.checked)}
            data-testid="memo-panel-hide-resolved"
          />
          <span>{t('memo.panel.hideResolved')}</span>
        </label>
      </div>
      <div className="cm-memo-panel-body" ref={stackRef}>
        {visibleMemos.length === 0 ? (
          <div className="cm-memo-panel-empty">{t('memo.panel.empty')}</div>
        ) : groupBy === 'line' ? (
          visibleMemos.map((memo, idx) => (
            <MemoCard
              key={`${memo.from}-${memo.to}`}
              memo={memo}
              view={view}
              topPx={positions[idx] ?? null}
              focused={focusedFrom === memo.from}
              onFocusHandled={() => setFocusedFrom(null)}
            />
          ))
        ) : (
          groups.map((group) => (
            <section
              key={group.key}
              className="cm-memo-panel-group"
              data-testid={`memo-panel-group-${group.key}`}
            >
              <header className="cm-memo-panel-group-header">
                <span className="cm-memo-panel-group-label">{group.label}</span>
                <span className="cm-memo-panel-group-count">{group.memos.length}</span>
              </header>
              <div className="cm-memo-panel-group-cards">
                {group.memos.map((memo) => (
                  <MemoCard
                    key={`${memo.from}-${memo.to}`}
                    memo={memo}
                    view={view}
                    topPx={null}
                    focused={focusedFrom === memo.from}
                    onFocusHandled={() => setFocusedFrom(null)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * `groupBy ∈ {tag, author, status}` 의 그룹 목록을 만든다. 그룹 내부는 줄
 * 번호로 정렬해 읽기 순서를 안정시키고, 그룹 자체는 라벨로 정렬해 타이핑할
 * 때마다 순서가 흔들리지 않게 한다.
 */
function groupMemos(
  memos: readonly Comment[],
  groupBy: MemoGroupBy,
  metas: Record<string, MemoMeta>,
): MemoGroup[] {
  const buckets = new Map<string, Comment[]>();

  function keyFor(memo: Comment): { key: string; label: string } {
    const meta = metas[memoIdFor(memo)];
    if (groupBy === 'tag') {
      const tag = memo.tag;
      return tag
        ? { key: `tag:${tag}`, label: `@${tag}` }
        : { key: 'tag:__none__', label: t('memo.panel.group.untagged') };
    }
    if (groupBy === 'author') {
      const author = meta?.createdBy ?? '';
      const safe = author.length > 0 ? author : t('memo.panel.group.unknownAuthor');
      return { key: `author:${safe}`, label: safe };
    }
    // status
    const resolved = meta?.resolved ?? false;
    return resolved
      ? { key: 'status:resolved', label: t('memo.panel.group.statusResolved') }
      : { key: 'status:open', label: t('memo.panel.group.statusOpen') };
  }

  const labels = new Map<string, string>();
  for (const memo of memos) {
    const { key, label } = keyFor(memo);
    labels.set(key, label);
    const arr = buckets.get(key) ?? [];
    arr.push(memo);
    buckets.set(key, arr);
  }
  const out: MemoGroup[] = [];
  for (const [key, list] of buckets.entries()) {
    list.sort((a, b) => a.line - b.line);
    out.push({ key, label: labels.get(key) ?? key, memos: list });
  }
  // status 그룹은 열림 우선 고정 순서, 나머지는 라벨 정렬로 결정론을 유지한다.
  if (groupBy === 'status') {
    out.sort((a, b) => (a.key === 'status:open' ? -1 : b.key === 'status:open' ? 1 : 0));
  } else {
    out.sort((a, b) => a.label.localeCompare(b.label));
  }
  return out;
}
