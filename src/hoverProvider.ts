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

    if (diagnostics.length === 0) {
      return undefined;
    }

    const parts: string[] = [];

    for (let i = 0; i < diagnostics.length; i++) {
      if (i > 0) {
        parts.push('<hr>');
      }
      const diagnostic = diagnostics[i];
      const header = this.severityHeader(diagnostic.severity);

      try {
        const translated = await this.translationService.translate(diagnostic.message);
        parts.push(`${header}<br><br>${this.codeify(translated)}`);
      } catch (err) {
        this.outputChannel.appendLine(`[error-translate] Translation failed: ${err}`);
        parts.push(`${header}<br><br>${this.codeify(diagnostic.message)}`);
      }
    }

    const md = new vscode.MarkdownString(parts.join(''));
    md.isTrusted = true;
    md.supportHtml = true;
    md.supportThemeIcons = true;

    return new vscode.Hover(md);
  }

  // Wraps quoted terms in <code> chips (matches PTE's inline code style)
  private codeify(text: string): string {
    return text
      .replace(/'([^']{1,60})'/g, '<code>$1</code>')
      .replace(/«([^»]{1,60})»/g, '<code>$1</code>')
      .replace(/"([^"]{1,60})"/g, '<code>$1</code>');
  }

  private severityHeader(severity: vscode.DiagnosticSeverity): string {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return '<span style="color:#f14c4c;font-weight:700;">$(error) Error</span>';
      case vscode.DiagnosticSeverity.Warning:
        return '<span style="color:#cca700;font-weight:700;">$(warning) Warning</span>';
      case vscode.DiagnosticSeverity.Information:
        return '<span style="color:#3794ff;font-weight:700;">$(info) Info</span>';
      default:
        return '<span style="color:#89d185;font-weight:700;">$(lightbulb) Hint</span>';
    }
  }
}
