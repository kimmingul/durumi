import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * v0.2.31 — 툴바 드롭다운(메뉴 버튼) 패턴.
 *
 * 문서모드 툴바가 한 화면에 들어오지 않아서, 저빈도 그룹("삽입" 10개 /
 * "검토" 5개)을 각각 버튼 하나로 접었다. 사라진 액션은 없고, 메뉴 항목의
 * `data-testid` 는 접기 전 버튼과 동일하다.
 *
 * 접근성은 새로 발명하지 않고 코드베이스에 이미 있는 패턴을 합쳤다:
 *   - role="menu" / role="menuitem" + Esc + 바깥 mousedown 닫기
 *     → `sidebar/ContextMenu.tsx`
 *   - 트리거 rect 기준 fixed 배치 + 여는 클릭이 곧바로 닫지 않도록
 *     mousedown 리스너를 한 틱 미루기 → `TableSizePopover.tsx`
 * 여기서 추가한 것은 메뉴 버튼 규약(aria-haspopup/aria-expanded, 트리거로
 * 포커스 복귀, 화살표 키 이동)뿐이다.
 */
export interface ToolbarMenuItem {
  /** 접기 전 버튼과 동일한 data-testid (기존 e2e/자동화 경로 유지). */
  id: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  /** 활성 상태 피드백이 있던 액션은 메뉴 안에서도 그대로 표시한다. */
  active?: boolean;
  onSelect: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export interface ToolbarMenuProps {
  /** 트리거에 보이는 라벨(예: "삽입"). aria-label 로도 쓰인다. */
  label: string;
  /** 트리거 testId. 메뉴 자체는 `${testId}-list`. */
  testId: string;
  items: ToolbarMenuItem[];
  disabled?: boolean;
  /** 열림 상태는 부모가 소유한다 — 동시에 한 메뉴만 열리도록. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 툴바 roving tabindex 참여용. */
  tabIndex: number;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}

export function ToolbarMenu({
  label,
  testId,
  items,
  disabled,
  open,
  onOpenChange,
  tabIndex,
  buttonRef,
}: ToolbarMenuProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  /** 닫으면서 트리거로 포커스를 되돌린다(메뉴 버튼 규약). */
  const closeAndRestoreFocus = useCallback(() => {
    onOpenChange(false);
    triggerRef.current?.focus();
  }, [onOpenChange]);

  // 트리거 바로 아래에 붙이되 뷰포트 밖으로 나가지 않게 클램프.
  useLayoutEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = menuRef.current?.getBoundingClientRect().width ?? 200;
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - width - 4));
    setPos({ top: rect.bottom + 4, left });
  }, [open]);

  // 열리면 첫 활성 항목으로 포커스를 옮겨 키보드만으로도 쓸 수 있게 한다.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]:not(:disabled)',
    );
    first?.focus();
  }, [open]);

  // Esc / 바깥 클릭 / 스크롤 / 창 blur 로 닫기.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeAndRestoreFocus();
    }
    function onDown(e: MouseEvent) {
      const menu = menuRef.current;
      const trigger = triggerRef.current;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menu?.contains(target)) return;
      if (trigger?.contains(target)) return; // 토글은 트리거 onClick 이 처리
      onOpenChange(false);
    }
    function onClose() { onOpenChange(false); }
    // 메뉴를 연 클릭이 곧바로 자신을 닫지 않도록 한 틱 미룬다.
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [open, onOpenChange, closeAndRestoreFocus]);

  /** 메뉴 안에서의 위/아래 이동. 툴바의 좌우 roving 과 섞이지 않게 가둔다. */
  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const menu = menuRef.current;
    if (!menu) return;
    const btns = Array.from(
      menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)'),
    );
    if (btns.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    let next = i;
    if (e.key === 'ArrowDown') next = (i + 1) % btns.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + btns.length) % btns.length;
    else if (e.key === 'Home') next = 0;
    else next = btns.length - 1;
    btns[next]!.focus();
  }

  return (
    <>
      <button
        type="button"
        className={`editor-toolbar-btn editor-toolbar-menu-trigger${open ? ' editor-toolbar-btn-active' : ''}`}
        onClick={() => onOpenChange(!open)}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        data-testid={testId}
        tabIndex={tabIndex}
        ref={(el) => {
          triggerRef.current = el;
          buttonRef?.(el);
        }}
      >
        <span className="editor-toolbar-menu-label">{label}</span>
        <span className="editor-toolbar-menu-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="editor-toolbar-menu"
          role="menu"
          aria-label={label}
          data-testid={`${testId}-list`}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9200 }}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`editor-toolbar-menu-item${item.active ? ' editor-toolbar-menu-item-active' : ''}`}
              disabled={item.disabled}
              aria-disabled={item.disabled || undefined}
              aria-pressed={item.active ? true : undefined}
              data-testid={item.id}
              onClick={(e) => {
                item.onSelect(e);
                onOpenChange(false);
              }}
            >
              <span className="editor-toolbar-menu-item-icon" aria-hidden="true">{item.icon}</span>
              <span className="editor-toolbar-menu-item-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
