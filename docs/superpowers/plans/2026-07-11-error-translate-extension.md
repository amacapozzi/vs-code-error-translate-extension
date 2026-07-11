# Error Translate Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VS Code extension that translates diagnostic error/warning messages in real-time via a configurable AI or translation API, replacing the original English text in the hover tooltip.

**Architecture:** A `HoverProvider` registered for all languages intercepts hover events, fetches VS Code diagnostics at the cursor position, delegates translation to a `TranslationService` (with in-memory cache), and returns a new `vscode.Hover` with the translated text. The `TranslationService` routes to one of three interchangeable providers (Google Translate, Groq, NVIDIA NIM) based on the user's VS Code settings.

**Tech Stack:** TypeScript, VS Code Extension API (`@types/vscode`), native `fetch` (Node 18+), esbuild (bundler), Jest + ts-jest (tests)

## Global Constraints

- VS Code engine version: `^1.85.0`
- Node version: 18+ (native `fetch` required — no polyfills)
- Activation event: `onStartupFinished` (must not impact startup time)
- All API calls use native `fetch` — no axios or node-fetch
- All providers implement the same `TranslationProvider` interface
- Cache key format: `"{providerName}:{targetLang}:{errorMessage}"`
- If provider API key is missing, show status bar warning and skip registration
- On API failure, fall back to original English text and log to Output Channel

---

## File Map

| File | Purpose |
|---|---|
| `package.json` | Extension manifest, contributes/configuration schema, scripts |
| `tsconfig.json` | TypeScript compiler config |
| `jest.config.js` | Jest + ts-jest config, vscode module mock mapping |
| `esbuild.js` | Build script (bundle + watch) |
| `.vscodeignore` | Files excluded from `.vsix` package |
| `src/__mocks__/vscode.ts` | Jest mock for the `vscode` module |
| `src/providers/provider.ts` | `TranslationProvider` interface |
| `src/providers/googleTranslate.ts` | Google Translate REST v2 provider |
| `src/providers/googleTranslate.test.ts` | Unit tests for GoogleTranslate |
| `src/providers/groq.ts` | Groq chat completions provider |
| `src/providers/groq.test.ts` | Unit tests for Groq |
| `src/providers/nvidiaNim.ts` | NVIDIA NIM chat completions provider |
| `src/providers/nvidiaNim.test.ts` | Unit tests for NVIDIA NIM |
| `src/translationService.ts` | Cache + provider orchestration |
| `src/translationService.test.ts` | Unit tests for TranslationService |
| `src/hoverProvider.ts` | VS Code HoverProvider implementation |
| `src/hoverProvider.test.ts` | Unit tests for HoverProvider |
| `src/extension.ts` | Extension entry point, config reading, registration |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `esbuild.js`
- Create: `.vscodeignore`
- Create: `src/__mocks__/vscode.ts`

**Interfaces:**
- Produces: build pipeline (`npm run compile`), test runner (`npm test`), vscode mock used by all test files

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "error-translate",
  "displayName": "Error Translate",
  "description": "Translates VS Code diagnostic messages in real-time using AI APIs",
  "version": "0.0.1",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension",
  "contributes": {
    "configuration": {
      "title": "Error Translate",
      "properties": {
        "errorTranslate.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable or disable error translation"
        },
        "errorTranslate.targetLanguage": {
          "type": "string",
          "default": "es",
          "description": "ISO 639-1 language code for translations (e.g. 'es', 'fr', 'pt')"
        },
        "errorTranslate.provider": {
          "type": "string",
          "enum": ["google", "groq", "nvidia"],
          "default": "groq",
          "description": "Translation provider to use"
        },
        "errorTranslate.googleTranslate.apiKey": {
          "type": "string",
          "default": "",
          "description": "Google Translate API key"
        },
        "errorTranslate.groq.apiKey": {
          "type": "string",
          "default": "",
          "description": "Groq API key"
        },
        "errorTranslate.groq.model": {
          "type": "string",
          "default": "llama-3.1-8b-instant",
          "description": "Groq model to use"
        },
        "errorTranslate.nvidiaNim.apiKey": {
          "type": "string",
          "default": "",
          "description": "NVIDIA NIM API key"
        },
        "errorTranslate.nvidiaNim.model": {
          "type": "string",
          "default": "meta/llama-3.1-8b-instruct",
          "description": "NVIDIA NIM model to use"
        }
      }
    }
  },
  "scripts": {
    "compile": "node esbuild.js",
    "watch": "node esbuild.js --watch",
    "test": "jest",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.5",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^2.24.0",
    "esbuild": "^0.20.1",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.3.3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create `jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts'
  }
};
```

- [ ] **Step 4: Create `esbuild.js`**

```js
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    sourcemap: true,
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('Build complete.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 5: Create `.vscodeignore`**

```
.vscode/**
src/**
node_modules/**
docs/**
.gitignore
jest.config.js
tsconfig.json
esbuild.js
**/*.map
```

- [ ] **Step 6: Create `src/__mocks__/vscode.ts`**

```typescript
const vscode = {
  languages: {
    registerHoverProvider: jest.fn(),
    getDiagnostics: jest.fn()
  },
  window: {
    createStatusBarItem: jest.fn(() => ({
      text: '',
      tooltip: '',
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn()
    })),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn()
    }))
  },
  Hover: class {
    constructor(public contents: any) {}
  },
  MarkdownString: class {
    value: string = '';
    appendMarkdown(text: string) { this.value += text; return this; }
    constructor(value?: string) { this.value = value ?? ''; }
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2
  }
};

module.exports = vscode;
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` directory created with all packages.

- [ ] **Step 8: Verify TypeScript compiles (create a stub `src/extension.ts` first)**

```typescript
// src/extension.ts (stub — will be replaced in Task 7)
import * as vscode from 'vscode';
export function activate(_context: vscode.ExtensionContext): void {}
export function deactivate(): void {}
```

```bash
npm run compile
```

Expected: `dist/extension.js` created with no errors.

- [ ] **Step 9: Commit**

```bash
git init
git add package.json tsconfig.json jest.config.js esbuild.js .vscodeignore src/__mocks__/vscode.ts src/extension.ts
git commit -m "feat: scaffold VS Code extension project"
```

---

### Task 2: Provider interface + GoogleTranslate provider

**Files:**
- Create: `src/providers/provider.ts`
- Create: `src/providers/googleTranslate.ts`
- Create: `src/providers/googleTranslate.test.ts`

**Interfaces:**
- Produces: `TranslationProvider` interface with `translate(text: string, targetLang: string): Promise<string>`
- Produces: `GoogleTranslateProvider` class implementing `TranslationProvider`

- [ ] **Step 1: Create `src/providers/provider.ts`**

```typescript
export interface TranslationProvider {
  translate(text: string, targetLang: string): Promise<string>;
}
```

- [ ] **Step 2: Write failing tests in `src/providers/googleTranslate.test.ts`**

```typescript
import { GoogleTranslateProvider } from './googleTranslate';

const mockFetch = jest.fn();
beforeAll(() => { (global as any).fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe('GoogleTranslateProvider', () => {
  it('returns translated text from Google Translate API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { translations: [{ translatedText: 'texto traducido' }] }
      })
    });

    const provider = new GoogleTranslateProvider('test-key');
    const result = await provider.translate('sample text', 'es');

    expect(result).toBe('texto traducido');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('key=test-key'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ q: 'sample text', target: 'es', format: 'text' })
      })
    );
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });

    const provider = new GoogleTranslateProvider('bad-key');
    await expect(provider.translate('text', 'es')).rejects.toThrow('Google Translate error: 403');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=googleTranslate
```

Expected: FAIL — `Cannot find module './googleTranslate'`

- [ ] **Step 4: Create `src/providers/googleTranslate.ts`**

```typescript
import { TranslationProvider } from './provider';

interface GoogleTranslateResponse {
  data: {
    translations: Array<{ translatedText: string }>;
  };
}

export class GoogleTranslateProvider implements TranslationProvider {
  constructor(private readonly apiKey: string) {}

  async translate(text: string, targetLang: string): Promise<string> {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target: targetLang, format: 'text' })
    });

    if (!response.ok) {
      throw new Error(`Google Translate error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as GoogleTranslateResponse;
    return data.data.translations[0].translatedText;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=googleTranslate
```

Expected: PASS — 2 tests passing

- [ ] **Step 6: Commit**

```bash
git add src/providers/provider.ts src/providers/googleTranslate.ts src/providers/googleTranslate.test.ts
git commit -m "feat: add TranslationProvider interface and GoogleTranslate provider"
```

---

### Task 3: Groq provider

**Files:**
- Create: `src/providers/groq.ts`
- Create: `src/providers/groq.test.ts`

**Interfaces:**
- Consumes: `TranslationProvider` from `src/providers/provider.ts`
- Produces: `GroqProvider` class implementing `TranslationProvider`; base URL `https://api.groq.com/openai/v1/chat/completions`

- [ ] **Step 1: Write failing tests in `src/providers/groq.test.ts`**

```typescript
import { GroqProvider } from './groq';

const mockFetch = jest.fn();
beforeAll(() => { (global as any).fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe('GroqProvider', () => {
  it('returns trimmed translated text from Groq API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  texto traducido  ' } }]
      })
    });

    const provider = new GroqProvider('test-key', 'llama-3.1-8b-instant');
    const result = await provider.translate('sample error', 'es');

    expect(result).toBe('texto traducido');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(JSON.parse(options.body).model).toBe('llama-3.1-8b-instant');
    expect(options.headers['Authorization']).toBe('Bearer test-key');
  });

  it('prompt includes target language and original error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'traducción' } }] })
    });

    const provider = new GroqProvider('key', 'llama-3.1-8b-instant');
    await provider.translate('variable not used', 'fr');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('fr');
    expect(body.messages[0].content).toContain('variable not used');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' });

    const provider = new GroqProvider('bad-key', 'llama-3.1-8b-instant');
    await expect(provider.translate('text', 'es')).rejects.toThrow('Groq error: 429');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=groq.test
```

Expected: FAIL — `Cannot find module './groq'`

- [ ] **Step 3: Create `src/providers/groq.ts`**

```typescript
import { TranslationProvider } from './provider';

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
}

export class GroqProvider implements TranslationProvider {
  private static readonly BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async translate(text: string, targetLang: string): Promise<string> {
    const response = await fetch(GroqProvider.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{
          role: 'user',
          content: `Translate this programming error message to ${targetLang}. Keep technical terms, variable names, and type names untouched. Return only the translated message: ${text}`
        }],
        temperature: 0
      })
    });

    if (!response.ok) {
      throw new Error(`Groq error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as OpenAIResponse;
    return data.choices[0].message.content.trim();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=groq.test
```

Expected: PASS — 3 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/providers/groq.ts src/providers/groq.test.ts
git commit -m "feat: add Groq translation provider"
```

---

### Task 4: NVIDIA NIM provider

**Files:**
- Create: `src/providers/nvidiaNim.ts`
- Create: `src/providers/nvidiaNim.test.ts`

**Interfaces:**
- Consumes: `TranslationProvider` from `src/providers/provider.ts`
- Produces: `NvidiaNimProvider` class implementing `TranslationProvider`; base URL `https://integrate.api.nvidia.com/v1/chat/completions`

- [ ] **Step 1: Write failing tests in `src/providers/nvidiaNim.test.ts`**

```typescript
import { NvidiaNimProvider } from './nvidiaNim';

const mockFetch = jest.fn();
beforeAll(() => { (global as any).fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe('NvidiaNimProvider', () => {
  it('returns trimmed translated text from NVIDIA NIM API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  texto traducido  ' } }]
      })
    });

    const provider = new NvidiaNimProvider('test-key', 'meta/llama-3.1-8b-instruct');
    const result = await provider.translate('sample error', 'es');

    expect(result).toBe('texto traducido');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(JSON.parse(options.body).model).toBe('meta/llama-3.1-8b-instruct');
    expect(options.headers['Authorization']).toBe('Bearer test-key');
  });

  it('prompt includes target language and original error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'traducción' } }] })
    });

    const provider = new NvidiaNimProvider('key', 'meta/llama-3.1-8b-instruct');
    await provider.translate('undefined is not a function', 'pt');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('pt');
    expect(body.messages[0].content).toContain('undefined is not a function');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

    const provider = new NvidiaNimProvider('bad-key', 'meta/llama-3.1-8b-instruct');
    await expect(provider.translate('text', 'es')).rejects.toThrow('NVIDIA NIM error: 401');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=nvidiaNim
```

Expected: FAIL — `Cannot find module './nvidiaNim'`

- [ ] **Step 3: Create `src/providers/nvidiaNim.ts`**

```typescript
import { TranslationProvider } from './provider';

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
}

export class NvidiaNimProvider implements TranslationProvider {
  private static readonly BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async translate(text: string, targetLang: string): Promise<string> {
    const response = await fetch(NvidiaNimProvider.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{
          role: 'user',
          content: `Translate this programming error message to ${targetLang}. Keep technical terms, variable names, and type names untouched. Return only the translated message: ${text}`
        }],
        temperature: 0
      })
    });

    if (!response.ok) {
      throw new Error(`NVIDIA NIM error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as OpenAIResponse;
    return data.choices[0].message.content.trim();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=nvidiaNim
```

Expected: PASS — 3 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/providers/nvidiaNim.ts src/providers/nvidiaNim.test.ts
git commit -m "feat: add NVIDIA NIM translation provider"
```

---

### Task 5: TranslationService

**Files:**
- Create: `src/translationService.ts`
- Create: `src/translationService.test.ts`

**Interfaces:**
- Consumes: `TranslationProvider` from `src/providers/provider.ts`
- Produces: `TranslationService` class with `translate(text: string): Promise<string>` and `clearCache(): void`

- [ ] **Step 1: Write failing tests in `src/translationService.test.ts`**

```typescript
import { TranslationService } from './translationService';
import { TranslationProvider } from './providers/provider';

describe('TranslationService', () => {
  let mockProvider: jest.Mocked<TranslationProvider>;

  beforeEach(() => {
    mockProvider = { translate: jest.fn() };
  });

  it('calls provider and returns translation', async () => {
    mockProvider.translate.mockResolvedValueOnce('texto de error');
    const service = new TranslationService(mockProvider, 'groq', 'es');

    const result = await service.translate('error text');

    expect(result).toBe('texto de error');
    expect(mockProvider.translate).toHaveBeenCalledWith('error text', 'es');
  });

  it('returns cached result on second call with same text', async () => {
    mockProvider.translate.mockResolvedValueOnce('texto de error');
    const service = new TranslationService(mockProvider, 'groq', 'es');

    await service.translate('error text');
    const result = await service.translate('error text');

    expect(result).toBe('texto de error');
    expect(mockProvider.translate).toHaveBeenCalledTimes(1);
  });

  it('calls provider again for different text', async () => {
    mockProvider.translate
      .mockResolvedValueOnce('primer resultado')
      .mockResolvedValueOnce('segundo resultado');
    const service = new TranslationService(mockProvider, 'groq', 'es');

    const r1 = await service.translate('first error');
    const r2 = await service.translate('second error');

    expect(r1).toBe('primer resultado');
    expect(r2).toBe('segundo resultado');
    expect(mockProvider.translate).toHaveBeenCalledTimes(2);
  });

  it('clearCache forces provider to be called again', async () => {
    mockProvider.translate
      .mockResolvedValueOnce('primera traducción')
      .mockResolvedValueOnce('segunda traducción');
    const service = new TranslationService(mockProvider, 'groq', 'es');

    await service.translate('error text');
    service.clearCache();
    const result = await service.translate('error text');

    expect(result).toBe('segunda traducción');
    expect(mockProvider.translate).toHaveBeenCalledTimes(2);
  });

  it('cache is keyed by provider name and language', async () => {
    const service1 = new TranslationService(mockProvider, 'groq', 'es');
    const service2 = new TranslationService(mockProvider, 'google', 'es');
    mockProvider.translate
      .mockResolvedValueOnce('desde groq')
      .mockResolvedValueOnce('desde google');

    const r1 = await service1.translate('error');
    const r2 = await service2.translate('error');

    expect(r1).toBe('desde groq');
    expect(r2).toBe('desde google');
    expect(mockProvider.translate).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=translationService
```

Expected: FAIL — `Cannot find module './translationService'`

- [ ] **Step 3: Create `src/translationService.ts`**

```typescript
import { TranslationProvider } from './providers/provider';

export class TranslationService {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly provider: TranslationProvider,
    private readonly providerName: string,
    private readonly targetLang: string
  ) {}

  async translate(text: string): Promise<string> {
    const key = `${this.providerName}:${this.targetLang}:${text}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const translated = await this.provider.translate(text, this.targetLang);
    this.cache.set(key, translated);
    return translated;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=translationService
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/translationService.ts src/translationService.test.ts
git commit -m "feat: add TranslationService with in-memory cache"
```

---

### Task 6: HoverProvider

**Files:**
- Create: `src/hoverProvider.ts`
- Create: `src/hoverProvider.test.ts`

**Interfaces:**
- Consumes: `TranslationService` from `src/translationService.ts` — method `translate(text: string): Promise<string>`
- Produces: `ErrorTranslateHoverProvider` implementing `vscode.HoverProvider` with `provideHover(document, position): Promise<vscode.Hover | undefined>`

- [ ] **Step 1: Write failing tests in `src/hoverProvider.test.ts`**

```typescript
import * as vscode from 'vscode';
import { ErrorTranslateHoverProvider } from './hoverProvider';

const mockTranslationService = { translate: jest.fn(), clearCache: jest.fn() };
const mockOutputChannel = { appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn() };

const makeDocument = () => ({ uri: { toString: () => 'file:///test.ts' } } as any as vscode.TextDocument);
const makePosition = () => ({} as vscode.Position);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ErrorTranslateHoverProvider', () => {
  it('returns undefined when no diagnostics at position', async () => {
    (vscode.languages.getDiagnostics as jest.Mock).mockReturnValueOnce([]);

    const provider = new ErrorTranslateHoverProvider(mockTranslationService as any, mockOutputChannel as any);
    const result = await provider.provideHover(makeDocument(), makePosition());

    expect(result).toBeUndefined();
    expect(mockTranslationService.translate).not.toHaveBeenCalled();
  });

  it('returns translated hover for a single diagnostic', async () => {
    const diagnostic = {
      message: 'variable not used',
      severity: vscode.DiagnosticSeverity.Error,
      range: { contains: jest.fn().mockReturnValue(true) }
    };
    (vscode.languages.getDiagnostics as jest.Mock).mockReturnValueOnce([diagnostic]);
    mockTranslationService.translate.mockResolvedValueOnce('variable no utilizada');

    const provider = new ErrorTranslateHoverProvider(mockTranslationService as any, mockOutputChannel as any);
    const result = await provider.provideHover(makeDocument(), makePosition());

    expect(result).toBeDefined();
    expect(mockTranslationService.translate).toHaveBeenCalledWith('variable not used');
  });

  it('skips diagnostics not intersecting cursor position', async () => {
    const diagnostic = {
      message: 'error far away',
      severity: vscode.DiagnosticSeverity.Error,
      range: { contains: jest.fn().mockReturnValue(false) }
    };
    (vscode.languages.getDiagnostics as jest.Mock).mockReturnValueOnce([diagnostic]);

    const provider = new ErrorTranslateHoverProvider(mockTranslationService as any, mockOutputChannel as any);
    const result = await provider.provideHover(makeDocument(), makePosition());

    expect(result).toBeUndefined();
    expect(mockTranslationService.translate).not.toHaveBeenCalled();
  });

  it('falls back to original message and logs when translation throws', async () => {
    const diagnostic = {
      message: 'variable not used',
      severity: vscode.DiagnosticSeverity.Warning,
      range: { contains: jest.fn().mockReturnValue(true) }
    };
    (vscode.languages.getDiagnostics as jest.Mock).mockReturnValueOnce([diagnostic]);
    mockTranslationService.translate.mockRejectedValueOnce(new Error('API timeout'));

    const provider = new ErrorTranslateHoverProvider(mockTranslationService as any, mockOutputChannel as any);
    const result = await provider.provideHover(makeDocument(), makePosition());

    expect(result).toBeDefined();
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('API timeout')
    );
  });

  it('translates multiple diagnostics at the same position', async () => {
    const diagnostics = [
      { message: 'error one', severity: vscode.DiagnosticSeverity.Error, range: { contains: jest.fn().mockReturnValue(true) } },
      { message: 'error two', severity: vscode.DiagnosticSeverity.Warning, range: { contains: jest.fn().mockReturnValue(true) } }
    ];
    (vscode.languages.getDiagnostics as jest.Mock).mockReturnValueOnce(diagnostics);
    mockTranslationService.translate
      .mockResolvedValueOnce('error uno')
      .mockResolvedValueOnce('error dos');

    const provider = new ErrorTranslateHoverProvider(mockTranslationService as any, mockOutputChannel as any);
    await provider.provideHover(makeDocument(), makePosition());

    expect(mockTranslationService.translate).toHaveBeenCalledTimes(2);
    expect(mockTranslationService.translate).toHaveBeenCalledWith('error one');
    expect(mockTranslationService.translate).toHaveBeenCalledWith('error two');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=hoverProvider
```

Expected: FAIL — `Cannot find module './hoverProvider'`

- [ ] **Step 3: Create `src/hoverProvider.ts`**

```typescript
import * as vscode from 'vscode';
import { TranslationService } from './translationService';

export class ErrorTranslateHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly translationService: TranslationService,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const diagnostics = vscode.languages
      .getDiagnostics(document.uri)
      .filter(d => d.range.contains(position));

    if (diagnostics.length === 0) {
      return undefined;
    }

    const lines: string[] = [];
    for (const diagnostic of diagnostics) {
      const severity = this.severityLabel(diagnostic.severity);
      try {
        const translated = await this.translationService.translate(diagnostic.message);
        lines.push(`**${severity}:** ${translated}`);
      } catch (err) {
        this.outputChannel.appendLine(`[error-translate] Translation failed: ${err}`);
        lines.push(`**${severity}:** ${diagnostic.message}`);
      }
    }

    return new vscode.Hover(new vscode.MarkdownString(lines.join('\n\n')));
  }

  private severityLabel(severity: vscode.DiagnosticSeverity): string {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error: return 'Error';
      case vscode.DiagnosticSeverity.Warning: return 'Warning';
      case vscode.DiagnosticSeverity.Information: return 'Info';
      default: return 'Hint';
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=hoverProvider
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/hoverProvider.ts src/hoverProvider.test.ts
git commit -m "feat: add HoverProvider that intercepts and translates diagnostics"
```

---

### Task 7: Extension entry point

**Files:**
- Modify: `src/extension.ts` (replace the stub from Task 1)

**Interfaces:**
- Consumes: `ErrorTranslateHoverProvider` from `src/hoverProvider.ts`
- Consumes: `TranslationService` from `src/translationService.ts`
- Consumes: `GoogleTranslateProvider`, `GroqProvider`, `NvidiaNimProvider`
- Produces: `activate(context)` / `deactivate()` exports required by VS Code

- [ ] **Step 1: Replace `src/extension.ts` with the full implementation**

```typescript
import * as vscode from 'vscode';
import { TranslationService } from './translationService';
import { ErrorTranslateHoverProvider } from './hoverProvider';
import { GoogleTranslateProvider } from './providers/googleTranslate';
import { GroqProvider } from './providers/groq';
import { NvidiaNimProvider } from './providers/nvidiaNim';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Error Translate');
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(outputChannel, statusBar);

  const translationService = buildTranslationService(outputChannel, statusBar);
  if (!translationService) {
    return;
  }

  const hoverProvider = new ErrorTranslateHoverProvider(translationService, outputChannel);
  const disposable = vscode.languages.registerHoverProvider('*', hoverProvider);
  context.subscriptions.push(disposable);
}

export function deactivate(): void {}

function buildTranslationService(
  outputChannel: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): TranslationService | null {
  const config = vscode.workspace.getConfiguration('errorTranslate');

  if (!config.get<boolean>('enabled', true)) {
    return null;
  }

  const targetLang = config.get<string>('targetLanguage', 'es');
  const providerName = config.get<string>('provider', 'groq');

  switch (providerName) {
    case 'google': {
      const apiKey = config.get<string>('googleTranslate.apiKey', '');
      if (!apiKey) {
        warnMissingKey(statusBar, 'Google Translate', 'errorTranslate.googleTranslate.apiKey');
        return null;
      }
      return new TranslationService(new GoogleTranslateProvider(apiKey), 'google', targetLang);
    }
    case 'groq': {
      const apiKey = config.get<string>('groq.apiKey', '');
      if (!apiKey) {
        warnMissingKey(statusBar, 'Groq', 'errorTranslate.groq.apiKey');
        return null;
      }
      const model = config.get<string>('groq.model', 'llama-3.1-8b-instant');
      return new TranslationService(new GroqProvider(apiKey, model), 'groq', targetLang);
    }
    case 'nvidia': {
      const apiKey = config.get<string>('nvidiaNim.apiKey', '');
      if (!apiKey) {
        warnMissingKey(statusBar, 'NVIDIA NIM', 'errorTranslate.nvidiaNim.apiKey');
        return null;
      }
      const model = config.get<string>('nvidiaNim.model', 'meta/llama-3.1-8b-instruct');
      return new TranslationService(new NvidiaNimProvider(apiKey, model), 'nvidia', targetLang);
    }
    default:
      outputChannel.appendLine(`[error-translate] Unknown provider: ${providerName}`);
      return null;
  }
}

function warnMissingKey(
  statusBar: vscode.StatusBarItem,
  providerName: string,
  settingKey: string
): void {
  statusBar.text = `$(warning) Error Translate: ${providerName} API key missing`;
  statusBar.tooltip = `Set "${settingKey}" in VS Code settings to enable translation`;
  statusBar.show();
}
```

- [ ] **Step 2: Verify the full test suite still passes**

```bash
npm test
```

Expected: PASS — all tests passing (extension.ts has no unit tests; it is covered by manual integration testing in Task 8)

- [ ] **Step 3: Build the extension**

```bash
npm run compile
```

Expected: `dist/extension.js` created with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: implement extension entry point with config reading and status bar warning"
```

---

### Task 8: Build verification and packaging

**Files:**
- No new files — validates the full build and produces a `.vsix`

**Interfaces:**
- Consumes: all previous tasks
- Produces: `error-translate-0.0.1.vsix` installable locally

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: PASS — all tests green

- [ ] **Step 2: Build the bundle**

```bash
npm run compile
```

Expected: `dist/extension.js` created, no errors

- [ ] **Step 3: Install vsce globally if not already installed**

```bash
npx vsce --version
```

Expected: prints a version number (e.g. `2.x.x`). If not found, `npm install -g @vscode/vsce` and retry.

- [ ] **Step 4: Package the extension**

```bash
npx vsce package --no-dependencies
```

Expected: `error-translate-0.0.1.vsix` created in the project root

- [ ] **Step 5: Install the extension locally in VS Code**

```bash
code --install-extension error-translate-0.0.1.vsix
```

Expected: VS Code reports `Extension 'error-translate' was successfully installed.`

- [ ] **Step 6: Manual integration test**

  1. Open VS Code settings (`Cmd+,`) and set:
     ```json
     "errorTranslate.provider": "groq",
     "errorTranslate.groq.apiKey": "<your-groq-key>",
     "errorTranslate.targetLanguage": "es"
     ```
  2. Open any file that produces a diagnostic error (e.g., a TypeScript file with an unused variable)
  3. Hover over the underlined error
  4. Verify: the hover tooltip shows the translated error message in Spanish

- [ ] **Step 7: Commit**

```bash
git add error-translate-0.0.1.vsix
git commit -m "feat: package extension as vsix for local installation"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Target language configurable in settings | Task 1 (`package.json` contributes) |
| Translation replaces hover tooltip text | Task 6 (HoverProvider returns new Hover) |
| Trigger: hover only | Task 6 (HoverProvider — no background processing) |
| In-memory cache cleared on deactivation | Task 5 (Map in TranslationService, GC'd on deactivation) |
| Google Translate provider | Task 2 |
| Groq provider | Task 3 |
| NVIDIA NIM provider | Task 4 |
| Missing API key shows status bar warning | Task 7 (`warnMissingKey`) |
| API failure falls back to original text | Task 6 (try/catch in provideHover) |
| API failure logged to Output Channel | Task 6 (`outputChannel.appendLine`) |
| Activation event: `onStartupFinished` | Task 1 (`package.json`) |
| All providers share same interface | Task 2 (`TranslationProvider` interface) |
| Cache key includes provider + language | Task 5 |

All requirements covered. No gaps found.
