# 참고문헌 관리 가이드

두루미(Durumi)는 의학연구 매뉴스크립트를 작성하면서 참고문헌을
**한 곳에서 검색하고 → 로컬에 PDF로 보관하고 → 본문에 인용 삽입하고 →
내보내기에서 자동 정렬**하는 end-to-end 워크플로를 제공합니다.

이 문서는 v0.1.9 기준의 실제 사용법을 한곳에 모아둔 안내서입니다.
기능별 간단 사용법 → 상세 동작 → 단축키 모음 → 문제 해결 순서로
정리했습니다.

---

## 1. 큰 그림

두루미의 참고문헌 시스템은 **두 개의 파일**과 **하나의 폴더**로
구성됩니다.

```
my-paper/                       ← 워크스페이스 / 문서 폴더
├── manuscript.md               본문 — Pandoc 스타일 [@key] 인용 사용
├── references.bib              ← 단일 진실 원본 (BibTeX 포맷)
└── reference/                  ← 로컬 사본 폴더 (자동 생성)
    ├── smith2024deep.pdf       (open-access 풀텍스트 PDF)
    ├── kim2023ai.md            (초록만 가능할 때 — 마크다운으로 변환)
    └── paper-from-email.pdf    (사용자가 직접 드롭한 파일)
```

핵심 원칙:

- **`references.bib`는 항상 단일 진실 원본**입니다. 다른 도구
  (Zotero, Pandoc, Overleaf 등)가 읽을 수 있어 portable합니다.
- `reference/` 폴더의 파일들은 BibTeX 엔트리의 `file = {…}` 필드로
  매칭됩니다. 두루미가 다운로드한 파일은 `<key>.pdf` 명명 규칙을
  따르고, 사용자가 직접 드롭한 파일은 원래 이름 그대로 유지됩니다.
- 모든 변경은 **사용자가 명시적으로 클릭한 직후에만** 발생합니다.
  백그라운드 prefetch나 자동 동기화는 없습니다 (프라이버시 + 학술
  네트워크 정책 준수).

---

## 2. 시작하기

새 매뉴스크립트 작성을 시작할 때:

1. 빈 마크다운 파일을 만들고 폴더에 저장 (예: `my-paper/manuscript.md`)
2. **검토 메뉴 → DOI로 인용 삽입…** (또는 `Cmd/Ctrl + Shift + B`)
   클릭
3. DOI 한 줄 붙여넣고 **조회** → 미리보기 확인 → **삽입**

두루미가 자동으로:
- `my-paper/references.bib` 생성
- 새 엔트리 추가 (인용 키는 `lastnameYEAR약어` 자동 생성)
- 본문 캐럿 위치에 `[@key]` 삽입

이후 동일한 DOI 흐름을 반복하거나, 아래의 다른 추가 방법을 사용하면
됩니다.

---

## 3. 참고문헌 추가하기 — 4가지 진입점

### 3.1 DOI 한 개 추가 (`Cmd/Ctrl + Shift + B`)

가장 흔한 케이스. 논문을 읽다가 DOI를 알고 있을 때:

1. **검토 메뉴 → DOI로 인용 삽입…** 또는 단축키
2. DOI 입력 (`10.1056/NEJMoa2117417`, `https://doi.org/...` 형태 모두 OK)
3. **조회** 클릭 → Crossref에서 메타데이터 페치
4. 저자/연도/제목/저널 미리보기 확인
5. **삽입** 클릭

결과: `references.bib`에 엔트리 추가 + 캐럿 위치에 `[@key]` 삽입.

### 3.2 DOI 일괄 추가 — 체계적 고찰 / 메타분석에 유용

여러 DOI를 한 번에 처리:

1. **검토 메뉴 → DOI 일괄 추가…**
2. 텍스트 영역에 DOI를 줄바꿈/쉼표/세미콜론으로 구분해서 붙여넣기
   ```
   10.1056/NEJMoa2117417
   10.1038/s41586-024-XXXXX, 10.1016/j.cell.2024.01.001
   ```
3. **추가** 버튼이 인식된 DOI 개수를 표시 (`추가 (15)`)
4. 클릭하면 순차적으로 Crossref 페치 + bib 추가
5. 행마다 실시간 상태 표시 (`·` pending → `⌛` resolving → `✓` ok / `✗` error)
6. 중간에 **중지**로 멈출 수 있음 — 이미 추가된 항목은 보존

### 3.3 키워드 검색 — Crossref / PubMed / KoreaMed

저자나 주제만 알고 있을 때:

1. **우측 사이드바 → 참고문헌 탭** (없으면 `Cmd/Ctrl + Shift + \\`로
   열기)
2. 상단 검색 입력란에 검색어
3. 좌측 드롭다운으로 출처 선택 (Crossref / PubMed / KoreaMed)
4. 300ms debounce 후 결과 카드 표시
5. 원하는 결과의 **추가** 버튼 → bib에 등록 + 캐럿 위치에 `[@key]`
   삽입

특이사항:
- **KoreaMed**는 공식 API가 불안정해서 두루미가 직접 KoreaMed
  웹페이지(`SearchBasic.php`)를 파싱합니다. 한국 의학 저널 검색에는
  PubMed보다 결과가 좋을 때가 많습니다.
- **PubMed**는 NCBI E-utilities 사용. Settings에서 NCBI API 키를
  입력하면 초당 3건 → 10건으로 레이트 리밋이 완화됩니다.
- **오프라인** 상태에서는 검색바가 비활성화되고 "오프라인" 배지가
  표시됩니다. 이미 추가된 로컬 항목은 그대로 사용 가능.

### 3.4 Zotero / EndNote에서 임포트

`.bib` 또는 `.ris` 파일을 가지고 있다면:

1. **검토 메뉴 → 참고문헌 가져오기 (.bib / .ris)…**
2. 파일 선택 다이얼로그 → 파일 픽
3. **임포트 미리보기 다이얼로그**가 표시:
   - 신규 / 충돌 / 경고 개수 pill
   - 모든 엔트리 목록 (충돌 시 배경 표시)
   - 충돌 처리 모드 선택:
     - **이름 변경** (기본): 가져오는 키에 `-2`, `-3` 접미 — 둘 다 유지
     - **건너뛰기**: 기존 항목 유지, 가져오는 항목 무시
     - **기존 항목 교체**: 기존 항목을 가져오는 필드로 덮어쓰기
4. **가져오기** 클릭

RIS 파서는 Zotero / EndNote / RefWorks / Web of Science의
이상한 변형 RIS도 처리하며, abstract 같은 긴 필드의 continuation
line도 자동으로 합칩니다.

---

## 4. 본문에 인용 삽입하기

Pandoc 스타일 문법을 그대로 사용합니다.

### 4.1 기본 문법

| 문법 | 의미 |
|:--|:--|
| `[@key]` | 단일 인용 |
| `[@a; @b; @c]` | 그룹 인용 (출력에서 정렬됨) |
| `[-@key]` | author-suppressing form |
| `[@key, p. 33]` | 위치 정보 (locator) 포함 |

### 4.2 `[@`-자동완성 (v0.1.7부터)

본문에서 `[@` 입력 → `references.bib`의 키 목록이 fuzzy 드롭다운으로
나타남:
- 키, 저자, 제목, 저널 어디라도 일부 매칭되면 후보로 등장
- ↑/↓로 이동, Enter로 선택
- 선택하면 `[@key]`로 닫는 대괄호까지 자동 완성

키를 외울 필요가 없습니다.

### 4.3 인용 팔레트 (`Cmd/Ctrl + Shift + I`)

키워드로 인용 위치 빠르게 찾기:

1. 단축키 또는 **검토 메뉴 → 인용 삽입…**
2. 검색 입력에 저자명/제목 키워드/연도 등
3. 결과에서 Enter → 캐럿 위치에 `[@key]` 삽입

`[@`-자동완성과 차이: 팔레트는 캐럿 위치와 무관하게 별도 다이얼로그로
열림. 본문 입력 흐름을 끊지 않고 인용 검색하고 싶을 때 유용.

### 4.4 hover 툴팁

본문의 `[@key]`에 마우스를 올리면:
- 저자, 연도, 제목, 저널, DOI를 미니 카드로 표시
- 로컬 PDF/MD가 있으면 **📄 파일 열기** 버튼 — 시스템 기본 앱으로 열림
- DOI 클릭 → 브라우저로 doi.org 이동

---

## 5. 로컬 참고문헌 라이브러리

각 BibTeX 엔트리에 PDF (open-access) 또는 Markdown (초록만 가능)
사본을 로컬에 보관할 수 있습니다.

### 5.1 다운로드 흐름

우측 사이드바의 참고문헌 탭에서 항목 카드의 **📥** 버튼 클릭:

두루미가 다음 순서로 시도:

| 순서 | 출처 | 결과 |
|:--:|:--|:--|
| 1 | Crossref 응답의 `link[]` 배열에 PDF | `<key>.pdf` |
| 2 | PMC OA (PubMed ID가 있을 때) | `<key>.pdf` |
| 3 | Unpaywall API (Settings의 Crossref 이메일 사용) | `<key>.pdf` |
| 4 | URL 풀텍스트 페이지를 HTML → Markdown 변환 | `<key>.md` |
| 5 | 위 모두 실패 — 메타데이터만 stub로 저장 | `<key>.md` |

항상 5단계에서 최소한의 stub은 만들어집니다. 사용자가 빈손이
되는 경우는 없습니다.

### 5.2 파일 상태 배지

다운로드 후 카드의 📥 버튼이 다음 배지로 바뀝니다:

| 배지 | 의미 |
|:--:|:--|
| **📄** | PDF 사본 보유 — 클릭하면 PDF 뷰어로 열림 |
| **📝** | Markdown 사본만 (초록 또는 풀텍스트 변환본) — 클릭하면 기본 마크다운 뷰어로 열림 |
| **📥** | 사본 없음 — 클릭하면 다운로드 시작 |

본문의 `[@key]` hover 툴팁의 **📄 파일 열기** 버튼도 같은 파일을
엽니다.

### 5.3 미등록 파일 (orphan) 등록

논문 PDF를 이메일로 받았거나 학회에서 가져온 경우:

1. PDF를 Finder/Explorer에서 `<문서폴더>/reference/`에 직접 드롭
2. 두루미의 우측 사이드바 → 참고문헌 탭 새로고침
3. **📁 미등록 파일** 섹션에 자동으로 surface
4. 옆의 **➕ 등록** 버튼 클릭

두루미가 자동으로:
- pdfjs-dist로 PDF 본문에서 DOI 추출 시도 (Info 사전 → 첫 256KB)
- DOI 발견 시 → Crossref 자동 페치 → bib 엔트리 생성 → 토스트
- DOI 없으면 → 수동 메타데이터 입력 모달 (제목 필수, 나머지 선택)

**중요**: 두루미는 사용자가 직접 드롭한 파일을 절대 이름 변경하거나
삭제하지 않습니다. `reference/paper-from-email.pdf`처럼 원본 이름이
유지되고, bib 엔트리의 `file` 필드가 그 경로를 가리키게 됩니다.

### 5.4 한 번에 모든 인용 다운로드

미구현 — v0.1.10 이후 폴리시 후보. 현재는 항목별로 📥 클릭이
필요합니다.

---

## 6. 엔트리 관리

우측 사이드바의 항목 카드는 3개의 아이콘 버튼을 제공합니다.

### 6.1 ✎ 편집

- 모든 BibTeX 필드를 모달에서 편집 (type, title, author, year,
  journal, volume, number, pages, DOI, URL, file, abstract)
- **인용 키는 읽기 전용** — 키 변경은 별도 액션 (아래 6.2)
- 저장 시 atomic write — 부분 저장으로 인한 .bib 손상 없음

### 6.2 🔑 키 변경 (atomic — bib + 본문 함께)

가장 복잡한 작업이 가장 안전하게 처리됩니다:

1. 카드의 🔑 버튼 클릭
2. 새 키 입력 (`[A-Za-z0-9_:.+-/]+` 문자만 허용)
3. 다이얼로그가 표시:
   - **이 문서에 N개의 참조가 있습니다** — 실시간 카운트
   - 검증 결과 (빈 키 / 형식 오류 / 동일 키 / 이미 사용 중)
4. **변경** 클릭

두루미가:
- `references.bib`에 새 키로 엔트리 재작성 (atomic write)
- 활성 문서의 모든 `[@oldKey]`, `[-@oldKey]`, `[@a; @oldKey; @b]`,
  `[@oldKey, p. 33]` 형태를 모두 새 키로 교체
- **단일 CodeMirror 트랜잭션**으로 처리 — undo도 한 번에 모두 되돌릴
  수 있음

부분 매칭 방지: `[@smith2024deep]`에서 `smith2024`를 rename해도
키의 일부만 매칭되는 경우는 처리되지 않습니다 (lookbehind 정규식
사용).

### 6.3 ✕ 삭제

- bib 엔트리만 삭제됩니다
- **`reference/<key>.{pdf,md}` 파일은 그대로 유지** (아키텍처
  invariant: 사용자 파일은 자동 삭제 안 함)
- 삭제 후 다음 스캔에서 그 파일이 미등록 파일 섹션으로 surface됨 —
  필요하면 다른 엔트리로 재등록 가능

---

## 7. AI 기반 인용 제안

쓰고 있는 단락에 어떤 참고문헌이 어울리는지 모를 때:

1. 캐럿을 단락 안에 두기
2. **검토 메뉴 → AI: 현재 단락에 인용 제안…**
3. 패널에서 단락 미리보기 확인 → **{N}개 항목에서 인용 제안받기**

두루미가 모델에게 보내는 것:
- 현재 단락 텍스트
- `references.bib`의 엔트리 목록 (최대 60개, 각각 key + 저자 + 연도 +
  제목 + 초록 320자)
- 로컬 PDF가 있는 항목은 첫 ~3페이지 본문도 (pdfjs-dist로 추출, 각
  600자 cap, 최대 30개 항목까지)

응답:
- STRICT JSON 형식으로 후보 키 + 근거 + anchor 문구
- **환각 키는 자동 차단** — 응답한 키를 라이브 .bib에 대조해서
  존재하지 않으면 폐기
- 각 후보에 **단락 끝에 삽입** 버튼 — 클릭하면 `[@key]` 추가

설정한 LLM 제공자(Anthropic 또는 OpenAI-compatible)가 사용됩니다.
처음 사용 시 **설정 → AI 작성 도우미**에서 API 키 입력 필요.

---

## 8. 설정

**설정 → 참고문헌** 섹션:

| 필드 | 용도 |
|:--|:--|
| **Crossref 이메일** | polite-pool용. 비워두면 익명 풀(느림). 또한 Unpaywall에서도 이 이메일을 사용 |
| **NCBI E-utilities API 키** | PubMed 검색 레이트 리밋 3 → 10 req/s 향상. NCBI에서 무료 발급. 빈값이어도 검색은 됨 |
| **내 ORCID iD** | 형식: `0000-0000-0000-0000`. **확인** 버튼 → `pub.orcid.org`에서 이름/소속/출판물 수 표시 |

**설정 → AI 작성 도우미** 섹션 (참고문헌 관련):

| 필드 | 용도 |
|:--|:--|
| 제공자 | Anthropic 또는 OpenAI / Compatible (Ollama, LM Studio 포함) |
| API 키 | Electron `safeStorage`로 OS keychain에 암호화 저장. 렌더러는 plaintext에 접근 안 함 |
| 모델 | Anthropic: 프리셋. OpenAI: 자유 입력 (`gpt-4o`, `llama3`, …) |

**설정 → AI 사용량** 섹션:
- 누적 호출 / 토큰 / 예상 비용
- 모델별 / 용도별 표 (selection palette / citation suggest /
  ghost text / verify)
- 초기화 버튼

---

## 9. 내보내기와의 통합

`references.bib`는 내보내기 파이프라인에 자동으로 흘러갑니다.

### 9.1 HTML / PDF (두루미 내장)

- 본문의 `[@key]` → `<sup>` 번호로 변환 (1, 2, 3, …)
- 그룹 인용 `[@a; @b]` → `[1,2]`로 압축
- 누락 키 → `[?]` 빨간 표시 + tooltip
- 문서 끝에 Vancouver 스타일 `<section class="references">` 자동 추가:
  ```html
  <ol>
    <li id="ref-smith2024deep">Smith J, Doe A. Deep learning ... Nature. 2024;612:234-241. doi:10.xxxx/yyy</li>
    ...
  </ol>
  ```

### 9.2 DOCX / LaTeX (Pandoc citeproc 경유)

- `--citeproc --bibliography references.bib` 자동 추가
- 기본 스타일: Pandoc 내장 (저널 요구사항에 맞게 `csl: <style>.csl`
  front-matter 키로 변경 가능)

### 9.3 메모 / CriticMarkup과의 상호작용

- 메모 안의 `%% [@key] %%` → 기본 strip 모드에서 제거되므로 인용은
  본문에만 두는 게 안전
- CriticMarkup `{++ [@key] ++}` 안의 인용은 accept 모드 (기본)에서
  본문으로 합쳐짐

---

## 10. 단축키 모음

| 단축키 | 동작 |
|:--|:--|
| `Cmd/Ctrl + Shift + B` | DOI로 인용 삽입 (단일) |
| `Cmd/Ctrl + Shift + I` | 인용 팔레트 (fuzzy 검색) |
| `[@` 입력 | 본문 내 자동완성 드롭다운 |
| `Cmd/Ctrl + Shift + \\` | 우측 사이드바 (참고문헌/AI) 토글 |
| `F1` | 전체 단축키 목록 다이얼로그 |

검토 메뉴에서 단축키 없이 접근:
- 참고문헌 가져오기 (.bib / .ris)
- DOI 일괄 추가
- AI: 현재 단락에 인용 제안

---

## 11. 파일 경로 / 발견 규칙

### 11.1 `references.bib` 발견

활성 문서를 열면 두루미가 자동으로 워크스페이스에서 `.bib` 파일을
찾습니다:

1. 문서와 같은 폴더 → `references.bib` → `references.bibtex` →
   `bibliography.bib`
2. 부모 폴더에서 같은 순서로 — 워크스페이스 루트까지 최대 32단계
3. 못 찾으면 첫 인용 추가 시 자동으로 `<문서폴더>/references.bib`
   생성

YAML front matter에서 명시도 가능:
```yaml
---
title: My paper
bibliography: shared/refs.bib  # 상대 경로
---
```

### 11.2 `reference/` 폴더

`references.bib`와 **같은 폴더**에 `reference/`를 자동 생성. bib
엔트리의 `file` 필드는 항상 `references.bib`로부터의 **POSIX 상대
경로**:

```bibtex
@article{smith2024deep,
  ...
  file = {reference/smith2024deep.pdf}
}
```

OS 간 portable — 다른 머신에서 같은 폴더를 열어도 깨지지 않습니다.

### 11.3 인용 키 생성 규칙

자동 생성 키 형식: `lastname` + `year` + `firstTitleWord` (모두 소문자
ASCII).

- **영문 저자**: `Smith → smith`
- **한글 저자**: 표준 RR (Revised Romanization) 적용 — `김민걸 →
  gimmingeol` (전체) 또는 `김 → gim` (성)
- **제목 첫 단어**: stopwords (the, a, on, in, of 등) 건너뜀
- **충돌 시**: `a`, `b`, `c`, …, `z` 접미 (`smith2024deep`,
  `smith2024deepa`, …)
- 사용자가 [편집/키변경] 모달에서 직접 키를 지정해도 됩니다 (위 규칙은
  자동 생성 기본값일 뿐)

---

## 12. 문제 해결

### 12.1 검색이 안 됨 / 너무 느림

- 오프라인 배지가 떠 있는지 확인 — 네트워크 연결 확인
- Crossref 이메일을 Settings에 입력 → polite pool 사용으로 속도 향상
- PubMed는 NCBI API 키 입력 시 레이트 리밋 향상
- KoreaMed 검색이 비어 있으면 KoreaMed 사이트 변경 가능성 — 이슈로
  알려주세요

### 12.2 다운로드한 PDF가 본문이 깨져 있음

- Unpaywall에서 받은 OA PDF가 publisher의 변형본일 수 있음
- 공식 사이트에서 직접 받아 `reference/<key>.pdf`로 *수동* 저장하면
  hover 툴팁의 📄 버튼이 그대로 이 파일을 가리킴

### 12.3 인용 키를 바꿨더니 본문 일부만 바뀜

- 두루미의 키 변경은 atomic — 절대 부분만 바뀌지 않습니다
- 다른 도구로 `references.bib`을 수동 편집한 적이 있다면 본문과 bib이
  어긋났을 가능성. 본문 `[@?]` 빨간 표시를 검색해서 누락 키 확인

### 12.4 같은 키를 가진 엔트리가 두 개

- BibTeX 파서는 첫 번째 엔트리를 사용하고 두 번째는 경고를 띄움
- 사이드바에서 ✎ 편집으로 한쪽을 다른 키로 변경하거나 ✕ 삭제

### 12.5 미등록 파일이 surface되지 않음

- 우측 사이드바 → 참고문헌 탭을 다른 탭으로 갔다가 다시 오면 재스캔
- 파일이 정확히 `<문서폴더>/reference/`에 있는지 확인 (한 단계
  하위)
- 점(`.`)으로 시작하는 dotfile은 무시됨

### 12.6 AI 제안이 엉뚱한 키를 추천

- 환각 키는 자동 차단되지만 *유효한* 키 중 부적절한 제안일 수 있음
- 단락 컨텍스트를 더 명확히 (한 문장 → 2-3 문장으로 확장)
- AI 사용량 대시보드에서 어떤 모델을 사용 중인지 확인 — Claude
  Sonnet/Opus가 GPT-4o-mini나 작은 로컬 모델보다 의학 도메인에서 잘
  동작

---

## 13. 외부 도구와의 호환

| 도구 | 호환성 |
|:--|:--|
| **Pandoc** | `references.bib`와 본문 `[@key]`를 그대로 처리. 두루미가 export 시 자동으로 `--citeproc` 추가 |
| **Zotero** | `.bib` 또는 `.ris` 내보내기 → 두루미의 임포트 모달로 가져오기 |
| **EndNote** | `.ris` 내보내기 → 임포트 |
| **Overleaf** | 같은 `references.bib`을 git 또는 동기화로 공유 가능 — 두루미의 `file =` 필드는 Pandoc/biber가 무시하므로 무해 |
| **Mendeley** | `.bib` 내보내기 → 임포트 (Mendeley 자체 RIS는 비표준이라 .bib 권장) |

---

## 14. 아키텍처 invariants (참고용)

이 시스템이 어떤 약속을 지키는지:

1. **`.bib`는 단일 진실 원본**. 사이드카 JSON이나 별도 DB 없음.
   외부 편집은 fs.watch 또는 탭 재방문 시 자동 반영.
2. **사용자 파일은 자동 삭제·이름 변경 없음**. bib 엔트리 삭제 시
   `reference/<file>`은 그대로.
3. **모든 외부 HTTP는 메인 프로세스에서**. 렌더러는 네트워크 격리.
4. **모든 다운로드/검색은 사용자 명시 클릭 직후**. 백그라운드 prefetch
   없음.
5. **인용 키 생성은 결정론적**. 같은 입력은 같은 키. 충돌 접미는
   알파벳 순.
6. **인용 키 rename은 bib + 본문 atomic**. half-state 없음.
7. **AI 인용 제안은 라이브 .bib에 대조**. 환각 키는 절대 본문에
   닿지 않음.

자세한 invariants는 [docs/PROGRESS.md](PROGRESS.md)에 누적되어
있습니다.

---

## 부록 A. 단축 워크플로 예시

### A1. 새 매뉴스크립트 시작부터 첫 인용까지

```
1. File → New → Save as my-paper/manuscript.md
2. Type: "## Introduction\n\nRecent meta-analyses "
3. Cmd+Shift+B → "10.1056/NEJMoa2117417" → Resolve → Insert
   Result: "## Introduction\n\nRecent meta-analyses [@smith2024deep]"
4. Continue typing: " have shown "
5. Type "[@" → autocomplete shows kim2023ai → Enter
   Result: "...have shown [@kim2023ai]"
```

### A2. Zotero 마이그레이션

```
1. Zotero → File → Export Library → BibTeX → save.bib
2. Durumi → 검토 → 참고문헌 가져오기 → save.bib 선택
3. Preview shows 142 entries, 3 collisions
4. Set collision mode to "이름 변경" (rename)
5. Click 가져오기 (142)
6. Result: references.bib has 142 new + 3 renamed
```

### A3. Open-access PDF 일괄 받기

```
1. 사이드바 참고문헌 탭 열기
2. 각 항목 카드의 📥 클릭 (한 항목씩)
3. 다운로드 완료 시 📥 → 📄 (PDF) 또는 📝 (MD)로 배지 변경
4. 📄 클릭하면 시스템 PDF 뷰어로 열림
```

### A4. 의학 연구 메타분석 — DOI 30개 일괄

```
1. PubMed에서 검색 후 결과 페이지의 DOI 리스트를 텍스트로 복사
2. Durumi → 검토 → DOI 일괄 추가
3. 텍스트 영역에 붙여넣기 (줄바꿈/쉼표/세미콜론 어떤 것이든 OK)
4. 추가 (30) 클릭
5. ~30초 안에 30개 모두 bib에 추가 (Crossref polite pool 기준)
```

### A5. AI로 인용 추천받기

```
1. Introduction 단락을 한 단락 쓴 상태
2. 캐럿을 그 단락 안에 두고
3. 검토 → AI: 현재 단락에 인용 제안
4. "{12}개 항목에서 인용 제안받기" 클릭
5. 결과:
   - [@smith2024deep] - "본문이 '딥러닝 기반 영상 진단'을 언급" + anchor
   - [@kim2023ai] - "한국 임상 적용 사례 ... " + anchor
6. 적절한 후보 옆 "단락 끝에 삽입" 클릭
```

---

이 문서에 대한 수정/추가 제안은 GitHub 이슈로 보내 주세요.
