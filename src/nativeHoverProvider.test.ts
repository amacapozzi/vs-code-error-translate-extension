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

  it('returns undefined and logs when the internal hover fetch itself rejects', async () => {
    (vscode.commands.executeCommand as jest.Mock).mockRejectedValueOnce(new Error('fetch failed'));

    const provider = new NativeHoverTranslateProvider(mockTranslationService as any, mockOutputChannel as any, true);
    const result = await provider.provideHover(makeDocument(), makePosition());

    expect(result).toBeUndefined();
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('fetch failed')
    );
    expect(mockTranslationService.translate).not.toHaveBeenCalled();
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
