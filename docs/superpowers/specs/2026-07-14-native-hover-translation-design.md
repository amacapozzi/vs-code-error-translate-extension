# Native Hover Translation — Design

Date: 2026-07-14

## Problem

`ErrorTranslateHoverProvider` (existing) only translates VS Code **diagnostic**
messages (errors/warnings/hints) shown on hover. It does not touch the
**native documentation hover** that other extensions/language servers
contribute (e.g. Go's `gopls` showing a function signature + doc comment when
hovering `os.ReadDir`). The user wants that content translated into the
configured target language too, replacing the original (not appended).

## Goals

- Translate the prose in native hover tooltips from other extensions into
  `errorTranslate.targetLanguage`, using the already-configured translation
  provider.
- Replace the original hover content (no side-by-side original+translation).
- Keep it independently toggleable from diagnostic translation.
- Preserve code blocks (fenced with ` ``` `) untouched — only translate prose.
- Reuse the existing `TranslationService` cache — no duplicate API calls for
  identical text.
- Never leave the user without info: if translation fails, fall back to the
  original untranslated content for that hover.

## Non-goals

- Translating inline single-backtick code spans separately from surrounding
  prose (out of scope; consistent with the existing simple `codeify()`
  approach in `hoverProvider.ts`).
- Per-language exclusion lists / allowlists for which hover providers to
  translate.
- Any UI beyond the existing status bar warning pattern.

## Architecture

A second `vscode.HoverProvider`, `NativeHoverTranslateProvider`, registered
alongside the existing `ErrorTranslateHoverProvider` on the same `'*'`
selector. VS Code merges hover contributions from multiple providers that
match a position into a single popup, so both can contribute to the same
hover.

### Fetching third-party hover content

`NativeHoverTranslateProvider.provideHover` calls the built-in command
`vscode.executeHoverProvider` with the document URI and position. This
command invokes **every** hover provider registered for that position —
including our own two providers — and returns their combined `Hover[]`.

### Recursion / duplicate-translation guard

Because `executeHoverProvider` re-invokes our own providers, a module-level
reentrancy flag (`isInternalFetch`, in a small shared module e.g.
`src/hoverFetchGuard.ts`) is set to `true` immediately before the internal
`executeHoverProvider` call and reset to `false` in a `finally` block. Both
`ErrorTranslateHoverProvider` and `NativeHoverTranslateProvider` check this
flag at the top of `provideHover` and return `undefined` immediately when it
is `true`. This ensures the internal fetch only returns hovers from
third-party providers (gopls, TS, etc.), with no recursion and no
re-translation of our own already-translated diagnostic hover.

### Markdown segmentation

A new pure utility, `src/markdownSegments.ts`, exports:

```ts
type Segment = { type: 'code' | 'prose'; text: string };
function splitCodeAndProse(markdown: string): Segment[];
```

It splits on fenced code blocks (` ```lang\n...\n``` `), returning alternating
`code` (untouched) and `prose` (to be translated) segments. Pure function, no
VS Code dependency — tested standalone.

### Translation flow (per hover from `executeHoverProvider`)

1. Early-out: if `errorTranslate.hoverDocs.enabled` is `false`, return
   `undefined` without calling `executeHoverProvider` at all (avoids the
   internal fetch overhead entirely when the feature is off).
2. Set guard flag, call `vscode.executeHoverProvider`, reset guard flag in
   `finally`.
3. For each returned `Hover`, for each `MarkdownString` content:
   a. `splitCodeAndProse(content.value)`.
   b. Translate all `prose` segments **in parallel** via
      `Promise.all(segments.map(s => translationService.translate(s.text)))`
      — not sequential, to avoid stacking latency per paragraph.
   c. Reassemble the segments in original order (code untouched, prose
      replaced by its translation) into one new `MarkdownString`
      (`isTrusted`/`supportHtml`/`supportThemeIcons` mirrored from the
      diagnostic hover provider's settings for visual consistency).
4. If step 3 throws for a given `Hover`, fall back to that `Hover`'s
   original, untranslated content — log the error to the shared
   `OutputChannel`, same pattern as `hoverProvider.ts`.
5. `provideHover` must return a single `Hover`. If multiple third-party
   hovers matched the position, translate each independently (per steps
   3a-3c) and concatenate their reassembled contents into one `Hover` using
   `<hr>` as a separator between entries — the same joining pattern
   `ErrorTranslateHoverProvider` already uses for multiple diagnostics.

### Shared `TranslationService`

`extension.ts`'s `register()` builds one `TranslationService` instance and
passes the **same instance** to both hover providers, so the cache
(`provider:lang:text`) is shared — hovering the same doc twice, or a
diagnostic message that happens to match doc text, never re-hits the API.

## Settings

New configuration property in `package.json`:

```json
"errorTranslate.hoverDocs.enabled": {
  "type": "boolean",
  "default": true,
  "description": "Translate hover documentation from other extensions (e.g. language servers) into the target language"
}
```

Independent from `errorTranslate.enabled` (which gates the whole extension)
and from diagnostic translation — matches the earlier decision to keep this
separately toggleable.

## Error handling

- Translation failure for a given hover → fall back to that hover's original
  content, log via the shared `OutputChannel` (`[error-translate] ...`),
  consistent with existing `hoverProvider.ts` behavior.
- No diagnostics / no third-party hovers at the position → provider returns
  `undefined`, same as today.
- `hoverDocs.enabled=false` → provider returns `undefined` immediately, no
  internal fetch triggered.

## Testing plan

- `src/markdownSegments.test.ts` — pure unit tests, no VS Code mocks: fence
  detection, multiple fences, no fences (all prose), fence-only (no prose),
  unterminated fence edge case.
- `src/nativeHoverProvider.test.ts` — mirrors `hoverProvider.test.ts`'s
  mocking style (`src/__mocks__/vscode.ts`), mocking
  `vscode.commands.executeCommand` to return canned `Hover[]` results.
  Cases: prose translated / code preserved, reentrancy guard returns
  `undefined` when internal flag is set, `hoverDocs.enabled=false` skips
  fetch entirely, translation failure falls back to original content,
  multiple third-party hovers combined.
- Existing `extension.test.ts` extended to assert both hover providers are
  registered in `register()`.

## Open questions

None — all decisions confirmed with the user during brainstorming
(2026-07-14).
