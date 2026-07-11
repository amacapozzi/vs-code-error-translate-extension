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
