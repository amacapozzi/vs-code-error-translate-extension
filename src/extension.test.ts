import * as vscode from 'vscode';
import { activate } from './extension';

// Helper to build a fake ExtensionContext
function makeContext() {
  return { subscriptions: { push: jest.fn() } } as any;
}

// Helper to mock getConfiguration return values
function mockConfig(overrides: Record<string, unknown>) {
  (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: (key: string, defaultVal?: unknown) => {
      return key in overrides ? overrides[key] : defaultVal;
    }
  });
}

beforeEach(() => jest.clearAllMocks());

describe('activate / buildTranslationService', () => {
  it('registers HoverProvider when Groq provider has API key', () => {
    mockConfig({ provider: 'groq', 'groq.apiKey': 'test-key', enabled: true });
    activate(makeContext());
    expect(vscode.languages.registerHoverProvider).toHaveBeenCalledWith('*', expect.any(Object));
  });

  it('does NOT register HoverProvider when Groq API key is missing', () => {
    mockConfig({ provider: 'groq', 'groq.apiKey': '', enabled: true });
    activate(makeContext());
    expect(vscode.languages.registerHoverProvider).not.toHaveBeenCalled();
  });

  it('shows status bar warning when API key is missing', () => {
    const fakeStatusBar = { text: '', tooltip: '', show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
    (vscode.window.createStatusBarItem as jest.Mock).mockReturnValue(fakeStatusBar);
    mockConfig({ provider: 'groq', 'groq.apiKey': '', enabled: true });
    activate(makeContext());
    expect(fakeStatusBar.show).toHaveBeenCalled();
    expect(fakeStatusBar.text).toContain('API key missing');
  });

  it('does NOT register HoverProvider when enabled is false', () => {
    mockConfig({ enabled: false });
    activate(makeContext());
    expect(vscode.languages.registerHoverProvider).not.toHaveBeenCalled();
  });
});
