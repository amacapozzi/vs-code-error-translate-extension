# Error Translate Extension — Design Spec

**Date:** 2026-07-11  
**Status:** Approved

---

## Overview

A VS Code extension that translates diagnostic error/warning messages in real-time using a configurable AI or translation API. When the user hovers over underlined code, the extension intercepts the diagnostic messages and returns them translated in the hover tooltip, replacing the original English text.

---

## Requirements

- **Target language:** Configurable per user in VS Code settings (ISO 639-1 codes, e.g. `"es"`, `"fr"`, `"pt"`)
- **UI:** Translation replaces the original error text in the hover tooltip
- **Trigger:** On hover only (not automatic background translation)
- **Caching:** In-memory cache while VS Code is open; cleared on extension deactivation
- **Provider:** Configurable by the user — Google Translate, Groq, or NVIDIA NIM

---

## Architecture

The extension is composed of four layers:

```
VS Code Extension Host
│
├── extension.ts          ← entry point, registers HoverProvider and reads config
├── hoverProvider.ts      ← intercepts hovers, fetches diagnostics, delegates translation
├── translationService.ts ← orchestrates provider selection + in-memory cache
└── providers/
    ├── googleTranslate.ts
    ├── groq.ts
    └── nvidiaNim.ts
```

### Data flow

1. User hovers over code with a diagnostic marker
2. VS Code calls the extension's `HoverProvider`
3. `hoverProvider.ts` fetches diagnostics at that position via `vscode.languages.getDiagnostics`
4. Each diagnostic message is passed to `translationService.ts`
5. `translationService` checks the in-memory cache — returns immediately on hit
6. On cache miss, calls the configured provider (Google / Groq / NVIDIA)
7. Caches the result and returns the translated string
8. `HoverProvider` builds a new `vscode.Hover` with the translated text

---

## Configuration

Exposed in VS Code `settings.json`:

```json
{
  "errorTranslate.enabled": true,
  "errorTranslate.targetLanguage": "es",
  "errorTranslate.provider": "groq",
  "errorTranslate.googleTranslate.apiKey": "",
  "errorTranslate.groq.apiKey": "",
  "errorTranslate.groq.model": "llama-3.1-8b-instant",
  "errorTranslate.nvidiaNim.apiKey": "",
  "errorTranslate.nvidiaNim.model": "meta/llama-3.1-8b-instruct"
}
```

- `targetLanguage` accepts ISO 639-1 codes
- `provider` accepts `"google"`, `"groq"`, or `"nvidia"`
- If the selected provider has no `apiKey` set, the extension shows a warning in the status bar instead of failing silently

---

## Translation Service & Providers

### Cache

- Structure: `Map<string, string>`
- Key format: `"{provider}:{language}:{errorMessage}"`
- Initialized empty on activation; cleared on deactivation
- No size limit in this version

### Provider interface

```typescript
interface TranslationProvider {
  translate(text: string, targetLang: string): Promise<string>;
}
```

All providers implement this interface.

### Provider behavior

| Provider | API style | Strengths |
|---|---|---|
| **Google Translate** | REST v2 with `apiKey` | Fast, cheap, high availability |
| **Groq** | OpenAI-compatible chat completions | Understands code context, keeps variable names untouched |
| **NVIDIA NIM** | OpenAI-compatible chat completions | Same as Groq, different base URL and model |

For AI providers (Groq, NVIDIA), the prompt template is:

> *"Translate this programming error message to {lang}. Keep technical terms, variable names, and type names untouched. Return only the translated message: {error}"*

### Error handling

If an API call fails (timeout, invalid key, rate limit), the hover displays the original English text unchanged. The error is logged to the extension's Output Channel for user diagnostics. VS Code is never broken by a translation failure.

---

## HoverProvider

Registered for all languages on activation:

```typescript
vscode.languages.registerHoverProvider('*', new ErrorTranslateHoverProvider(translationService));
```

### `provideHover` logic

1. Get all diagnostics for the current document
2. Filter to those intersecting the cursor position
3. If none intersect → return `undefined` (VS Code shows the normal hover)
4. For each intersecting diagnostic message, request a translation
5. Build a `vscode.Hover` with a `MarkdownString` containing the translated text and the original severity label in grey
6. Return the translated hover

**Multiple hover sources:** VS Code stacks hovers from multiple providers (e.g. language server + this extension). The extension only activates when diagnostics are present at the cursor position, leaving non-diagnostic hovers (function docs, type info) untouched.

### Activation event

`onStartupFinished` — avoids impacting VS Code startup time.

---

## Project Structure

```
vs-code-error-translate-extension/
├── src/
│   ├── extension.ts
│   ├── hoverProvider.ts
│   ├── translationService.ts
│   └── providers/
│       ├── googleTranslate.ts
│       ├── groq.ts
│       └── nvidiaNim.ts
├── package.json
├── tsconfig.json
├── .vscodeignore
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-07-11-error-translate-extension-design.md
```

---

## Technology Stack

- **Language:** TypeScript
- **HTTP client:** native `fetch` (Node 18+)
- **Types:** `@types/vscode`
- **Bundler:** `esbuild`
- **Test runner:** Jest (unit tests mock HTTP calls)

---

## Testing

- **Unit tests:** `TranslationService` (mock HTTP), `HoverProvider` logic (mock diagnostics and translation service)
- **Manual integration test:** Open a file with deliberate errors, hover over them, verify translated text appears in the tooltip

---

## Packaging

Use `vsce package` to produce a `.vsix` file for local installation. Marketplace publication is out of scope for this version.
