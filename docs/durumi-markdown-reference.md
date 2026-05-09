# Durumi 마크다운 레퍼런스

이 문서는 두루미(Durumi) 에디터가 인식하는 마크다운 문법을 한곳에 모은
정식 레퍼런스입니다. 기준선은 [Typora 1.13 Markdown
Reference](https://support.typora.io/Markdown-Reference/)이며, 해당 문법과
동일하게 동작하는 부분은 그대로 따르고, 차이가 발생하는 부분은 두루미의
실제 동작을 우선해 기술합니다. 의학연구 매뉴스크립트 작성에 필요한
인용·서지·매크로 같은 두루미 고유 기능도 함께 다룹니다.

본 문서를 읽기 전에 알아두면 좋은 약속:

- "라이브 프리뷰"는 두루미 에디터에서 캐럿이 해당 줄을 떠난 직후 보이는
  렌더 결과를 뜻합니다. 캐럿이 해당 줄 안에 있을 때는 항상 원본 마크다운
  소스가 그대로 보입니다(편집 편의성을 위한 설계).
- "내보내기"는 `파일 → 내보내기` 메뉴(HTML / PDF / DOCX / LaTeX) 중
  하나로 출력했을 때의 결과를 뜻합니다. HTML과 PDF는 두루미 내부 파이프라인이,
  DOCX와 LaTeX는 외부 Pandoc 바이너리가 처리합니다.
- 라이브 프리뷰와 내보내기는 다른 파서를 사용합니다(에디터: lezer-markdown +
  GFM 확장, 내보내기: markdown-it). 99% 이상의 문법은 동일하게 처리되지만
  드물게 차이가 있을 수 있어, 본 문서는 항목마다 두 경로의 동작을 같이
  기록합니다.
- 버그나 누락은 GitHub 이슈로 알려 주세요.

---

## 1. 머리말

두루미는 Electron + React + CodeMirror 6 기반의 마크다운 에디터로,
Typora의 입력 경험을 기준선으로 삼되 의학연구 매뉴스크립트 작성에 특화된
도구(BibTeX 인용, 매뉴스크립트 템플릿, 통계 매크로, Pandoc 기반 .docx 변환)를
함께 갖추는 것을 목표로 합니다.

본 문서는 다음 두 가지 역할을 합니다.

1. Typora 1.13 사용자가 두루미로 옮길 때 무엇이 같고 무엇이 다른지 알 수
   있게 하는 매핑 표.
2. 두루미가 단독으로 처리하는 의학연구 전용 문법(예: `[@key]` Pandoc 인용)의
   공식 명세.

서로 충돌하는 기록이 있다면 두루미의 실제 구현을 우선합니다.

---

## 2. 블록 요소

### 2.1 헤딩

ATX 스타일(`#` 1~6개)과 Setext 스타일(`===`/`---`) 모두 지원합니다.

```markdown
# H1
## H2
### H3
#### H4
##### H5
###### H6

H1 (Setext)
===========

H2 (Setext)
-----------
```

- 라이브 프리뷰: ATX의 `#` 마커는 캐럿이 다른 줄로 옮겨가면 시각적으로
  숨겨지고 헤딩의 글꼴 크기/굵기만 남습니다. Setext 두 줄은 단일 헤딩으로
  렌더되며, 마커 줄(`===` / `---`)도 동일하게 캐럿이 떠나면 숨겨집니다.
- 내보내기: 모두 `<h1>` … `<h6>`. 헤딩 텍스트는 자동으로 슬러그 ID가
  부여되어 `[toc]`와 내부 링크 앵커로 사용할 수 있습니다.
- ATX 닫는 `#` 시퀀스(예: `## 헤딩 ##`)는 합법이지만 두루미는 권장하지
  않습니다. 시각적 차이가 없고 검색·치환을 어렵게 합니다.

> 주의: YAML 프런트매터의 닫는 `---`가 직전 줄을 Setext H2로 잘못
> 끌어올리는 lezer 기본 동작은 두루미가 자체 `FrontMatter` 노드로
> 차단합니다. 즉 `---`로 끝나는 YAML 블록 직후의 헤딩 인식은 안전합니다.

### 2.2 단락

빈 줄로 구분된 텍스트 블록이 단락입니다. 한 단락 안에서의 줄바꿈은 모두
"부드러운 줄바꿈(soft break)"으로 한 칸 공백처럼 취급됩니다.

```markdown
첫 번째 단락의 첫 줄.
같은 단락의 둘째 줄.

두 번째 단락.
```

내보내기에서는 `<p>` 태그로 감싸 출력합니다.

### 2.3 인용블록 (Blockquote)

`>`로 시작하는 줄이 인용블록이고, `>`를 겹쳐 쓰면 중첩됩니다.

```markdown
> 1단계 인용.
>
> > 중첩 인용. 두루미는 `>>`도 정상 인식합니다.
> >
> > > 3단계도 가능합니다.
```

- 라이브 프리뷰: `>` 마커는 시각적으로 숨겨지고 좌측 세로선과 들여쓰기로
  표시됩니다. 캐럿이 해당 줄에 있을 때는 마커가 보입니다(편집용).
- 빈 인용 줄(`>`만 있고 내용이 없음)은 마커를 일부러 숨기지 않습니다.

### 2.4 GitHub 스타일 알림 블록 (Alerts / Callouts)

GitHub와 Pandoc 3.x가 채택한 `> [!TYPE]` 문법을 지원합니다. 다섯 가지
타입이 정의되어 있습니다.

```markdown
> [!NOTE]
> 일반적인 보충 정보. 회색 또는 파란색 강조.

> [!TIP]
> 권장 사항.

> [!IMPORTANT]
> 반드시 알아야 할 정보.

> [!WARNING]
> 주의가 필요한 내용.

> [!CAUTION]
> 위험·부정적 결과 가능.
```

| 타입 | 의미 | 일반적 색상 |
| :--- | :--- | :--- |
| `NOTE` | 보충 정보 | 파랑 |
| `TIP` | 팁/권장 | 초록 |
| `IMPORTANT` | 핵심 정보 | 보라 |
| `WARNING` | 주의 | 주황 |
| `CAUTION` | 위험 | 빨강 |

- 내보내기(HTML/PDF): `markdown-it-github-alerts` 플러그인으로 처리되어
  좌측 색상 막대와 라벨 + 아이콘이 있는 스타일드 인용블록으로 렌더됩니다.
- 내보내기(DOCX/LaTeX): Pandoc 3.x가 알림 문법을 네이티브로 인식하므로
  원본 그대로 전달합니다. Pandoc 버전이 낮으면 일반 인용블록으로 떨어집니다.
- 라이브 프리뷰: 일반 인용블록으로 표시됩니다(전용 색상 강조는 향후 확장).
  편집 시 차이를 보려면 `파일 → 내보내기 → HTML`로 미리보기 하세요.

### 2.5 리스트

#### 2.5.1 비순서 리스트

마커로 `-`, `*`, `+` 모두 사용 가능하지만, 두루미 기본은 `-`입니다(가장
시각적 노이즈가 적음).

```markdown
- 첫 항목
- 둘째 항목
  - 중첩(스페이스 2칸 또는 4칸)
  - 한 항목 더
- 셋째 항목
```

#### 2.5.2 순서 리스트

```markdown
1. 첫 단계
2. 둘째 단계
3. 셋째 단계
```

번호가 실제로 무엇이든 첫 번호부터 1씩 증가시키는 것이 마크다운 표준이지만,
가독성을 위해 실제 번호와 동기화해 적는 것을 권장합니다.

#### 2.5.3 작업 리스트 (Task lists)

GFM 작업 리스트 — `- [ ]` / `- [x]`.

```markdown
- [ ] IRB 승인 신청
- [x] 코호트 정의 확정
- [ ] 통계 분석 계획서 초안
```

- 라이브 프리뷰: 클릭으로 토글 가능. 키보드는 `Cmd/Ctrl + Enter`.
- 내보내기: HTML은 비활성 체크박스로 렌더(`enabled: false`), 텍스트만
  유지됩니다. DOCX는 Pandoc이 글머리표 + 텍스트 형태로 변환합니다(체크박스
  네이티브 변환은 Pandoc 한계).

### 2.6 코드 블록

#### 2.6.1 펜스(```fenced```) 코드 블록

세 개의 백틱 또는 틸드 펜스를 사용합니다. 언어 식별자를 옵션으로 붙이면
구문 강조가 적용됩니다.

```markdown
​```python
def hazard_ratio(events: int, person_years: float) -> float:
    return events / person_years
​```

​```r
fit <- coxph(Surv(time, status) ~ trt, data = veteran)
summary(fit)
​```
```

지원되는 언어 목록은 `@codemirror/language-data`에 등재된 모든 언어입니다(약
130여 종, JavaScript/TypeScript/Python/R/SQL/Bash/JSON/YAML 등 거의 모든
의학연구 컨텍스트에 충분). 알 수 없는 언어는 강조 없이 그대로 출력됩니다.

#### 2.6.2 들여쓰기(indented) 코드 블록

각 줄이 4개 스페이스 또는 1개 탭으로 시작하는 단락은 코드 블록입니다.

```markdown
    이 줄은 코드.
    이 줄도 코드.
```

가능하면 펜스 형식을 권장합니다. 들여쓰기 형식은 언어 힌트를 줄 수 없고
실수로 발생하기 쉽습니다.

### 2.7 표 (Tables)

GFM 파이프 테이블을 지원하며 열 정렬 마커를 인식합니다.

```markdown
| 변수 | 평균 ± SD | 빈도(%) |
| :--- | :---: | ---: |
| 연령 | 62.4 ± 11.2 | — |
| 남성 | — | 124 (54.9) |
| 흡연 | — | 87 (38.5) |
```

| 정렬 마커 | 의미 |
| :--- | :--- |
| `:---` | 좌측 정렬 (기본) |
| `:---:` | 가운데 정렬 |
| `---:` | 우측 정렬 |
| `---` | 정렬 미지정(좌측으로 처리) |

- 라이브 프리뷰: 표는 캐럿이 떠나면 렌더된 HTML 테이블로 표시됩니다.
  편집 중에는 파이프 소스 그대로 보입니다.
- 표 삽입은 `Cmd/Ctrl + Shift + T` 단축키로 빠르게 할 수 있습니다.
- 헤더 셀 안에서 `<br>`로 줄바꿈을 강제하는 트릭은 두루미에서 동작합니다.

### 2.8 수평선 (Horizontal Rule)

빈 줄 위·아래에 다음 중 어느 것이든 단독으로 두면 수평선이 됩니다.

```markdown
---

***

___
```

세 가지 모두 같은 결과를 만듭니다. 다만 YAML 프런트매터와의 충돌 때문에
**문서 맨 첫 줄에 `---`를 단독으로 두면** 두루미는 그것을 프런트매터의
시작으로 해석합니다. 문서 시작에 수평선이 필요하다면 `***` 또는 `___`을
쓰거나 한 줄 위에 빈 단락을 두세요.

### 2.9 HTML 블록

블록 레벨 HTML(`<div>`, `<section>`, `<details>` …)은 그대로 전달됩니다.

```markdown
<div class="figure">
  <img src="figure-1.png" alt="Figure 1">
  <p class="caption">Figure 1. Study flow.</p>
</div>
```

- 내보내기: HTML은 그대로 통과(`html: true`). DOCX/LaTeX(Pandoc 경로)는
  `+raw_html` 확장이 켜져 있어 가능한 한 변환을 시도하지만, 복잡한 HTML은
  사라지거나 단순화될 수 있습니다.
- 라이브 프리뷰: 블록 HTML은 렌더되지 않고 소스 그대로 표시됩니다(편집
  안전성 우선). 인라인 HTML 일부는 다음 절에서 보듯 페어링되어 렌더됩니다.

---

## 3. 인라인 요소

### 3.1 강조 (Emphasis / Strong)

| 입력 | 결과 | 비고 |
| :--- | :--- | :--- |
| `*기울임*` | *기울임* | |
| `_기울임_` | _기울임_ | 단어 중간에서는 무시됨(GFM) |
| `**굵게**` | **굵게** | |
| `__굵게__` | __굵게__ | 단어 중간 규칙은 위와 동일 |
| `***굵은 기울임***` | ***굵은 기울임*** | |
| `~~취소선~~` | ~~취소선~~ | GFM |
| `==하이라이트==` | (배경 노란색) | Typora/MultiMarkdown 확장 |
| `H~2~O` | 아래첨자 | Pandoc 확장(단일 `~`) |
| `X^2^` | 위첨자 | Pandoc 확장(단일 `^`) |

세부 규칙:

- `*` 페어와 `_` 페어는 동등하지만, 한국어처럼 단어 경계가 모호한 언어에서는
  `*`가 더 안정적입니다(GFM은 단어 내부의 `_`를 강조로 보지 않습니다).
- 라이브 프리뷰에서 캐럿이 강조 안에 있을 때는 `**` 같은 마커가 보이고,
  떠나면 마커가 숨겨집니다.
- `==`, 단일 `~`, 단일 `^`는 두루미의 `InlineExtras` 파서가 처리합니다.
  내용에는 공백이 들어갈 수 없습니다(예: `~with space~`는 인식 안 됨).
- `~~`는 GFM 취소선이 우선이라 단일 `~`는 양옆이 비공백일 때만 아래첨자로
  해석됩니다.

### 3.2 인라인 코드

백틱 1개로 감쌉니다. 코드 안에 백틱을 넣어야 한다면 마커 백틱 수를 늘립니다.

```markdown
함수 `hazardRatio()`가 반환하는 값은 ``a single `Number` value``입니다.
```

### 3.3 인라인 수식 (KaTeX)

`$…$` 안에 LaTeX 수식을 적습니다.

```markdown
오즈비는 $\mathrm{OR} = \frac{a/b}{c/d}$ 로 정의된다.
```

- 라이브 프리뷰와 내보내기 모두 KaTeX로 즉시 렌더됩니다.
- 코드 블록·인라인 코드·HTML 블록 안의 `$`는 수식으로 해석되지 않습니다.
- 한 줄 안에서 `$` 단독을 통화 기호로 쓰고 싶다면 `\$`로 이스케이프하세요.

### 3.4 인라인 HTML 태그

문서 안에 직접 적은 HTML 인라인 태그 중 시각적 의미가 명확한 다섯 가지는
두루미가 페어를 매칭해 라이브 프리뷰에서도 렌더해 줍니다.

| 태그 | 의도 |
| :--- | :--- |
| `<sub>` … `</sub>` | 아래첨자 |
| `<sup>` … `</sup>` | 위첨자 |
| `<mark>` … `</mark>` | 형광 강조 |
| `<kbd>` … `</kbd>` | 키 입력 표시 |
| `<u>` … `</u>` | 밑줄 |

```markdown
H<sub>2</sub>O · 면적은 m<sup>2</sup> · <mark>중요</mark> · <kbd>Ctrl</kbd>+<kbd>S</kbd> · <u>참고</u>
```

- 라이브 프리뷰: 캐럿이 같은 줄에 있을 때는 태그 소스가 보이고, 떠나면
  태그가 숨겨지면서 본문만 적절한 스타일로 렌더됩니다.
- 짝이 맞지 않는 태그(예: `<sub>`만 있고 `</sub>`가 없음)는 안전을 위해
  렌더하지 않고 소스 그대로 둡니다.
- 위 다섯 외 태그(예: `<span>`, `<i>`)는 페어링·재렌더 대상이 아닙니다.
  내보내기 HTML에서는 그대로 통과되지만 라이브 프리뷰에서는 소스로 보입니다.

### 3.5 백슬래시 이스케이프

마크다운 메타문자를 글자 그대로 쓰려면 앞에 `\`를 둡니다.

```markdown
\* 별표 그대로
\_ 언더스코어 그대로
\` 백틱 그대로
\\ 백슬래시 그대로
\[ \] \( \) 괄호류
\$ 달러 기호 (수식 회피)
```

이스케이프된 마커는 마크다운 의미를 잃지만 시각적으로는 다음 글자 한 자만
보입니다(앞의 `\`는 라이브 프리뷰에서 숨겨집니다).

### 3.6 링크

#### 3.6.1 인라인 링크

```markdown
[텍스트](https://example.org)
[제목까지 표시](https://example.org "툴팁 제목")
```

#### 3.6.2 참조 링크

```markdown
[NEJM 논문][nejm-2023] 그리고 [같은 논문][nejm-2023]을 한 번 더 인용.

[nejm-2023]: https://www.nejm.org/doi/full/10.1056/NEJMoa1234567 "예시 논문"
```

라벨 정의는 문서 어디에든 둘 수 있고 대소문자 구분이 없습니다. 같은 라벨을
두 번 정의하면 첫 번째가 우선 적용됩니다.

#### 3.6.3 자동 링크

```markdown
<https://example.org>
<min@example.org>
```

`<…>`로 감싼 URL/이메일은 그대로 클릭 가능한 링크가 됩니다.

#### 3.6.4 베어 URL 자동 변환

`linkify: true` 설정 덕분에 `https://`로 시작하는 URL은 별도의 마크업 없이도
링크로 변환됩니다(내보내기 경로에서). 라이브 프리뷰에서는 클릭 가능한
링크 데코레이션은 적용되지만 텍스트는 그대로 보입니다.

### 3.7 각주 (Footnotes)

MultiMarkdown / Pandoc 스타일을 따릅니다.

```markdown
연구 결과는 일반화에 한계가 있다[^limitation].

[^limitation]: 단일기관 후향 코호트라는 점.
```

- 식별자는 영숫자와 `-`, `_`를 허용합니다. 공백·대괄호·중첩은 불가.
- 본문에서의 첫 등장 순서대로 1, 2, 3 …번호가 자동 부여됩니다.
- 정의는 본문 어디에 두어도 무방하며, 빈 줄을 만나기 전까지는 여러 줄에
  걸칠 수 있습니다.
- 라이브 프리뷰: 참조는 작은 위첨자 링크, 클릭하면 정의로 점프.
- 내보내기: 표준 GitHub 스타일 `<section class="footnotes">` + `↩` 백링크.

### 3.8 인용 (Citations)

두루미는 Pandoc 스타일의 `[@key]` 인용을 1차 시민으로 지원합니다.

| 입력 | 의미 |
| :--- | :--- |
| `[@smith2023]` | 단일 인용 |
| `[-@smith2023]` | 저자명 억제(번호만) |
| `[@a; @b; @c]` | 그룹 인용. 등장 순서대로 번호 부여 |
| `[@key, p. 33]` | 위치 표시(suffix). 키만 추출되고 위치는 보존 |

키 문자 집합: `A-Z`, `a-z`, `0-9`, `_ . - + : /`. 공백·괄호는 불가.

- 라이브 프리뷰: `[@…]` 전체를 위첨자 번호 마커로 표시(키는 툴팁/소스 모드).
- 내보내기: `applyCitations`가 본문의 `[@key]`를 `<sup>[1]</sup>` 형태의
  앵커로 치환하고, 문서 끝에 Vancouver 스타일 `References` 섹션을
  자동 추가합니다(BibTeX이 있을 때만).
- 누락 키는 빨간색 `[?]` 마커로 표시되어 빠진 곳을 즉시 발견할 수 있습니다.

BibTeX 연결 방법은 § 5와 § 8에서 다룹니다.

### 3.9 메모 (Manuscript memos)

두루미는 MS Word의 댓글 기능과 동등한 역할을 마크다운 친화적인 방식으로
지원하기 위해 `%% 메모 %%` 문법을 도입했습니다. AI 리뷰 노트, 동료 검토
질문, 셀프 노트(`@todo`, `@stats` 등)를 본문 안에 가볍게 붙이고, 사이드바에
모아 볼 수 있습니다.

#### 3.9.1 인라인 형식

```markdown
이 결과는 유의했다 %% @ai stats agent가 Wilcoxon 검증 필요 %% (p < 0.05).
연구 한계는 %% @reviewer 이 표현이 너무 강함, 완화 필요 %% 명확하다.
%% @todo p값 추가 %%
```

가드 규칙:

- `%%` 바로 앞이 알파벳·숫자이면 메모로 인식하지 않습니다(`100%% complete`
  안전).
- `%%` 셋 이상 연속(`%%%text%%%`)은 거부됩니다(불명확).
- 본문이 비거나 공백뿐이면 거부됩니다.
- `\%%`로 이스케이프하면 글자 그대로 표시됩니다(lezer의 `Escape` 노드가
  자동 처리).

#### 3.9.2 블록 형식

```markdown
%%
@reviewer 이 단락 전체가 너무 길다.
연구질문 → 결과 흐름이 모호함.
%%
```

`%%` 단독 줄로 시작해서 또 다른 `%%` 단독 줄까지가 한 메모입니다. 블록
안의 빈 줄은 허용됩니다.

#### 3.9.3 태그

본문의 첫 토큰이 `@` + 알파벳으로 시작하면 태그로 인식됩니다
(`[A-Za-z][A-Za-z0-9_-]*` 뒤에 선택적 `:` 가능). 알려진 태그는 서로 다른
색상이 붙습니다.

| 태그 | 색상 | 의도 |
| :--- | :--- | :--- |
| `@ai` | 파랑 | AI 에이전트 검토 메모 |
| `@todo` | 주황 | 셀프 작업 목록 |
| `@reviewer` | 초록 | 동료/심사위원 검토 메모 |
| `@stats` | 보라 | 통계 검증 필요 항목 |
| 그 외 / 무태그 | 회색 | 일반 메모 |

#### 3.9.4 사이드바와 상태바

- 사이드바 **메모** 탭에 문서 순서대로 모든 메모가 모입니다(태그 chip +
  본문 미리보기 + 라인 번호). 한 줄을 클릭하면 에디터가 해당 라인으로
  점프합니다.
- 상태바에 `N개 메모` 카운터가 표시됩니다(메모 0개일 때는 표시되지 않음).

#### 3.9.5 단축키

`Cmd/Ctrl + Alt + M` — 선택 영역이 있으면 `%% 선택 %%`로 감싸고, 선택이
없으면 빈 메모(`%%  %%`)를 삽입한 뒤 두 공백 사이에 캐럿을 둡니다.

#### 3.9.6 내보내기 동작 — 안전 기본값

의학 매뉴스크립트 제출 시 메모 누설은 critical failure이므로 두루미는
**기본적으로 모든 내보내기에서 메모를 제거합니다**. HTML/PDF/DOCX/LaTeX
모두 동일하게 적용됩니다.

`설정 → 내보내기 → 메모 포함` 체크박스를 켜면 메모가 보존됩니다.

| 형식 | 기본 (strip) | 메모 포함 (promote) |
| :--- | :--- | :--- |
| HTML / PDF | 메모 흔적 없음 | 인라인은 `[메모: @태그 본문]`, 블록은 `<blockquote>` |
| DOCX | 메모 흔적 없음 | 본문에 visible blockquote (Pandoc은 Word native 댓글 emit 불가) |
| LaTeX | `.tex`에 `%`-comment 누설 차단 | visible blockquote |

> **한계 명시**: Pandoc은 `<w:comment>` Word native 댓글 XML을 emit하지
> 못합니다(Pandoc 이슈 #2994 미해결). "메모 포함" 옵션은 모든 형식에서
> visible blockquote으로 변환되므로 실제 Word 리본의 "검토 → 댓글"과는
> 다릅니다.

#### 3.9.7 코드 펜스 안의 `%%`

` ``` `로 감싼 코드 블록 안의 `%%`은 메모로 인식되지 않습니다 — 그대로
보존되어 export에도 그대로 나갑니다. 라이브 프리뷰에서도 사이드바에
잡히지 않습니다.

```markdown
​```python
threshold = 0.05  # %% reviewer says this should be 0.01 %%
​```
```

#### 3.9.8 v2 후보 (현재 미포함)

- Resolved/unresolved 상태 — 메모를 "해결됨"으로 표시
- 메모 thread (다중 답글)
- 작성자 메타 (`%% @ai{author=stats-agent} … %%`)
- 메모 카테고리 색상 사용자 커스터마이징
- CriticMarkup 옵션(`{++ ++}` / `{-- --}` / `{>> <<}`)으로 트랙체인지
  워크플로우 추가 — 풀 동료심사 모드용

---

## 4. 수식, 코드, 다이어그램

### 4.1 블록 수식

`$$` 두 줄로 감싸면 디스플레이 수식이 됩니다.

```markdown
$$
\hat{\beta} = (X^\top X)^{-1} X^\top y
$$
```

- 라이브 프리뷰와 HTML 내보내기는 KaTeX로 렌더됩니다.
- DOCX·LaTeX 내보내기는 Pandoc이 처리하며, KaTeX 전용 매크로 일부는
  Pandoc이 인식하지 못할 수 있습니다(이 경우 토스트 경고).
- 펜스 수식 `​```math … ```​` 은 두루미의 라이브 프리뷰에서는 일반 코드
  블록으로 보이고 KaTeX 렌더가 적용되지 않습니다. 표준 `$$` 형식 사용을
  권장합니다.

### 4.2 KaTeX 커버리지

두루미는 KaTeX 0.16을 사용합니다. 지원·미지원 매크로 목록은 KaTeX 공식
[Supported Functions](https://katex.org/docs/supported.html) 페이지를
참조하세요. 의학 통계에서 흔한 `\frac`, `\sum`, `\int`, `\hat{}`, `\bar{}`,
`\widehat{}`, `\mathrm{}`, `\text{}`, `\mathbb{R}`, 행렬·정렬 환경
(`pmatrix`, `bmatrix`, `aligned`)은 모두 정상 작동합니다.

### 4.3 Mermaid 다이어그램

```markdown
​```mermaid
flowchart TD
    A[등록 1284명] --> B{포함 기준}
    B -- 충족 982 --> C[랜덤화]
    B -- 미충족 302 --> X[제외]
    C --> D[중재군 491]
    C --> E[대조군 491]
​```
```

- 라이브 프리뷰: 펜스 바깥에 캐럿이 있으면 SVG로 렌더, 안에 있으면 소스
  편집 모드. `securityLevel: 'strict'` 설정으로 임의 HTML 주입을 차단합니다.
- 내보내기 HTML/PDF: 사전 렌더된 SVG가 그대로 포함됩니다.
- 내보내기 DOCX/LaTeX: Pandoc은 `mermaid` 펜스를 일반 코드 블록으로
  취급합니다. 그림으로 포함하려면 PDF·HTML로 내보내거나, 별도 도구로
  Mermaid를 PNG/SVG로 추출해 `![](…)`로 삽입하세요.

CONSORT/PRISMA 흐름도는 보통 Mermaid `flowchart`로 그립니다(템플릿에 자리만
주석으로 표시).

### 4.4 구문 강조 언어

코드 블록의 첫 펜스 줄에 다음 중 하나를 적으면 강조가 적용됩니다(주요 항목):

| 분류 | 식별자 |
| :--- | :--- |
| 통계/분석 | `r`, `python`, `julia`, `matlab`, `stata` (제한적) |
| 시스템 | `bash`, `shell`, `sh`, `powershell` |
| 데이터 | `json`, `yaml`, `toml`, `xml`, `csv`(텍스트), `sql` |
| 웹 | `html`, `css`, `scss`, `javascript`, `typescript`, `jsx`, `tsx` |
| 문서 | `markdown`, `latex`, `tex` |

전체 목록은 `@codemirror/language-data`의 등재 목록을 따릅니다. 별칭(`js`,
`ts`, `py`, `rb` 등)도 받습니다. 알 수 없는 식별자는 강조 없이 텍스트로
출력됩니다(에러 아님).

---

## 5. 메타데이터와 디렉티브

### 5.1 YAML 프런트매터

문서 맨 처음에 `---` 두 줄로 감싼 YAML 블록입니다(닫는 줄은 `---` 또는
`...` 모두 인정).

```markdown
---
title: "코호트 연구 매뉴스크립트"
author: "김민걸, 김의학"
date: 2026-05-09
journal: "JAMA"
keywords: [cohort, all-cause mortality, propensity score]
subject: "Observational study (STROBE)"
bibliography: references.bib
csl: vancouver.csl
study-type: cohort study
header-includes:
  - \usepackage{lineno}
---
```

두루미가 직접 사용하는 키:

| 키 | 사용처 |
| :--- | :--- |
| `title` | HTML/PDF 제목, DOCX/LaTeX 메타데이터 |
| `author` | HTML `<meta name="author">`, DOCX/LaTeX 메타 |
| `subject` | HTML `<meta name="description">` |
| `keywords` | HTML `<meta name="keywords">` |
| `date` | DOCX/LaTeX 메타 |
| `bibliography` | 인용 처리에 사용할 .bib 파일 경로(현재 문서 디렉토리 기준 상대경로 가능, § 5.4 참조) |
| `csl` | (Pandoc 경로) CSL 스타일 파일. 두루미 내부 인용 렌더는 Vancouver 고정이므로 효과는 Pandoc 경로에서만 |
| `header-includes` | (Pandoc 경로) LaTeX 프리앰블 추가 |

알려지지 않은 키는 그대로 보존되어 Pandoc 경로(DOCX/LaTeX)로 전달됩니다.
`typora-root-url`, `typora-copy-images-to`, `header`/`footer` 같은 Typora
전용 키는 v1에서 인식하지 않습니다(이미지는 `electron/images.ts` 경로로
대체).

라이브 프리뷰에서는 프런트매터가 단일 라인 요약(`title — author`)으로
접혀 표시됩니다. 소스 모드(`Cmd/Ctrl + /`)에서는 원본 YAML이 보입니다.
파싱 실패 시 본문은 영향받지 않고 토스트로 알림이 뜹니다.

### 5.2 `[toc]` 디렉티브

자체 줄에 `[toc]`(대소문자 무관, 앞뒤 공백 허용)을 두면 그 자리에 자동
목차가 생성됩니다.

```markdown
[toc]
```

- 라이브 프리뷰: 현재 문서의 헤딩 트리가 위젯으로 즉시 렌더되며 헤딩 변경
  시 자동 갱신됩니다.
- 내보내기 HTML: `<nav class="toc">` 안에 `<ul>` 트리로 출력. 각 항목은
  헤딩 슬러그로의 내부 링크입니다. 헤딩이 없으면 `(empty table of
  contents)` 메시지가 들어갑니다.
- 내보내기 DOCX/LaTeX: Pandoc이 별도 처리(LaTeX는 `\tableofcontents`,
  DOCX는 `--toc` 옵션 가능). 현재 두루미 내보내기는 Pandoc에 원본 그대로
  넘기므로 `[toc]` 줄이 그대로 남을 수 있습니다.
- 한 문서 안에 여러 개의 `[toc]`도 허용됩니다.

### 5.3 각주 정의

§ 3.7 참조. 정의 줄은 컬럼 0에서 시작해야 하며, 정의 본문은 빈 줄을 만나기
전까지 이어집니다.

### 5.4 BibTeX 자동 검색

`bibliography` 키가 비어 있어도 두루미는 현재 파일 디렉토리부터 워크스페이스
루트까지 **상위 32단계**를 거슬러 올라가며 다음 파일명을 찾습니다.

1. `references.bib`
2. `references.bibtex`
3. `bibliography.bib`

가장 먼저 발견된 파일이 그 문서의 BibTeX 소스로 사용됩니다. 직접 경로를
지정하려면 프런트매터에 `bibliography: path/to/refs.bib`를 적으세요.

---

## 6. 이미지와 미디어

기본 문법은 표준 마크다운입니다.

```markdown
![대체 텍스트](images/figure-1.png)
![제목 포함](images/figure-1.png "Figure 1. Study flow")
```

- `src`는 `https://`/`http://` URL 또는 상대 경로. 상대 경로는 현재 문서가
  저장된 디렉토리를 기준으로 해석됩니다.
- 라이브 프리뷰: 이미지 위젯으로 인라인 렌더(lazy load).
- 내보내기 HTML: 이미지 경로는 그대로 두므로, 내보낸 HTML을 다른 위치로
  옮길 때는 `images/` 디렉토리를 함께 옮기세요. PDF는 즉시 임베드됩니다.
- 내보내기 DOCX/LaTeX: Pandoc이 이미지 파일을 임베드합니다.

### 6.1 드래그 앤 드롭 이미지 저장

이미지 파일을 에디터에 드래그하거나, 클립보드에서 이미지를 붙여 넣으면
두루미가 다음 두 가지 중 하나를 수행합니다.

1. 현재 문서가 디스크에 저장된 상태라면, 같은 디렉토리 안의 `images/`
   하위 폴더(없으면 자동 생성)에 새 파일로 저장한 뒤 상대 경로로
   `![](images/...)` 마크다운을 캐럿 위치에 삽입합니다.
2. 현재 문서가 아직 저장되지 않은 경우, 먼저 저장하라는 토스트 경고가
   뜹니다(상대 경로 기준점이 없기 때문).

파일명은 충돌 시 `-2`, `-3` … 접미사로 자동 분기됩니다.

---

## 7. 공백과 줄바꿈

### 7.1 단락 구분

빈 줄 한 줄이 단락 경계입니다. 빈 줄 없는 줄바꿈은 같은 단락 안의 부드러운
줄바꿈으로 한 칸 공백처럼 처리됩니다.

### 7.2 강제 줄바꿈 (Hard line break)

같은 단락 안에서 `<br>` 효과를 내려면 두 가지 방법이 있습니다.

1. 줄 끝에 **공백 두 칸**을 둡니다(권장은 아니지만 표준).
2. 줄 끝에 **백슬래시 하나**를 둡니다(가독성 좋음).

```markdown
첫 줄.  
같은 단락의 둘째 줄. 위에 공백 두 칸.

첫 줄.\
같은 단락의 둘째 줄. 백슬래시 사용.
```

라이브 프리뷰는 강제 줄바꿈 위치에 흐릿한 `↵` 표식을 보여 주어 보이지 않는
공백 두 칸을 시각화합니다.

### 7.3 부드러운 줄바꿈 (Soft break)

위 두 가지 마커 없이 단락 안에서 줄을 바꾸면 결과적으로 한 칸 공백입니다.
한국어처럼 단어 사이 공백이 의미 있는 문어체에서는 의도와 다른 공백이
생길 수 있으므로 주의하세요.

---

## 8. 의학연구 전용 기능

### 8.1 BibTeX 인용 파이프라인

문서가 BibTeX 소스(`references.bib` 자동 발견 또는 `bibliography:` 지정)와
연결되면, 두루미는 다음을 수행합니다.

1. 본문에서 `[@key]` 등장 순서대로 1, 2, 3 … 번호를 부여.
2. 본문 위치는 `<sup class="citation"><a href="#ref-…">1</a></sup>` 형태의
   링크로 치환(클릭 시 참고문헌 항목으로 점프).
3. 문서 끝에 `<section class="references">`을 자동 부착하고 Vancouver
   스타일 항목을 채워 넣습니다.

지원되는 BibTeX 필드: `author`, `editor`, `title`, `journal`, `booktitle`,
`year`, `volume`, `number`, `pages`, `publisher`, `doi`, `url`. 6명 초과
저자는 `et al`로 잘립니다. DOI는 자동으로 `https://doi.org/…` 링크로
연결됩니다.

> 한계: 두루미 내부 렌더는 Vancouver 고정입니다. 다른 스타일(APA, AMA,
> 저널별 변형)이 필요하면 DOCX/LaTeX 내보내기에서 `csl: …` 프런트매터
> 키를 통해 Pandoc + CSL 경로로 처리하세요.

### 8.2 매뉴스크립트 템플릿

`파일 → 새 문서(템플릿)` 메뉴에서 다음 6종을 선택할 수 있습니다.

| ID | 라벨 | 보고 가이드라인 |
| :--- | :--- | :--- |
| `imrad` | IMRaD article | 일반 임상 저널의 Introduction–Methods–Results–Discussion |
| `consort` | CONSORT (RCT) | 무작위 대조 임상시험 보고지침 (CONSORT 2010) |
| `prisma` | PRISMA (systematic review) | 체계적 문헌고찰·메타분석 (PRISMA 2020) |
| `case-report` | Case report (CARE) | 단일 환자 증례보고 (CARE 2017) |
| `cohort` | Cohort / observational (STROBE) | 관찰연구 (STROBE) |
| `cross-sectional` | Cross-sectional / survey (STROBE) | 단면연구·설문 (STROBE) |

각 템플릿은 다음을 포함합니다.

- YAML 프런트매터 스켈레톤(`title`, `author`, `date`, `journal`, 연구 유형
  메타데이터).
- 문서 상단 `[toc]`.
- 보고 가이드라인이 요구하는 표준 헤딩 트리(예: CONSORT의 Trial design,
  Participants, Interventions, Outcomes, Sample size, Randomisation,
  Blinding, Statistical methods 등).

템플릿은 가이드라인을 강제하지 않고 "구조를 안내"만 하므로, 저널별 요구
사항에 맞춰 자유롭게 수정 가능합니다.

### 8.3 통계 매크로

`편집 → 매크로 설정` 메뉴 또는 `~/.durumi`(macOS) / `%APPDATA%/Durumi`
디렉토리의 `macros.json`을 편집해 단축키 → 삽입 텍스트 매핑을 정의할 수
있습니다. 두루미가 기본 제공하는 의학연구 프리셋:

| 단축키 | 삽입 |
| :--- | :--- |
| `Mod-Shift-D` | 오늘 날짜 (`${date}`) |
| `Mod-Shift-H` | `\n\n---\n\n` (수평선) |
| `Mod-Alt-P` | `*p* < 0.05` |
| `Mod-Alt-C` | `95% CI [, ]` |
| `Mod-Alt-M` | `M ± SD` |
| `Mod-Alt-N` | `(*n* = )` |
| `Mod-Alt-H` | `HR  (95% CI [, ])` |
| `Mod-Alt-O` | `OR  (95% CI [, ])` |
| `Mod-Alt-R` | `RR  (95% CI [, ])` |
| `Mod-Alt-K` | `[@]` (인용 키 입력) |
| `Mod-Alt-F` | `[^]` (각주 키 입력) |
| `Mod-Alt-Shift-N` | `\n> [!NOTE]\n> ` |

`Mod`는 macOS에서 Cmd, 그 외 OS에서 Ctrl로 매핑됩니다. 매크로 파일을
실수로 망가뜨렸다면 `편집 → 매크로 기본값으로 재설정`이 백업 후 다시
씁니다(이전 파일은 같은 디렉토리에 `macros.backup.json`으로 보존).

### 8.4 .docx 가져오기 (Pandoc)

`파일 → 가져오기 → Word (.docx)`를 선택하면 Pandoc이 다음 명령으로
실행됩니다.

```text
pandoc -f docx \
  -t markdown+yaml_metadata_block+footnotes+definition_lists+pipe_tables-raw_html \
  --wrap=none input.docx
```

결과 마크다운은 새 문서로 열립니다(저장은 사용자가). 구조화된 표·각주는
대체로 잘 보존되며, 복잡한 트랙변경/주석/SmartArt는 손실될 수 있습니다.
Pandoc이 없으면 설치 안내 다이얼로그(macOS는 Homebrew 자동 설치 옵션)가
표시됩니다.

---

## 9. 내보내기

`파일 → 내보내기` 메뉴에 네 가지 형식이 있습니다.

| 형식 | 처리 경로 | 외부 의존성 |
| :--- | :--- | :--- |
| HTML | `markdown-it` + KaTeX + Mermaid | 없음 |
| PDF | HTML → 헤드리스 BrowserWindow 인쇄 | 없음 |
| DOCX | Pandoc | Pandoc 필수 |
| LaTeX (.tex) | Pandoc | Pandoc 필수 |

### 9.1 HTML

- 입력 확장: `markdown-it` + `markdown-it-task-lists` +
  `markdown-it-footnote` + `markdown-it-mark`(`==`) +
  `markdown-it-sub` + `markdown-it-sup` + `markdown-it-github-alerts`.
- 코드 강조: `@codemirror/language-data` 기반 동기 하이라이트.
- 수식: KaTeX(서브셋 `katex.min.css`를 jsdelivr CDN에서 로드).
- 사용자 정의 CSS: `보기 → Custom CSS 열기`로 추가.
- 인용·`[toc]`·헤딩 슬러그는 모두 markdown-it 진입 전에 사전 처리됩니다.

### 9.2 PDF

- HTML 결과를 헤드리스 BrowserWindow로 인쇄해 PDF로 저장합니다.
- HTML과 동일한 스타일·KaTeX·Mermaid가 그대로 적용됩니다.
- 페이지 머리글/바닥글은 v1에서 미지원(추후 매뉴스크립트 v1에서 추가 예정).

### 9.3 DOCX (Pandoc)

```text
pandoc -f markdown+yaml_metadata_block+footnotes+definition_lists+pipe_tables+raw_html \
       -t docx -o output.docx --standalone
```

- 저널별 스타일이 필요하면 환경설정의 "Word 스타일 참조 문서(.docx)"
  경로를 지정하면 `--reference-doc=...`이 추가됩니다.
- 인용은 `csl:` 프런트매터 키 + Pandoc citeproc 경로를 권장합니다(두루미
  내부의 Vancouver 렌더는 HTML/PDF 전용).
- Mermaid 펜스는 코드 블록으로 변환됩니다(SVG 변환은 Pandoc 한계).

### 9.4 LaTeX (Pandoc)

```text
pandoc -f markdown+yaml_metadata_block+footnotes+definition_lists+pipe_tables+raw_html \
       -t latex -o output.tex --standalone
```

- 출력은 단독 컴파일 가능한 `.tex`(`-s`).
- 사용자 정의 템플릿은 환경설정의 `latexTemplate` 경로로 지정.
- `header-includes:` YAML 키가 있으면 그대로 프리앰블에 들어갑니다.

### 9.5 보존되지 않는 것 (요약)

| 기능 | HTML/PDF | DOCX | LaTeX |
| :--- | :--- | :--- | :--- |
| Mermaid SVG | 보존 | 코드 블록 | 코드 블록 |
| KaTeX 전용 매크로 | 정확 | 일부 손실 가능 | 대부분 보존 |
| `<sub>/<sup>/<mark>/<kbd>/<u>` HTML | 보존 | 변환 시도 | 변환 시도 |
| 임의 `<div>` 블록 HTML | 보존 | 손실 가능 | 손실 가능 |
| 작업 리스트 체크박스 | 비활성 박스 | 글머리표 변환 | 글머리표 변환 |
| 인용(`[@key]`) | 두루미 내부 Vancouver 렌더 | Pandoc citeproc(권장) | Pandoc citeproc(권장) |

---

## 10. 마크다운 서식 단축키

문서 작성 중 가장 자주 쓰는 키만 추렸습니다(`Mod`는 macOS=Cmd, 그 외=Ctrl).

| 단축키 | 동작 |
| :--- | :--- |
| `Mod + B` | 굵게 토글 (`**…**`) |
| `Mod + I` | 기울임 토글 (`*…*`) |
| `Mod + Shift + K` | 인라인 코드 토글 (`` `…` ``) |
| `Mod + Shift + X` | 취소선 토글 (`~~…~~`) |
| `Mod + Alt + M` | 메모 감싸기/삽입 (`%% … %%`) |
| `Mod + K` | 링크 삽입 (`[…](…)`) |
| `Mod + 1` ~ `Mod + 6` | 헤딩 H1~H6로 변환 |
| `Mod + Shift + T` | 표 삽입 |
| `Mod + Shift + C` | 코드 블록 삽입 |
| `Mod + Enter` | 작업 리스트 체크 토글 |

문서·뷰 단축키:

| 단축키 | 동작 |
| :--- | :--- |
| `Mod + N` / `Mod + Shift + N` | 새 문서 / 새 창 |
| `Mod + O` | 파일 열기 |
| `Mod + S` / `Mod + Shift + S` | 저장 / 다른 이름으로 저장 |
| `Mod + P` | Quick Open(파일 검색) |
| `Mod + F` / `Mod + Alt + F` | 찾기 / 찾아 바꾸기 |
| `Mod + G` / `Mod + Shift + G` | 다음/이전 일치 |
| `Mod + /` | 소스 모드 토글 |
| `Mod + Shift + L` | 라이트/다크 테마 토글 |
| `Mod + \` | 사이드바 토글 |
| `Mod + Shift + E` / `O` / `F` | 사이드바: 파일 / 아웃라인 / 검색 |
| `F8` | Focus Mode 토글 |
| `F9` | Typewriter Mode 토글 |

매크로 단축키(`Mod-Alt-…`)는 § 8.3 참조. 사용자가 `macros.json`에서 자유롭게
추가/변경할 수 있습니다.

---

## 11. Typora와의 차이

본 문서가 기준선으로 삼는 Typora 1.13에 대해 두루미가 **추가**한 것과
**의도적으로 빼거나 다르게 처리**한 것을 정리합니다.

### 11.1 두루미가 더한 것

- **`%% 메모 %%` 매뉴스크립트 메모(§ 3.9)**: MS Word 댓글에 해당하는
  본문 인라인/블록 메모. 태그 prefix(`@ai`/`@todo`/`@reviewer`/`@stats`)별
  색상, 사이드바 메모 탭 집계, 상태바 카운터, 기본 strip 내보내기.
- **Pandoc 스타일 인용(`[@key]`)**: 본문 인라인 인용 + 자동 번호 부여 +
  Vancouver 참고문헌 섹션 자동 생성. BibTeX 자동 발견 포함.
- **매뉴스크립트 템플릿**: IMRaD, CONSORT, PRISMA, CARE 증례보고, STROBE
  코호트, STROBE 단면연구 6종을 메뉴에서 새 문서로 생성.
- **의학연구 통계 매크로 프리셋**: p-value, 95% CI, M ± SD, n=, HR/OR/RR
  등 11종 + 사용자 추가 가능. `macros.json`으로 영구화.
- **GitHub `> [!NOTE]` 스타일 알림**: HTML/PDF 내보내기에 색상·아이콘
  포함. (Typora도 일부 지원하나 두루미는 매크로 키로 한 줄 삽입 가능.)
- **워크스페이스 내 검색 탭**: 사이드바 검색 탭에서 대소문자/단어경계/정규식
  필터로 모든 워크스페이스 폴더를 가로질러 검색.
- **Quick Open 팔레트(`Cmd/Ctrl + P`)**: fzf 스타일 점수로 파일명 검색.
- **사이드바 파일 컨텍스트 메뉴**: 우클릭으로 새 파일/새 폴더/이름 바꾸기/
  복제/휴지통/Finder에서 보기/경로 복사 등.
- **아웃라인 드래그 재정렬**: 사이드바 아웃라인 탭에서 헤딩을 드래그해
  마크다운 소스 자체를 재배치(ATX 헤딩 전용; Setext 혼재 문서에서는 비활성).
- **드래그 앤 드롭 이미지 자동 저장**: `images/` 하위 폴더로 자동 라우팅 +
  파일명 충돌 회피.
- **`.docx` 가져오기**: Pandoc 경로로 .docx → 마크다운 1-패스 변환을
  메뉴화.
- **Homebrew 자동 Pandoc 설치 다이얼로그**(macOS): Pandoc 미설치 시
  안내가 아닌 1-클릭 설치까지 안내.

### 11.2 두루미가 의도적으로 뺀 것

- **EPUB / OPML / RST / Textile / MediaWiki 내보내기**: 매뉴스크립트
  워크플로에 불필요. 정말 필요하면 Pandoc CLI로 우회 가능.
- **테마 갤러리 UI**: `Custom CSS 열기` 한 항목으로 충분.
- **Sequence/Flow 레거시 다이어그램**: Mermaid `flowchart` /
  `sequenceDiagram` 등이 모두 대체.
- **macOS Versions 통합**: `~/.durumi/backup` 자동 미러로 대체.
- **HTML 비디오/임베드 위젯**: 매뉴스크립트 범위 밖.
- **이미지 내보내기(PNG)**: 헤드리스 렌더로 추후 추가 가능하지만 v1에서는
  미포함.
- **Typora 전용 YAML 키**: `typora-root-url`, `typora-copy-images-to`,
  `typora-header`/`typora-footer`, `append-head`/`append-body`, `sidebar`
  등은 무시됩니다(이미지·헤더/푸터 처리 모델이 다릅니다).

### 11.3 동작이 미세하게 다른 것

- **펜스 수식 `​```math​`**: Typora는 KaTeX 렌더, 두루미는 일반 코드 블록
  취급. 표준 `$$ … $$` 사용 권장.
- **CSL 인용 스타일**: Typora는 자체 미지원. 두루미는 HTML/PDF 내부
  렌더만 Vancouver 고정이고, DOCX/LaTeX는 Pandoc citeproc + `csl:`
  프런트매터 키를 통해 모든 CSL 스타일 사용 가능.
- **표 헤더 정렬**: 표준대로 `:---:`, `:---`, `---:`만 의미가 있으며,
  Typora 일부 버전이 허용하던 비표준 정렬 표기는 받지 않습니다.

---

## 부록 A. 흔히 묻는 함정

- **YAML 첫 줄에 `---`만 있고 닫는 `---`가 없을 때**: 파서가 "아직 입력
  중"이라 판단해 본문 손상을 막기 위해 그 영역을 그대로 둡니다. 닫는
  줄을 추가하면 정상 인식됩니다.
- **`H~2~O`가 아래첨자가 안 됨**: 양옆 모두 비공백 글자여야 합니다.
  `H ~2~ O`처럼 공백이 끼면 인식되지 않습니다(`~~취소선~~`과의 모호함을
  막기 위한 의도적 규칙).
- **`==하이라이트==`가 보이긴 한데 export에서 색이 빠짐**: 사용자 정의
  CSS가 `mark` 색을 덮어 썼는지 확인하세요. 기본 export 스타일은 옅은
  노랑 배경입니다.
- **`[@smith]`가 본문에 그대로 보임**: BibTeX 파일이 발견되지 않았거나
  키가 거기에 없습니다. 누락 키는 `[?]`로 표시되어야 정상 — 그 외 경우
  `bibliography:` 프런트매터 키 또는 자동 발견 파일명(§ 5.4)을 확인.
- **이미지 드래그가 안 됨**: 파일이 아직 디스크에 저장되지 않은 새 문서일
  가능성이 높습니다. 한 번 저장한 뒤 다시 시도하세요.
- **PDF 내보내기에서 헤더가 안 들어감**: 페이지 머리글/바닥글은 v1
  미지원. 매뉴스크립트 v1 일정에 포함되어 있습니다.
- **DOCX의 인용 번호가 두루미와 다름**: DOCX는 Pandoc citeproc이 처리하므로
  CSL 스타일·정렬 규칙이 다를 수 있습니다. HTML/PDF의 Vancouver 결과와
  완전히 동일하지 않을 수 있다는 점을 가정하고 작업하세요.

---

## 부록 B. 데코레이션 우선순위 메모(고급)

라이브 프리뷰 데코레이션은 다음 순서로 등록되며, 같은 위치에서 충돌하는
경우 먼저 등록된 쪽이 우선합니다.

1. Active line / 프런트매터
2. 각주 / 인용 / 메모(`%%`) / `[toc]`
3. 헤딩 / 강조 / 이스케이프(`\X`)
4. 인라인 HTML(`<sub>`,`<sup>`,`<mark>`,`<kbd>`,`<u>`) / HTML 블록 / HTML 주석 /
   인라인 코드 / 하드 줄바꿈 / 링크 / 참조 링크 / 자동 링크 / 이미지
5. 코드 블록 / 코드 강조 / 작업 리스트 / 일반 리스트
6. 인용블록 / 수평선 / 취소선 / 표 / 수식 / Mermaid

대부분의 사용자는 이 순서를 의식할 필요가 없지만, "이 인용블록 안의
`[@key]`가 왜 인용이 아닌 일반 텍스트로 보이는가" 같은 깊은 질문을
디버깅할 때는 도움이 됩니다(답: 인용블록 데코레이션이 더 늦게 등록되어도
`Citation` 노드 자체는 lezer 단계에서 먼저 만들어지므로 정상 인식됩니다).

---

## 부록 C. 외부 참고

- Typora 1.13 Markdown Reference: <https://support.typora.io/Markdown-Reference/>
- KaTeX Supported Functions: <https://katex.org/docs/supported.html>
- Mermaid 문법: <https://mermaid.js.org/intro/syntax-reference.html>
- Pandoc 사용자 가이드: <https://pandoc.org/MANUAL.html>
- BibTeX 형식: <https://www.bibtex.org/Format/>
- CONSORT 2010: <https://www.consort-statement.org/>
- PRISMA 2020: <https://www.prisma-statement.org/>
- STROBE: <https://www.strobe-statement.org/>
- CARE: <https://www.care-statement.org/>

이 문서에 대한 수정 제안은 GitHub 이슈로 보내 주세요. 두루미는 의학연구
실무에서의 피드백을 가장 빠르게 반영합니다.
