# Native Hover Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the native documentation hover contributed by other extensions/language servers (e.g. Go's `gopls` function-signature hover) into the user's configured target language, replacing the original content, while leaving fenced code blocks untouched.

**Architecture:** A second `vscode.HoverProvider` (`NativeHoverTranslateProvider`) is registered alongside the existing diagnostic-translating `ErrorTranslateHoverProvider`. It fetches third-party hover content via the built-in `vscode.executeHoverProvider` command, splits each hover's markdown into code/prose segments, translates the prose segments in parallel through the shared `TranslationService`, and reassembles a new `Hover`. A module-level reentrancy guard prevents `executeHoverProvider` from recursively re-invoking our own two hover providers.

**Tech Stack:** TypeScript, VS Code Extension API, Jest + ts-jest, esbuild. No new npm dependencies.

## Global Constraints

- Follow existing file/test co-location pattern: `src/foo.ts` + `src/foo.test.ts`.
- Existing `vscode` mock lives at `src/__mocks__/vscode.ts` and is mapped via `moduleNameMapper` in `jest.config.js` — extend it, don't bypass it.
- TDD: write the failing test before the implementation for every task.
- `errorTranslate.hoverDocs.enabled` default is `true` (per approved spec `docs/superpowers/specs/2026-07-14-native-hover-translation-design.md`).
- Translation failures must fall back to original, untranslated content — never throw out of `provideHover`.
- Code fences (` ``` ... ``` `) must never be sent to the translation provider.
- Reuse the single shared `TranslationService` instance across both hover providers (same cache).

---

### Task 1: `markdownSegments.ts` — code/prose splitter

**Files:**
- Create: `src/markdownSegments.ts`
- Test: `src/markdownSegments.test.ts`

**Interfaces:**
- Produces: `export interface Segment { type: 'code' | 'prose'; text: string }` and `export function splitCodeAndProse(markdown: string): Segment[]`. Later tasks (Task 3) import both from `./markdownSegments`.

- [ ] **Step 1: Write the failing tests**

Create `src/markdownSegments.test.ts`:

```ts
import { splitCodeAndProse } from './markdownSegments';

describe('splitCodeAndProse', () => {
  it('returns a single prose segment when there is no code fence', () => {
    const result = splitCodeAndProse('ReadDir reads the named directory.');
    expect(result).toEqual([
      { type: 'prose', text: 'ReadDir reads the named directory.' }
    ]);
  });

  it('extracts a single fenced code block with no surrounding prose', () => {
    const md = '```go\nfunc os.ReadDir(name string) ([]os.DirEntry, error)\n```';
    const result = splitCodeAndProse(md);
    expect(result).toEqual([
      { type: 'code', text: md }
    ]);
  });

  it('splits prose before and after a single code fence', () => {
    const md = 'Before text\n```go\ncode here\n```\nAfter text';
    const result = splitCodeAndProse(md);
    expect(result).toEqual([
      { type: 'prose', text: 'Before text\n' },
      { type: 'code', text: '```go\ncode here\n```' },
      { type: 'prose', text: '\nAfter text' }
    ]);
  });

  it('handles multiple fenced blocks interleaved with prose', () => {
    const md = 'A\n```\ncode1\n```\nB\n```\ncode2\n```\nC';
    const result = splitCodeAndProse(md);
    expect(result).toEqual([
      { type: 'prose', text: 'A\n' },
      { type: 'code', text: '```\ncode1\n```' },
      { type: 'prose', text: '\nB\n' },
      { type: 'code', text: '```\ncode2\n```' },
      { type: 'prose', text: '\nC' }
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(splitCodeAndProse('')).toEqual([]);
  });

  it('treats an unterminated fence as trailing prose', () => {
    const md = 'Before\n```go\nno closing fence';
    const result = splitCodeAndProse(md);
    expect(result).toEqual([
      { type: 'prose', text: 'Before\n```go\nno closing fence' }
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest markdownSegments.test.ts`
Expected: FAIL with `Cannot find module './markdownSegments'`.

- [ ] **Step 3: Implement `splitCodeAndProse`**

Create `src/markdownSegments.ts`:

```ts
export interface Segment {
  type: 'code' | 'prose';
  text: string;
}

const FENCE_REGEX = /```[\s\S]*?```/g;

export function splitCodeAndProse(markdown: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  FENCE_REGEX.lastIndex = 0;
  while ((match = FENCE_REGEX.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'prose', text: markdown.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', text: match[0] });
    lastIndex = FENCE_REGEX.lastIndex;
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: 'prose', text: markdown.slice(lastIndex) });
  }

  return segments;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest markdownSegments.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/markdownSegments.ts src/markdownSegments.test.ts
git commit -m "feat: add markdown code/prose segment splitter"
```

---

### Task 2: `hoverFetchGuard.ts` — reentrancy guard

**Files:**
- Create: `src/hoverFetchGuard.ts`
- Test: `src/hoverFetchGuard.test.ts`

**Interfaces:**
- Produces: `export function isInternalFetch(): boolean` and `export async function withInternalFetchGuard<T>(fn: () => Promise<T>): Promise<T>`. Task 3 uses `withInternalFetchGuard` around the `executeHoverProvider` call; Task 3 and Task 4 both call `isInternalFetch()` at the top of `provideHover`.

- [ ] **Step 1: Write the failing tests**

Create `src/hoverFetchGuard.test.ts`:

```ts
import { isInternalFetch, withInternalFetchGuard } from './hoverFetchGuard';

describe('hoverFetchGuard', () => {
  it('reports false when no fetch is in progress', () => {
    expect(isInternalFetch()).toBe(false);
  });

  it('reports true while the guarded function runs', async () => {
    let observedDuringRun = false;

    await withInternalFetchGuard(async () => {
      observedDuringRun = isInternalFetch();
      return 'result';
    });

    expect(observedDuringRun).toBe(true);
  });

  it('resets to false after the guarded function resolves', async () => {
    await withInternalFetchGuard(async () => 'result');
    expect(isInternalFetch()).toBe(false);
  });

  it('resets to false after the guarded function throws', async () => {
    await expect(
      withInternalFetchGuard(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(isInternalFetch()).toBe(false);
  });

  it('returns the value produced by the guarded function', async () => {
    const result = await withInternalFetchGuard(async () => 42);
    expect(result).toBe(42);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest hoverFetchGuard.test.ts`
Expected: FAIL with `Cannot find module './hoverFetchGuard'`.

- [ ] **Step 3: Implement the guard**

Create `src/hoverFetchGuard.ts`:

```ts
let internalFetchInProgress = false;

export function isInternalFetch(): boolean {
  return internalFetchInProgress;
}

export async function withInternalFetchGuard<T>(fn: () => Promise<T>): Promise<T> {
  internalFetchInProgress = true;
  try {
    return await fn();
  } finally {
    internalFetchInProgress = false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest hoverFetchGuard.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hoverFetchGuard.ts src/hoverFetchGuard.test.ts
git commit -m "feat: add reentrancy guard for internal hover fetches"
```

---

### Task 3: Extend vscode mock + `NativeHoverTranslateProvider`

**Files:**
- Modify: `src/__mocks__/vscode.ts`
- Create: `src/nativeHoverProvider.ts`
- Test: `src/nativeHoverProvider.test.ts`

**Interfaces:**
- Consumes: `Segment`, `splitCodeAndProse` from `./markdownSegments` (Task 1); `isInternalFetch`, `withInternalFetchGuard` from `./hoverFetchGuard` (Task 2); `TranslationService` (existing, `translate(text: string): Promise<string>`).
- Produces: `export class NativeHoverTranslateProvider implements vscode.HoverProvider` with constructor `(translationService: TranslationService, outputChannel: vscode.OutputChannel, hoverDocsEnabled: boolean)` and method `provideHover(document, position): Promise<vscode.Hover | undefined>`. Task 5 imports `NativeHoverTranslateProvider` from `./nativeHoverProvider` and constructs it with those three args.

- [ ] **Step 1: Add `commands.executeCommand` to the vscode mock**

Modify `src/__mocks__/vscode.ts` — add a `commands` key to the exported object (after the `workspace` key):

```ts
  commands: {
    executeCommand: jest.fn()
  },
```

The full `languages` key stays as-is; this is a new top-level sibling key.

- [ ] **Step 2: Write the failing tests**

Create `src/nativeHoverProvider.test.ts`:

```ts
import * as vscode from 'vscode';
import { NativeHoverTranslateProvider } from './nativeHoverProvider';

const mockTranslationService = { translate: jest.fn(), clearCache: jest.fn() };
const mockOutputChannel = { appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn() };

const makeDocument = () => ({ uri: { toString: () => 'file:///test.go' } } as any as vscode.TextDocument);
const makePosition = () => ({} as vscode.Position);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NativeHoverTranslateProvider', () => {
  it('returns undefined without fetching when hoverDocs is disabled', async () => {
    const provider = new NativeHoverTranslateProvider(mockTranslationService as any, mockOutputChannel as any, false);
    const result = await provider.provideHover(makeDocument(), makePosition());

    expect(result).toBeUndefined();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('returns undefined when no third-party hovers are found', async () => {
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValueOnce([]);

    const provider = new NativeHoverTranslateProvider(mockTranslationService as any, mockOutputChannel as any, true);
    const result = await provider.provideHover(makeDocument(), makePosition());

    expect(result).toBeUndefined();
  });

  it('translates prose and preserves a fenced code block', async () => {
    const md = new (vscode as any).MarkdownString(
      'ReadDir reads the named directory.\n```go\nfunc os.ReadDir(name string) ([]os.DirEntry, error)\n```'
    );
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValueOnce([
      new (vscode as any).Hover([md])
    ]);
    mockTranslationService.translate.mockResolvedValueOnce('ReadDir lee el directorio indicado.\n');

    const provider = new NativeHoverTranslateProvider(mockTranslationService as any, mockOutputChannel as any, true);
    const result = await provider.provideHover(makeDocument(), makePosition());

    expect(result).toBeDefined();
    expect(mockTranslationService.translate).toHaveBeenCalledWith('ReadDir reads the named directory.\n');
    const rendered = (result as any).contents.value as string;
    expect(rendered).toContain('ReadDir lee el directorio indicado.');
    expect(rendered).toContain('func os.ReadDir(name string) ([]os.DirEntry, error)');
  });

  it('calls executeCommand wrapped by the internal fetch guard', async () => {
    const { isInternalFetch } = require('./hoverFetchGuard');
    (vscode.commands.executeCommand as jest.Mock).mockImplementationOnce(async () => {
      expect(isInternalFetch()).toBe(true);
      return [];
    });

    const provider = new NativeHoverTranslateProvider(mockTranslationService as any, mockOutputChannel as any, true);
    await provider.provideHover(makeDocument(), makePosition());

    expect(isInternalFetch()).toBe(false);
  });

  it('returns undefined immediately when called during an internal fetch', async () => {
    const { withInternalFetchGuard } = require('./hoverFetchGuard');
    const provider = new NativeHoverTranslateProvider(mockTranslationService as any, mockOutputChannel as any, true);

    let nestedResult: vscode.Hover | undefined = { contents: [] } as any;
    await withInternalFetchGuard(async () => {
      nestedResult = await provider.provideHover(makeDocument(), makePosition());
      return undefined;
    });

    expect(nestedResult).toBeUndefined();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('falls back to original content and logs when translation throws', async () => {
    const md = new (vscode as any).MarkdownString('ReadDir reads the named directory.');
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValueOnce([
      new (vscode as any).Hover([md])
    ]);
    mockTranslationService.translate.mockRejectedValueOnce(new Error('API timeout'));

    const provider = new NativeHoverTranslateProvider(mockTranslationService as any, mockOutputChannel as any, true);
    const result = await provider.provideHover(makeDocument(), makePosition());

    expect(result).toBeDefined();
    const rendered = (result as any).contents.value as string;
    expect(rendered).toContain('ReadDir reads the named directory.');
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('API timeout')
    );
  });

  it('joins multiple third-party hovers with <hr>', async () => {
    const mdA = new (vscode as any).MarkdownString('First hover text.');
    const mdB = new (vscode as any).MarkdownString('Second hover text.');
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValueOnce([
      new (vscode as any).Hover([mdA]),
      new (vscode as any).Hover([mdB])
    ]);
    mockTranslationService.translate
      .mockResolvedValueOnce('Primer texto.')
      .mockResolvedValueOnce('Segundo texto.');

    const provider = new NativeHoverTranslateProvider(mockTranslationService as any, mockOutputChannel as any, true);
    const result = await provider.provideHover(makeDocument(), makePosition());

    const rendered = (result as any).contents.value as string;
    expect(rendered).toContain('Primer texto.');
    expect(rendered).toContain('Segundo texto.');
    expect(rendered).toContain('<hr>');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest nativeHoverProvider.test.ts`
Expected: FAIL with `Cannot find module './nativeHoverProvider'`.

- [ ] **Step 4: Implement `NativeHoverTranslateProvider`**

Create `src/nativeHoverProvider.ts`:

```ts
import * as vscode from 'vscode';
import { TranslationService } from './translationService';
import { isInternalFetch, withInternalFetchGuard } from './hoverFetchGuard';
import { splitCodeAndProse } from './markdownSegments';

export class NativeHoverTranslateProvider implements vscode.HoverProvider {
  constructor(
    private readonly translationService: TranslationService,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly hoverDocsEnabled: boolean
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    if (isInternalFetch() || !this.hoverDocsEnabled) {
      return undefined;
    }

    const hovers = await withInternalFetchGuard(() =>
      vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        document.uri,
        position
      )
    );

    if (!hovers || hovers.length === 0) {
      return undefined;
    }

    const parts: string[] = [];
    for (let i = 0; i < hovers.length; i++) {
      if (i > 0) {
        parts.push('<hr>');
      }
      parts.push(await this.translateHoverContents(hovers[i]));
    }

    const md = new vscode.MarkdownString(parts.join(''));
    md.isTrusted = true;
    md.supportHtml = true;
    md.supportThemeIcons = true;

    return new vscode.Hover(md);
  }

  private async translateHoverContents(hover: vscode.Hover): Promise<string> {
    const rendered: string[] = [];

    for (const content of hover.contents) {
      const markdown = typeof content === 'string' ? content : (content as vscode.MarkdownString).value;

      try {
        const segments = splitCodeAndProse(markdown);
        const translatedSegments = await Promise.all(
          segments.map(segment =>
            segment.type === 'code' || segment.text.trim() === ''
              ? Promise.resolve(segment.text)
              : this.translationService.translate(segment.text)
          )
        );
        rendered.push(translatedSegments.join(''));
      } catch (err) {
        this.outputChannel.appendLine(`[error-translate] Hover doc translation failed: ${err}`);
        rendered.push(markdown);
      }
    }

    return rendered.join('<br><br>');
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest nativeHoverProvider.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/__mocks__/vscode.ts src/nativeHoverProvider.ts src/nativeHoverProvider.test.ts
git commit -m "feat: add NativeHoverTranslateProvider for translating third-party hover docs"
```

---

### Task 4: Wire the guard into `ErrorTranslateHoverProvider`

**Files:**
- Modify: `src/hoverProvider.ts`
- Modify: `src/hoverProvider.test.ts`

**Interfaces:**
- Consumes: `isInternalFetch` from `./hoverFetchGuard` (Task 2).

- [ ] **Step 1: Write the failing test**

Add to `src/hoverProvider.test.ts` (inside the existing `describe('ErrorTranslateHoverProvider', ...)` block, alongside the other `it(...)` cases):

```ts
  it('returns undefined immediately during an internal hover fetch', async () => {
    const { withInternalFetchGuard } = require('./hoverFetchGuard');
    const diagnostic = {
      message: 'variable not used',
      severity: vscode.DiagnosticSeverity.Error,
      range: { contains: jest.fn().mockReturnValue(true) }
    };
    (vscode.languages.getDiagnostics as jest.Mock).mockReturnValue([diagnostic]);

    const provider = new ErrorTranslateHoverProvider(mockTranslationService as any, mockOutputChannel as any);

    let nestedResult: unknown = 'not-yet-set';
    await withInternalFetchGuard(async () => {
      nestedResult = await provider.provideHover(makeDocument(), makePosition());
      return undefined;
    });

    expect(nestedResult).toBeUndefined();
    expect(mockTranslationService.translate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest hoverProvider.test.ts -t "internal hover fetch"`
Expected: FAIL — `mockTranslationService.translate` is called (guard not yet checked), so the assertion fails.

- [ ] **Step 3: Add the guard check**

Modify `src/hoverProvider.ts` — add the import and the early-return at the top of `provideHover`:

```ts
import * as vscode from 'vscode';
import { TranslationService } from './translationService';
import { isInternalFetch } from './hoverFetchGuard';

export class ErrorTranslateHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly translationService: TranslationService,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    if (isInternalFetch()) {
      return undefined;
    }

    const diagnostics = vscode.languages
      .getDiagnostics(document.uri)
      .filter(d => d.range.contains(position));
```

(The rest of the file is unchanged — only the import line and the three-line guard check are added at the top of `provideHover`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest hoverProvider.test.ts`
Expected: PASS (6 tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/hoverProvider.ts src/hoverProvider.test.ts
git commit -m "fix: skip diagnostic hover provider during internal hover fetch"
```

---

### Task 5: Wire up `extension.ts` and the new setting

**Files:**
- Modify: `package.json`
- Modify: `src/extension.ts`
- Modify: `src/extension.test.ts`

**Interfaces:**
- Consumes: `NativeHoverTranslateProvider` from `./nativeHoverProvider` (Task 3).

- [ ] **Step 1: Add the setting to `package.json`**

In `package.json`, inside `contributes.configuration.properties`, add a new property after `errorTranslate.enabled`:

```json
        "errorTranslate.hoverDocs.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Translate hover documentation from other extensions (e.g. language servers) into the target language"
        },
```

- [ ] **Step 2: Write the failing tests**

Add to `src/extension.test.ts` (inside the existing `describe('activate / buildTranslationService', ...)` block):

```ts
  it('registers both hover providers when a valid provider is configured', () => {
    mockConfig({ provider: 'groq', 'groq.apiKey': 'test-key', enabled: true, 'hoverDocs.enabled': true });
    activate(makeContext());
    expect(vscode.languages.registerHoverProvider).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest extension.test.ts -t "registers both hover providers"`
Expected: FAIL — `registerHoverProvider` is currently called only once.

- [ ] **Step 4: Update `extension.ts`**

Modify `src/extension.ts`:

```ts
import * as vscode from 'vscode';
import { TranslationService } from './translationService';
import { ErrorTranslateHoverProvider } from './hoverProvider';
import { NativeHoverTranslateProvider } from './nativeHoverProvider';
import { GoogleTranslateProvider } from './providers/googleTranslate';
import { GroqProvider } from './providers/groq';
import { NvidiaNimProvider } from './providers/nvidiaNim';
import { DeepLProvider } from './providers/deepl';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Error Translate');
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(outputChannel, statusBar);

  let hoverDisposables: vscode.Disposable[] = [];

  const register = () => {
    hoverDisposables.forEach(d => d.dispose());
    hoverDisposables = [];
    statusBar.hide();

    const translationService = buildTranslationService(outputChannel, statusBar);
    if (!translationService) {
      return;
    }

    const config = vscode.workspace.getConfiguration('errorTranslate');
    const hoverDocsEnabled = config.get<boolean>('hoverDocs.enabled', true);

    const hoverProvider = new ErrorTranslateHoverProvider(translationService, outputChannel);
    const nativeHoverProvider = new NativeHoverTranslateProvider(
      translationService,
      outputChannel,
      hoverDocsEnabled
    );

    hoverDisposables.push(
      vscode.languages.registerHoverProvider('*', hoverProvider),
      vscode.languages.registerHoverProvider('*', nativeHoverProvider)
    );
    outputChannel.appendLine('[error-translate] Provider registered successfully');
  };

  register();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('errorTranslate')) {
        outputChannel.appendLine('[error-translate] Configuration changed, re-registering...');
        register();
      }
    }),
    { dispose: () => hoverDisposables.forEach(d => d.dispose()) }
  );
}

export function deactivate(): void {}
```

(`buildTranslationService` and `warnMissingKey` at the bottom of the file are unchanged — leave them exactly as they are.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest extension.test.ts`
Expected: PASS (5 tests, including the new one). The three pre-existing tests using `toHaveBeenCalledWith('*', expect.any(Object))` still pass because that assertion matches if *any* call matches, and one of the two `registerHoverProvider` calls always does.

- [ ] **Step 6: Commit**

```bash
git add package.json src/extension.ts src/extension.test.ts
git commit -m "feat: register native hover translation provider and add hoverDocs.enabled setting"
```

---

### Task 6: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx jest`
Expected: All test files PASS (0 failures).

- [ ] **Step 2: Type-check and build**

Run: `node esbuild.js`
Expected: `Build complete.` with no TypeScript errors.

- [ ] **Step 3: Repackage and reinstall the extension for manual smoke test**

Run:
```bash
npx vsce package --allow-missing-repository
code --install-extension error-translate-0.0.1.vsix
```
Expected: `Extension 'error-translate-0.0.1.vsix' was successfully installed.` Then reload the VS Code window (`Developer: Reload Window`) and hover over a symbol with native documentation (e.g. a Go stdlib call, if the Go extension is installed) to confirm the tooltip appears translated and the code signature line is unchanged.

- [ ] **Step 4: Commit the rebuilt package artifact status**

No commit needed for this task — `.vsix` and `dist/` are build artifacts. Confirm `.gitignore` already excludes them:

Run: `git status --porcelain`
Expected: no untracked `dist/` or `*.vsix` entries shown (already ignored per `.vscodeignore`/`.gitignore`).
