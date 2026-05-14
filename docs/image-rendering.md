# Image Rendering — Engineering Case Study

> v0.2.2 (2026-05-13) — written after the fix shipped. This is the
> engineering postmortem for a bug that took three iterations and an
> external review to root-cause. If you are debugging a similar
> "asset loads in Source mode but not Document/Live" class of failure,
> read **§3 Diagnostic process** and **§6 Invariants** first.

---

## 0. TL;DR

Pasted images silently failed to render in Document and Live modes from
v0.1.2 onward. The Source mode showed the markdown URL because Source
mode does not render. The other two modes built an `<img src>` from a
*relative* markdown URL (`assets/img-….png`), and the browser resolved
that path against the **renderer's** URL (`file:///…/out/renderer/`),
not the document's directory. Production never had a chance.

The fix introduces a custom `durumi-asset://` protocol handled in main,
threads the active doc path through CodeMirror as a `StateField`, and
extends the v0.2.1 path guard so a doc's sibling directories are
session-trusted. Four root causes had to fall before images rendered;
each one rebuilt our mental model of the system.

This document is the playbook for the next time something in the
renderer-to-disk pathway breaks.

---

## 1. The bug as users experienced it

A medical researcher pastes a screenshot of a CT scan into a new
manuscript draft. The renderer writes the bytes to
`<doc_dir>/assets/img-2026-05-13T07-22-15.png` via the `image:save`
IPC and inserts `![](assets/img-2026-05-13T07-22-15.png)` at the
caret. In Source mode they see the markdown they expect. They switch
to Document mode to keep writing. The image is gone.

What is actually visible:

- **Document mode** — broken-image placeholder (or nothing, depending
  on the platform's `<img>` failure rendering).
- **Live mode** — same as Document.
- **Source mode** — the markdown text, including the URL. Looks fine
  because Source mode renders no decorations.
- **HTML export** — the image *does* appear if the export pipeline
  inlines the file (it does, via `markdown-it` + post-process). So
  the bug looked like an editor decoration glitch, not a data-loss
  bug. That misled the first diagnosis pass.

The renderer's DevTools console (when Help → Toggle Developer Tools
was finally made always-visible — see §3) reveals:

```
Not allowed to load local resource: assets/img-2026-05-13T07-22-15.png
```

…in the Network panel. In production. With a CSP that includes
`'self'`. Mysterious.

---

## 2. Why this was broken from v0.1.2 onward

v0.1.2 introduced the image widget in `src/editor/decorations/image.ts`:

```ts
// pre-fix shape
class ImageWidget extends WidgetType {
  constructor(private alt: string, private src: string) { super(); }
  toDOM() {
    const img = document.createElement('img');
    img.alt = this.alt;
    img.src = this.src;          // ← the bug
    return img;
  }
}
```

`this.src` is whatever string sat between the `(` and `)` of
`![alt](src)`. For an image pasted by the user, that string is a
relative path like `assets/img-….png`. Setting `<img src>` to a
relative URL causes the browser to resolve it against the document's
**base URL**, which for the renderer is one of:

| Build | Base URL |
|---|---|
| `pnpm dev` | `http://localhost:5173/` |
| Production DMG/EXE | `file:///Applications/Durumi.app/Contents/Resources/app.asar/out/renderer/index.html` |

Neither of those is the user's document directory. In dev the request
404'd at the vite dev server; in production the path didn't exist on
disk at all. Either way, no image.

The bug went undetected for fifteen point releases because:

1. **Source mode wasn't broken.** Source mode is plain markdown text
   with syntax highlighting; no `<img>` is rendered, so users who
   tested image paste in Source mode (the developer-tier flow) saw the
   markdown and assumed it would render in Document mode too.
2. **HTML export wasn't broken.** The export pipeline calls
   `markdown-it` which produces an `<img>` tag with the same relative
   URL, but the export then *inlines* the image into the output HTML
   (or accompanies it with a sibling file), so the exported document
   rendered correctly. Users who exported never noticed the editor
   was broken.
3. **No e2e covered image paste.** The Playwright suite covered
   typing, headings, tables, code fences, even the citation pill —
   but not the image widget. There was nothing to fail.
4. **`<img>` failures are silent.** Browsers render a broken-image
   icon (or empty content for `<img>` without alt). No console error,
   no exception, no IPC failure. Just a missing image.

The fix landed during the v0.2.2 smoke test of the Electron
`sandbox: true` flip, when the first manual paste-an-image test
*ever* surfaced the failure. The sandbox flip and the image fix
shipped together because both touched the renderer-to-disk pathway
and benefited from one combined smoke test.

---

## 3. Diagnostic process — how the bug was actually found

This section is the postmortem of the debugging, not the postmortem
of the bug. Each iteration changed our hypothesis; the lesson at the
end of §3 is more important than the fix itself.

### Iteration 1 — "the sandbox flip broke something"

First hypothesis after the smoke test failed: P1-1 (`sandbox: true`)
introduced a regression. `sandbox: true` does block the renderer
from reading local files directly; maybe `<img src="file://…">` was
hitting that. Ruled out by `git diff v0.2.0..v0.2.1+P1-1 -- src/editor/decorations/image.ts`
which showed **zero changes** to the image widget. The bug pre-existed
the sandbox flip; the smoke test just happened to be the first manual
image-paste of the project's life.

### Iteration 2 — instrument the renderer

Diagnostic affordances were added so the user (and Codex, who would
review next) could see what `<img>` was actually requesting:

- `<img onerror>` handler logs `{ src, resolved }` to `console.error`.
- `<img>` gets `data-md-src` and `data-resolved-src` data attributes
  so DevTools inspection shows both the raw markdown URL and the
  resolved one even after the `<img>` load failed.
- View → Toggle Developer Tools became always visible (not gated on
  `NODE_ENV=development`). VS Code, Slack and Discord all do this;
  it lets a user on a packaged build self-diagnose without rebuilding.

After this instrumentation the renderer console showed:

```
[durumi] image load failed { src: 'assets/img-….png', resolved: 'assets/img-….png' }
```

Two takeaways: the URL was *not* being resolved (because the bug was
in widget code that read `parts.src` raw), and the load was failing
at the browser layer (the `onerror` did fire). The diagnostic now
gave us evidence we could actually act on.

### Iteration 3 — Codex external review

A Codex review of the v0.2.1 codebase + the diagnostic logs ranked
three hypotheses by evidence strength:

1. **CSP missing the custom scheme** (highest confidence) — direct
   code evidence of `img-src 'self' data: file: https:` in `index.html`
   with no entry for `durumi-asset:`.
2. **Path guard ordering after `image:save`** (medium) — the
   image-paste flow writes to disk via `image:save` before the
   editor decoration tries to read; if the path guard hadn't yet
   trusted the asset's directory, the protocol handler would 403.
3. **Percent-encoded `%2F` URL corruption** (low) — Chromium's
   standard-scheme URL parser normalises encoded slashes in the
   pathname; if the path was encoded into the pathname rather than
   a query parameter, the absolute path would get corrupted.

We started with the highest-confidence hypothesis: add `durumi-asset:`
to the CSP `img-src` directive in `index.html`. Done.

Image still didn't render. But — and this is the important part —
the `<img onerror>` now logged the resolved URL, which meant the
request was at least *being made*. The CSP fix was real, just not
sufficient on its own.

### Iteration 4 — main-side logging

The renderer's `onerror` told us "the load failed." It did **not**
tell us *where* the load failed — in the renderer (CSP), in flight
to main (URL parse error), or in main (path guard rejection, file
read error). The diagnostic gap was on the main side.

`electron/assetProtocol.ts` was extended with `logAssetError`, which
appends a single line to `<userData>/asset-protocol.log` for every
non-success response. The success path stays silent so the log
doesn't grow unbounded in normal use.

Image paste, then `cat ~/Library/Application\ Support/durumi/asset-protocol.log`:

```
(empty)
```

The handler was **never called**. The request was being made by the
renderer (we saw it in DevTools Network), but the main-side handler
was not receiving it. Two possibilities:

- The CSP was still blocking it (it wasn't — we verified by
  inspecting the Network panel: status was "(failed)" with no
  CSP-block message; the request was leaving the renderer).
- The URL was malformed badly enough that Electron's protocol
  dispatcher couldn't route it to our handler.

DevTools Network panel showed the URL:

```
durumi-asset:///%2FUsers%2Fmin%2FDocuments%2Fmanuscript%2Fassets%2Fimg-….png
```

…but the *parsed* request URL Electron showed in the same panel was:

```
durumi-asset:///Users/min/Documents/manuscript/assets/img-….png
```

Chromium's standard-scheme URL parser had silently normalised the
percent-encoded slashes back to literal forward slashes inside the
pathname. The absolute path `​/Users/min/…` was now indistinguishable
from a hostname (`Users`) followed by a path (`/min/…`). Our handler
expected `request.url.slice('durumi-asset://'.length)` to be the
encoded path; it wasn't. Codex's hypothesis #3 — the one we'd
deferred as "low confidence" — was the second root cause.

Fix: move the absolute path from the pathname to a query parameter
(`durumi-asset://x/?p=<encoded>`). Query-string percent encoding
survives the parser round-trip unchanged because the parser does not
attempt path-segment normalisation on the query string. The `x`
hostname is a placeholder — standard schemes require an authority.

After this fix: image renders. Six-iteration debugging cycle, three
of which were dead ends, two of which were necessary stepping
stones before the final fix.

### Lesson — instrument main, not just renderer

The single most useful diagnostic was `<userData>/asset-protocol.log`.
It told us, in one `cat`, whether the handler had even been called.
The renderer-side `onerror` told us *that* the load failed, but not
*where*. Renderer-side diagnostics are necessary but not sufficient
for any IPC- or protocol-mediated failure.

For the next maintainer: when a renderer→main pipeline fails to
deliver, **add a main-side log line for every non-success path and
read it before changing anything else**. Renderer logs only see the
boundary they're on; they're blind to what happens after the request
leaves them.

---

## 4. Architectural rationale — why `durumi-asset://`

Once the bug was understood, the design space for the fix was wider
than it first appeared. Four alternatives were considered.

### 4.1 `file://` URLs

The naïve fix: resolve the relative path to an absolute filesystem
path in the renderer, then set `<img src="file:///abs/path">`.

| Pros | Cons |
|---|---|
| Trivial: no IPC, no protocol. | Breaks in dev (renderer is `http://localhost`; browsers block `http → file`). |
| Works for production (renderer is also `file://`). | Conflicts with `sandbox: true`: the OS sandbox can deny direct filesystem reads even when the browser allows them. |
|  | No server-side path guard. A compromised renderer could `<img src="file:///etc/passwd">` and exfiltrate the file by encoding bytes into pixel data. |
|  | Dev and production take different code paths — twice the testing surface. |

Rejected. Dev/production drift alone would have been enough; the
sandbox interaction was the dealbreaker.

### 4.2 Data URLs (base64-inline every image)

Read the file in main, base64-encode the bytes, embed as
`<img src="data:image/png;base64,…">`.

| Pros | Cons |
|---|---|
| No custom scheme, no protocol registration. | Memory: a 5 MB image becomes a ~6.7 MB string. The widget eq()/diff path now compares ~7 MB strings on every edit. |
| Works identically in dev and production. | No incremental load, no `<img loading="lazy">`. Every image is fully materialised in JS heap as soon as the widget renders. |
|  | Future asset types (PDF preview, video, audio) are dead on arrival with this approach. |

Rejected. The memory and lazy-load story were both blockers. Medical
manuscripts routinely have 20+ figures.

### 4.3 Dev-server proxy + production `file://`

Use a vite middleware to serve assets from `<doc_dir>` in dev, fall
back to `file://` in production.

| Pros | Cons |
|---|---|
| Standards-clean. | Two code paths to maintain. |
|  | Vite proxy has to know about the active document, which means another channel between renderer and dev server (or a stale-by-design proxy). |
|  | Production still has the `sandbox: true` + `file://` problem. |

Rejected. Same dev/prod drift as §4.1 plus an extra moving part.

### 4.4 Custom protocol handled in main (chosen)

Register `durumi-asset://` with Electron's `protocol.registerSchemesAsPrivileged`,
install a `protocol.handle()` callback in main that reads the file
from disk and returns a `Response`. The renderer just sets
`<img src="durumi-asset://x/?p=<encoded-abs-path>">`.

| Pros | Cons |
|---|---|
| One code path for dev and production. | Requires `protocol.registerSchemesAsPrivileged` to be called *before* `app.whenReady()` resolves. Subtle initialisation ordering. |
| Server-side path guard (same allowlist as IPC). | Custom scheme must be added to renderer CSP `img-src`. Forgotten = silent failure. |
| `sandbox: true` compatible — renderer never touches disk. | URL shape is fragile (the `%2F` pathname normalisation that bit us). |
| Extensible to PDF, video, audio without new code. | One more thing to mock in tests. |

Chosen. The trade-offs are real but each one is a small one-time cost
in exchange for one architecture that handles every present and
future asset type. The `sandbox: true` compatibility was the tiebreaker
— it lets the OS-level sandbox stay strict without giving up
in-editor previews.

---

## 5. The four root causes

The image-render fix is not one fix but four. Each one is small in
isolation; together they form the contract that future maintainers
need to keep intact.

### 5.1 The widget had no doc-path context

**Cause.** The image widget read `parts.src` from the lezer
`Image` node and set `<img src>` to it directly. There was no way
for the widget to construct a correct URL because it didn't know
where the document lived. CodeMirror 6 plugins are document-agnostic
by default; the editor doesn't know its own file path.

**Fix.** A new `StateField<string | null>` in `src/editor/docPath.ts`:

```ts
export const setDocPath = StateEffect.define<string | null>();

export const docPathField: StateField<string | null> = StateField.define<string | null>({
  create() { return null; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setDocPath)) return e.value;
    }
    return value;
  },
});

export function currentDocPath(state: EditorState): string | null {
  return state.field(docPathField, false) ?? null;
}
```

The shape is the same as `editModeField` — recognisable to anyone
who has touched the editor's other mode-state plumbing.

`MarkdownEditor` dispatches `setDocPath.of(filePath)` whenever its
`filePath` prop changes, and seeds the initial value at view
creation. The decoration plugin in `src/editor/decorations/framework.ts`
gained an optional `rebuildOn: StateEffectType<unknown>[]` parameter
so the image visitor can declare a dependency on `setDocPath`:

```ts
export function imageDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Image'],
    rebuildOn: [setDocPath],   // ← re-resolve when the doc path changes
    visit(builder, { from, to, lineActive, doc, node, view }) {
      if (!shouldHideMarker(view.state, lineActive)) return;
      const parts = partsFromImage(node, doc);
      if (!parts) return;
      const resolved = resolveImageSrc(parts.src, currentDocPath(view.state));
      builder.add(from, to, Decoration.replace({
        widget: new ImageWidget(parts.alt, parts.src, resolved),
        block: false,
      }));
    },
  });
}
```

The URL classification lives in `src/utils/resolveImageSrc.ts`:

```ts
export function resolveImageSrc(src: string, docPath: string | null): string {
  if (!src) return src;
  if (isUrlLike(src)) return src;                  // http: / data: / blob: / durumi-asset: passthrough
  if (isAbsolutePath(src)) return assetUrlFor(src); // POSIX, drive letter, UNC
  if (!docPath) return src;                        // unsaved buffer — let the <img> fail
  const abs = joinPath(dirnameOf(docPath), src);
  return assetUrlFor(abs);
}
```

The no-`docPath` fallback intentionally returns the original string.
For a new unsaved buffer the image cannot be addressed yet; the
broken `<img>` is the correct UX cue ("save the file first").

### 5.2 The path guard rejected the asset

**Cause.** v0.2.1's `pathGuard.ts` allowed paths in three sets:

- Session allowlist — paths returned by main-side dialogs this session.
- Workspace folders — `prefs.workspaceFolders` descendants.
- Recent files — `prefs.recentFiles`, **exact match only**.

A freshly-pasted image at `<doc_dir>/assets/img-….png` failed all
three:

- Not dialog-returned (it was written by `image:save`).
- Not inside a workspace folder if the user opened the doc directly
  via Recent rather than as part of a workspace.
- Not an exact match for any recent-files entry (only the `.md`
  itself was).

The protocol handler 403'd with `path-not-allowed`. The same bug
also surfaced for any sibling asset of a doc opened via the Recent
Files menu.

**Fix.** `electron/pathGuard.ts` gained a fourth trust source —
session-trusted directory trees — plus a startup bootstrap from
recent files:

```ts
const sessionAllowedTrees = new Set<string>();

export function allowSessionPath(absPath: string): void {
  if (!absPath) return;
  const r = resolve(absPath);
  sessionAllowed.add(r);
  const parent = dirname(r);
  if (parent && parent !== r) sessionAllowedTrees.add(parent);
}

export function allowSessionTree(absDir: string): void {
  if (!absDir) return;
  sessionAllowedTrees.add(resolve(absDir));
}

export async function bootstrapSessionTreesFromRecents(): Promise<void> {
  const prefs = await prefsReader();
  for (const rf of prefs.recentFiles ?? []) {
    const parent = dirname(resolve(rf));
    if (parent) sessionAllowedTrees.add(parent);
  }
}
```

`isAllowedPath` now checks `sessionAllowedTrees` with the same
`startsWith(root + sep)` prefix match as workspace folders, so
`/foo` does not accidentally trust `/foo-clone/file`.

The bootstrap runs once at `app.whenReady()` after preferences load.
Cold starts now reach a recent doc's assets without the user having
to add the folder as a workspace.

**Trust-scope reasoning.** Opening a document is an *intent signal*
that the user trusts the surrounding directory. Markdown editors
uniformly assume nearby `assets/`, `figs/`, `images/` folders are
reachable — Typora, Obsidian, iA Writer all behave this way. Matching
that assumption keeps the guard from blocking legitimate workflows
while still rejecting `/etc/passwd` and any absolute path a
compromised renderer might construct.

### 5.3 CSP blocked the custom scheme

**Cause.** `index.html` had:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; img-src 'self' data: file: https:; ..." />
```

`durumi-asset:` is not in the `img-src` list. Electron 31 enforces
meta-tag CSP on `<img>` loads **regardless** of the scheme's
`secure: true` / `supportFetchAPI: true` privileges. With
`sandbox: true` there is no renderer-side fallback path the way
there might be in a less-locked-down configuration. The request
was blocked before it ever reached the protocol handler — which is
why no entry appeared in `asset-protocol.log`.

This is also why the renderer's diagnostic instrumentation alone
wasn't enough to find the bug: `<img onerror>` does fire on CSP
block, but the error event carries no information about *why* the
load failed.

**Fix.** One line in `index.html`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; img-src 'self' data: file: https: durumi-asset:; ..." />
```

The custom-scheme requests now reach the main-side protocol handler,
where the path guard is the final authority. CSP is the renderer
boundary; the path guard is the disk boundary. Both matter.

**Generalisation.** Any future asset-type media (PDF preview, video,
audio) that uses `durumi-asset://` must extend the appropriate CSP
directive:

| Media | CSP directive to extend |
|---|---|
| `<img>` (PNG/JPEG/GIF/WebP/AVIF/SVG/BMP/ICO/TIFF) | `img-src` |
| `<video>` / `<audio>` | `media-src` |
| `<iframe>` (PDF.js, embeds) | `frame-src` |
| `fetch()` (programmatic load) | `connect-src` |

If a maintainer adds a new media type and forgets to extend the CSP,
the failure will be silent. The contract is captured in §6 below.

### 5.4 Chromium normalised `%2F` in the URL pathname

**Cause.** The first-attempt URL shape was:

```
durumi-asset:///<encodeURIComponent(absPath)>
```

With `standard: true` privilege, Chromium's URL parser treats the
scheme as a hierarchical URL (RFC 3986 `path-abempty`) and normalises
the pathname before the handler sees it. That normalisation
**silently decodes `%2F` back to `/`**. Encoding the absolute path
`/Users/min/Documents/…` as `%2FUsers%2Fmin%2FDocuments%2F…` and
embedding it as the pathname gave us, after the parser's pass:

```
durumi-asset:///Users/min/Documents/...
```

…where `Users` is now interpreted as a path segment, not a literal
character. The absolute-path indicator (the leading slash) is gone,
and the handler's `decodeURIComponent(request.url.slice(prefix.length))`
got back a string that no longer round-tripped.

**Fix.** Move the absolute path into the URL **query string**:

```ts
export function assetUrlFor(absPath: string): string {
  return `${ASSET_SCHEME}://x/?p=${encodeURIComponent(absPath)}`;
}
```

The query string is treated as opaque by the parser — percent
encoding survives the round trip. The handler reads the path with
`url.searchParams.get('p')` which returns the already-decoded value.

The `x` host segment is a placeholder. Standard schemes require an
authority (`scheme://authority/path`); without one, the parser
treats `durumi-asset:?p=…` as an opaque non-hierarchical URL and
strips the query. The hostname `x` is meaningless to the handler but
satisfies the parser. Any single letter would do; `x` was chosen
because it visually flags "this is not a real host".

**Why this is fragile.** A future Chromium version *could*
normalise query parameters too (RFC 3986 doesn't forbid it). The
right defence is the regression test in
`tests/utils/resolveImageSrc.test.ts` that asserts a URL with a
deliberately-traversal-shaped path round-trips through `assetUrlFor`
and `new URL(...).searchParams.get('p')` unchanged. If Chromium ever
breaks this, the test will catch it before users do.

---

## 6. Invariants — the contract going forward

Any future maintainer who touches the renderer-to-disk image pipeline
must keep these invariants intact. They are listed in order of
"how silently does the bug fail if you break this".

### 6.1 The image widget MUST go through `resolveImageSrc`

Never set `<img src>` to a raw markdown URL. The widget's `toDOM()`
method must read from a pre-resolved URL computed at decoration-build
time:

```ts
img.src = this.resolved;     // ← the resolved durumi-asset:// URL
img.dataset.mdSrc = this.src; // ← keep the original for DevTools inspection
```

If you find yourself writing `img.src = parts.src` anywhere, stop.
That is the v0.1.2 → v0.2.1 bug.

### 6.2 The `durumi-asset://` URL shape is `durumi-asset://x/?p=<encoded-abs-path>`

The path lives in the **query string**, NOT the pathname. Changing
the shape requires re-testing on a production DMG/EXE (not just
vite dev); the `%2F` pathname normalisation does not manifest in
vitest. The single source of truth for the shape is
`shared/assetProtocol.ts::assetUrlFor`. The reverse — extracting
the path in the handler — is `url.searchParams.get('p')`.

### 6.3 CSP `img-src` MUST include `durumi-asset:`

`index.html`'s meta CSP gates every `<img>` load *before* the
request reaches main. If a future maintainer adds a new asset-type
media (PDF preview, video), they must extend the corresponding CSP
directive (`media-src`, `frame-src`, `connect-src`). Forgetting this
results in silent load failures with no main-side log entry.

### 6.4 Path guard `allowSessionPath(p)` MUST keep the dir-trust extension

`allowSessionPath(p)` registers both `p` (in `sessionAllowed`) and
`dirname(p)` (in `sessionAllowedTrees`). Tightening this back to
exact-match would silently break image rendering on a fresh document
save. The five dialog handlers that call `allowSessionPath`
(`file:open`, `file:saveAs`, `export:file`, `dialog:openFolder`,
`dialog:pickFile`, `pandoc:pickCustomPath`, `pandoc:import`,
`pandoc:export`) all benefit from the dir-trust extension for free.

### 6.5 `bootstrapSessionTreesFromRecents()` MUST run inside `app.whenReady()`

Before any window is shown. If a maintainer reorders the main-process
boot sequence and this call gets dropped or moved past window
creation, cold starts will fail to render images in recently-opened
documents until the user re-adds the folder as a workspace.
Idempotency is in the function — calling it multiple times is safe;
not calling it at all is the failure mode.

### 6.6 `protocol.registerSchemesAsPrivileged` MUST be called before `app.whenReady()` resolves

This is an Electron API contract, not a Durumi-specific one — but
worth restating here because forgetting it produces a non-obvious
failure: the scheme exists but lacks the `standard`, `secure`,
`supportFetchAPI`, `stream` privileges, so the renderer treats it as
opaque/insecure and either downgrades it or blocks fetch entirely.

---

## 7. How to verify image rendering

When debugging a suspected image-rendering regression, walk these
steps in order. Each one rules out one root-cause class.

### 7.1 Confirm the markdown is what you expect

In Source mode, look at the actual text. The markdown URL should
be a relative path like `assets/img-….png` (image pasted in) or an
absolute path like `/Users/…/image.png` (drag-drop from elsewhere)
or an `http://` / `https://` URL (remote image).

### 7.2 Switch to Document mode and open DevTools

View → Toggle Developer Tools (always visible since v0.2.2,
including in packaged builds). Inspect the `<img>` element:

```html
<img class="cm-md-image" alt="..."
     data-md-src="assets/img-….png"
     data-resolved-src="durumi-asset://x/?p=%2FUsers%2F…%2Fassets%2Fimg-….png"
     src="durumi-asset://x/?p=%2FUsers%2F…%2Fassets%2Fimg-….png">
```

If `data-resolved-src` is the same as `data-md-src`, `resolveImageSrc`
returned the input unchanged. Either the input was a URL we
pass-through, or the doc has no `docPath` (new unsaved buffer).

### 7.3 Check the Network panel

Filter by `durumi-asset:`. You should see one request per image.

- **Status (failed)** with no message — likely CSP block. Check
  `index.html`'s `img-src`.
- **Status 403** — path guard rejection. Check
  `<userData>/asset-protocol.log`.
- **Status 404** — file doesn't exist on disk. The `resolveImageSrc`
  output was constructed but pointed at the wrong directory; check
  the `docPath` value.
- **Status 200** — success. If the `<img>` still doesn't render, the
  content-type might be wrong (see `MIME_BY_EXT` in
  `electron/assetProtocol.ts`).

### 7.4 Read the asset-protocol log

```bash
# macOS
cat ~/Library/Application\ Support/durumi/asset-protocol.log
# Windows
type %APPDATA%\durumi\asset-protocol.log
# Linux
cat ~/.config/durumi/asset-protocol.log
```

Each non-success response appends one timestamped line. Success
responses are not logged. If you expect a load and see no entry in
the log, the handler is not being called — almost certainly CSP or
URL-parse failure.

### 7.5 Check the docPath StateField

In DevTools console with the editor focused:

```js
window.__cm_view.state.field(window.__cm_docPathField)
```

…will return the current `docPath` value or `null`. (The helper is
not wired by default; if you need this, expose the view and the
field via `window` for the duration of the debug session.) `null`
for a saved file indicates that `MarkdownEditor`'s `useEffect` did
not dispatch `setDocPath` — check the prop wiring.

---

## 8. Cross-references

### Source files

| Concern | Path |
|---|---|
| Scheme name + `assetUrlFor` | [`shared/assetProtocol.ts`](../shared/assetProtocol.ts) |
| Protocol handler + privileges | [`electron/assetProtocol.ts`](../electron/assetProtocol.ts) |
| Path guard + dir-trust | [`electron/pathGuard.ts`](../electron/pathGuard.ts) |
| URL classification | [`src/utils/resolveImageSrc.ts`](../src/utils/resolveImageSrc.ts) |
| `docPath` StateField | [`src/editor/docPath.ts`](../src/editor/docPath.ts) |
| Image widget | [`src/editor/decorations/image.ts`](../src/editor/decorations/image.ts) |
| `rebuildOn` plugin framework | [`src/editor/decorations/framework.ts`](../src/editor/decorations/framework.ts) |
| CSP `img-src` whitelist | [`index.html`](../index.html) |

### Test coverage

| Concern | Path |
|---|---|
| URL classification + traversal attempt | [`tests/utils/resolveImageSrc.test.ts`](../tests/utils/resolveImageSrc.test.ts) |
| Path guard dir-trust | [`tests/electron/pathGuard.test.ts`](../tests/electron/pathGuard.test.ts) |

### Related docs

| Topic | Path |
|---|---|
| v0.2 hardening ledger | [`docs/v0.2-hardening.md`](v0.2-hardening.md) |
| v0.2.2 release notes | [`docs/PROGRESS.md`](PROGRESS.md) |
| Release runbook | [`docs/RELEASE.md`](RELEASE.md) |
| Architectural invariants | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |

---

## 9. Open questions / future work

- **PDF preview** as `durumi-asset://` consumer. The handler already
  knows `.pdf` MIME; PDF.js needs `frame-src` extended in the CSP.
- **Video / audio embeds**. Same pattern: extend `media-src`, write
  a test that round-trips a `.mp4` through the handler.
- **Asset URL caching.** Currently every decoration rebuild recomputes
  `resolveImageSrc(parts.src, docPath)`. The widget's `eq()` already
  short-circuits when the resolved URL is unchanged, but the
  recomputation itself is cheap (path join + URI encode); not worth
  caching yet.
- **Cross-document image references** (one doc embeds another doc's
  asset). Currently relative paths join against the *embedding*
  doc's directory, which is correct for the local case. Cross-doc
  embeds would need the `![alt](other-doc/assets/x.png)` form, which
  works today because the join is purely lexical. Worth a regression
  test the next time someone touches this.

---

*This document is the engineering case study, not a user-facing
release note. For the user-facing release summary see
[`docs/PROGRESS.md` v0.2.2](PROGRESS.md). For the v0.2.x hardening
roadmap see [`docs/v0.2-hardening.md`](v0.2-hardening.md).*
