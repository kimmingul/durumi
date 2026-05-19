# Document Mode — 기본원칙 (Foundational Principles)

> **문서의 위치**: 본 문서는 Durumi의 **문서모드(Document Mode)** 구현·확장 시 지켜야 할 **엔지니어링 원칙**을 정의한다. 사용자 가이드는 [editor-modes.md](editor-modes.md)에 있으며, 본 문서는 개발자·리뷰어가 PR 작성 / 리뷰 시 참조하는 **invariant 명세**다.
>
> 이 원칙들은 v0.2.19/.20/.21/.23의 4-cycle false-green 경험과 v0.2.23 atomic Image/Link 작업의 교훈을 정리하여 도출되었다.

---

## 0. 우선순위 (Override Order)

원칙끼리 충돌하는 상황에서는 아래 번호 **낮은 쪽이 우선**한다.

```
1. Source integrity (소스 무결성)
2. IME safety (IME 안전)
3. Code-island sovereignty (코드 섬 주권)
4. Rendered-intent, source-backed editing (렌더링 의도 · 소스 구현)
5. Explicit scope per command (명시적 스코프)
6. Boundary atomicity (경계 원자성)
```

PR에서 어떤 원칙을 양보해야 할 때는 본 문서를 갱신해 예외를 **명시적으로** 등록하라. "그냥 안 되니까" 양보는 금지.

---

## 1. Source Integrity — 소스 무결성

**원칙**: 문서모드는 렌더링을 달리할 수 있으나 markdown 소스의 **의미를 묵시적으로 변경하지 않는다**. Source ↔ Document round-trip에서 의도되지 않은 byte 변동은 버그다.

### 범위
- 모드 전환(Document ↔ Live ↔ Source), 저장-재오픈, export 후 재import 모두에서 의도되지 않은 정규화·재배열·공백 변경·인용부호 치환 금지.
- "정규화"가 필요한 경우(예: 줄 끝 공백 두 개 → `↵` 시각화)는 **렌더링 차원**에서만 수행하고, 디스크에 쓰이는 byte는 사용자가 입력한 그대로 유지.

### 검증
- **Unit**: 입력 markdown → 어떤 명령 dispatch → output markdown 의 byte snapshot.
- **Real-UI**: 임의의 markdown 파일을 열고 → Document에서 편집 없이 모드 토글 × 3 → 저장 → byte-level diff 0.

### Anti-pattern
- "사용자에게는 안 보이니까" lezer가 재serialize한 결과를 그대로 디스크에 쓰는 것.
- 인용부호/대시를 "보기 좋게" smartypants 변환해서 저장하는 것.

---

## 2. IME Safety — IME 안전

**원칙**: 한국어/일본어/중국어 IME composition을 깰 위험이 있는 렌더링 추상화는 사용하지 않는다. 필요 시 active-line의 source 노출 또는 검증된 전용 편집 표면(예: table cell `contentEditable`)을 사용한다.

### 범위
- `Decoration.replace`로 content widget을 active line에 거는 것은 **사전 검증된 케이스에 한정** ([editor-modes.md](editor-modes.md) §"IME 안전성" 참조 — v0.1.12부터 inline 마커 hider는 안전, content widget은 case-by-case).
- 새 widget을 도입할 때는 widget 영역에 caret을 둔 상태에서 **실제 IME 한글 합성**이 깨지지 않는지 Electron real-UI에서 확인.

### 검증
- **Unit**: 필수지만 **불충분**. composition-like transaction 시뮬레이션만으로는 OS-level IME 동작을 재현하지 못함.
- **Real-UI**: Electron 위에서 실제 한국어 입력을 active line / table cell / link label / memo body / math / alert 각각에서 수행하여 합성 corruption 없음을 확인.

### Anti-pattern
- "Playwright fixture에서 `page.keyboard.insertText('가')`가 통과했으니 IME 안전하다"고 결론짓는 것 — fixture는 IME composition을 우회한다.

---

## 3. Code-Island Sovereignty — 코드 섬 주권

**원칙**: 다음 영역의 **내부**는 일반 markdown toolbar / inline mark 규칙을 상속하지 않는다.

- Fenced code block (` ``` `)
- Inline code (`` ` ``)
- Math block (`$$…$$`) / inline math (`$…$`) — 내부는 LaTeX 소스
- Mermaid block (` ```mermaid `)
- 리터럴 HTML block / inline HTML pair (`<sub>` `<sup>` `<u>` `<mark>` `<kbd>`)
- Front matter (`---` … `---`)

### 동작 규약
- 코드 섬 내부에 caret이 있을 때 inline-mark toolbar 버튼(Bold / Italic / Strike 등)은 **disabled** 또는 **no-op**.
- 코드 섬 자체를 토글하는 명령(예: "Code block" 스타일 변환)은 island-aware 전용 핸들러로 분리.
- 코드 섬 내부의 `*`, `_`, `[` 등은 markdown 마커가 아니라 콘텐츠. 자동 escape · auto-pair 등 어떤 markdown 정규화도 적용 금지.

### 검증
- **Unit**: 코드 섬 내부에서 inline-mark 명령 dispatch 시 source 변동 0.
- **Real-UI**: caret을 fence 내부에 두고 toolbar의 Bold 버튼 클릭 → 버튼이 disabled 또는 시각적 변화 없음.

---

## 4. Rendered-Intent, Source-Backed Editing — 렌더링 의도 · 소스 구현

**원칙**: 문서모드 명령은 **렌더링된 객체와 보이는 텍스트 스팬**을 대상으로 표현되며, 내부적으로는 **최소·가역적 markdown 소스 편집**으로 컴파일된다.

### 의미
- 사용자는 "본 것"을 조작한다. 구현은 그 조작을 markdown source 변경으로 환원한다.
- 모든 toolbar/단축키 명령은 **source change**로 표현 가능해야 한다 (= Source 모드에서 동일 결과 재현 가능).
- 어떤 명령도 "오직 문서모드에서만 의미가 있는" 비-source 상태를 만들지 않는다. 문서모드는 1급 시민이지만 source가 진실의 단일 출처.

### 범위
- 모든 [src/editor/keymap/*.ts](src/editor/keymap/) 명령, toolbar 액션, 마우스 클릭/드래그, paste, drag-drop, IME 합성 결과 모두 markdown source의 최소 dispatch로 귀결.

### 검증
- **Unit**: 각 명령마다 before/after source 정확성 (byte 비교).
- **Real-UI**: production UI에서 toolbar click, `page.keyboard.press`, 마우스 selection을 통해 검증. **CodeMirror transaction 직접 dispatch는 keymap precedence를 우회하므로 단독으로는 불충분**.

### Anti-pattern
- 렌더링 widget의 DOM state를 source와 별개로 들고 있다가 디스크 쓰기 시점에 reconcile하는 것 (race / undo / 모드 전환에서 깨짐).

---

## 5. Explicit Scope per Command — 명시적 스코프

**원칙**: 모든 toolbar/단축키 명령은 자신의 의미적 스코프를 **선언**한다. 스코프는 다음 5개 중 하나 이상:

| 스코프 | 정의 | 예 |
|---|---|---|
| `document-metadata` | 문서 전체에 적용되는 설정 | YAML frontmatter, `[toc]`, footnote 정의, BibTeX 경로, document style preset |
| `block-line` | 한 줄 또는 한 문단의 구조 변환 | `#` heading, `>` blockquote, list marker, `---` HR, GitHub alert, code fence |
| `inline-span` | 선택 영역 또는 caret 위치의 인라인 토글 | `**bold**`, `*italic*`, `~~strike~~`, `==hl==`, `` `code` ``, `<sub>` `<sup>` `<u>` |
| `code-island` | 코드 섬 자체의 생성·해제·내부 편집 | code fence, math block, Mermaid, inline HTML pair, frontmatter |
| `cross-reference pair` | inline anchor + 별도 정의의 짝 단위 명령 | footnote (`[^id]` + `[^id]: …`), reference link (`[t][id]` + `[id]: url`), citation (`[@key]` + bibliography) |

### 규약
- Mixed-scope 명령은 **예외가 아니라 일급 시민**. 두 스코프 이상에 영향이면 `scopes: ['inline-span', 'document-metadata']` 식으로 모두 선언.
- Toolbar 버튼의 **active/disabled 상태**는 현재 caret이 어느 스코프에 있는지에 따라 결정된다. caret이 code-island 내부면 inline-span 버튼은 disabled.

### 검증
- **Unit**: caret 위치 → parser state → scope 분류 함수가 모든 마크다운 구문에 대해 정확.
- **Real-UI**: caret을 table cell / Setext heading / alert / frontmatter / fence / footnote 각각에 두고 toolbar 버튼들의 active·disabled 상태가 의도대로.

### 경계 케이스 — 기록된 분류
| 마크다운 요소 | 스코프 | 비고 |
|---|---|---|
| 이미지 `![](…)` | `inline-span` (기본) | 단독 문단이면 시각적으로 block처럼 보여도 syntax는 inline |
| 각주 `[^id]` + `[^id]: …` | `cross-reference pair` | inline ref + doc-level def 함께 다룸 |
| 참조링크 `[t][id]` + `[id]: url` | `cross-reference pair` | |
| `%% memo %%` | `inline-span` (단, sidebar 라우팅 포함) | 메모 시스템 단독 spec ([shared/comments.ts](shared/comments.ts)) |
| CriticMarkup `{++…++}` 등 | `inline-span` | export pre-processor와 연동 |
| Setext heading `===` `---` | `block-line` (2-line 소유) | 의미적 1개 heading이 두 줄에 걸침 — heading.ts가 두 줄을 함께 소유 |
| GitHub alert `> [!NOTE]` | `block-line` | top-level blockquote 한정 |
| 테이블 | `block-line` (구조) + cell마다 `inline-span` | row/col 연산은 전용 핸들러 |
| 리스트 | `block-line` + indent-level 구조 | nested / 번호 연속성은 [listToggle.ts](src/editor/keymap/listToggle.ts) |
| 수식 `$x$` vs `$$x$$` | `code-island` | inline · block 둘 다 island |

---

## 6. Boundary Atomicity — 경계 원자성

**원칙**: 위젯·인라인 스팬·메모·링크·참조·구조적 셀은 **enter / edit / delete 동작이 명시적으로 정의**되어야 한다. 스팬 내부 편집은 안에 머무르고, 외부 편집은 스팬을 잠식·분할·손상시키지 않는다. 단, **unwrap / delete를 명시적으로 의도한 명령**(예: Bold 버튼 재클릭으로 unwrap, 전체 선택 후 Backspace)은 예외.

### 구현 패턴 (v0.2.23 확립)
- `EditorView.atomicRanges` — cursor motion, mouse placement, selection extension에서 위젯/스팬을 단위로 취급.
- `Prec.high` keymap — Backspace/Delete가 caret 위치(시작/끝, 라벨 가장자리, hidden suffix의 closeBracket 자리 포함)에서 entire node를 한 dispatch로 삭제. `Prec.high`가 아니면 `@codemirror/commands`의 `deleteCharBackward`가 먼저 먹어서 atomic ranges를 우회한다.

### 적용 대상 (확장 로드맵)
- ✅ Image, inline Link ([atomicMedia.ts](src/editor/atomicMedia.ts), v0.2.23)
- ⬜ Inline marks: `**` `*` `~~` `~` `^` `==` `` ` ``
- ⬜ CriticMarkup 5종 (`{++…++}`, `{--…--}`, `{~~…~>…~~}`, `{==…==}`, `{>>…<<}`)
- ⬜ Memo `%%…%%`
- ⬜ Footnote ref `[^id]`
- ⬜ Inline HTML pairs (`<sub>` `<u>` 등)
- ⬜ Citation `[@key]`
- 코드 섬은 §3 별도 정책 (atomic 단위는 동일하나 내부 편집 규약이 다름).

### 검증
- **Unit**: atomic ranges 등록 + Prec.high keymap이 caret 시작·끝·label 가장자리·hidden suffix 각 위치에서 entire node 삭제.
- **Real-UI**: `page.keyboard.press('Backspace')` 와 `page.keyboard.press('Delete')` 로 **모든 경계 위치**에서 검증. transaction 직접 dispatch는 금지 (v0.2.19/.20/.21/.23이 모두 이 함정에 빠짐).

---

## 7. The Buried Problem — 양방향 Source Map Contract

이 6원칙을 모든 widget · 모든 inline mark에 일관되게 적용하려면, 렌더링 UI 표면과 markdown range 사이의 **공통 양방향 매핑 contract**가 필요하다. 현재는 매번 국지적·비일관적으로 해결되고 있다:

- Link: [link.ts](src/editor/decorations/link.ts) + [atomicMedia.ts](src/editor/atomicMedia.ts) — 라벨/숨김 syntax 분리
- Table: [tableEdit.ts::replaceCellText](src/editor/markdownExt/tableEdit.ts) — DOM cell ↔ markdown recompile
- Setext heading: [heading.ts](src/editor/decorations/heading.ts) — 두 줄 한 의미
- Footnote / 참조링크 — inline anchor와 별도 정의의 연결

**제안**: 다음과 같은 공통 타입을 도입하고 모든 새 widget이 이 contract를 구현하도록 강제한다.

```ts
// src/editor/renderedSpan.ts (proposed)
export interface RenderedSpan {
  readonly id: string;
  readonly scope: 'document-metadata' | 'block-line' | 'inline-span' | 'code-island' | 'cross-reference-pair';
  readonly sourceFrom: number;      // primary source range
  readonly sourceTo: number;
  readonly companionRanges?: {      // cross-reference pair인 경우 def 위치 등
    from: number; to: number; role: string;
  }[];
  readonly enterPolicy: 'atomic' | 'label-editable' | 'transparent' | 'sovereign';
  readonly deletePolicy: 'delete-whole-node' | 'delete-marker-only' | 'unwrap' | 'custom';
  readonly imeSafe: boolean;        // active line에 둘 수 있는가?
}
```

이 contract가 없으면 새 widget마다 cursor placement / deletion / selection / undo / paste / toolbar state / IME handling을 재발명하게 되고, false-green 사이클이 반복된다. v0.3.x 초기 마일스톤으로 분리하여 진행 권고.

---

## 8. PR Checklist (의무)

문서모드에 영향 주는 PR은 description에 아래 항목을 채운다. 본 체크리스트는 [.github/PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md)에 통합되어 있어 PR 생성 시 자동 prefill된다.

```markdown
### Document Mode Principles
- [ ] (1) Source integrity: round-trip byte-level diff 0 확인
- [ ] (2) IME safety: 한국어 합성 real-UI 검증 (해당 시)
- [ ] (3) Code-island sovereignty: 코드 섬 내부 영향 0 확인 (해당 시)
- [ ] (4) Rendered-intent: 모든 명령 source change로 환원 가능
- [ ] (5) Explicit scope: 추가/수정된 명령의 scope 선언
- [ ] (6) Boundary atomicity: real-UI `page.keyboard.press` 로 모든 경계 검증
```

해당 없는 항목은 `[~]` 처리하고 한 줄 이유를 적는다. **체크 누락 = merge 차단** 사유.

---

## 9. 변경 이력

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-05-19 | v1 | 초안 — v0.2.19/.20/.21/.23 4-cycle 회고 + v0.2.23 atomic media 작업 기반 6원칙 + source-map contract 제안 |
