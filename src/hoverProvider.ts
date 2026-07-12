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

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportThemeIcons = true;

    for (let i = 0; i < diagnostics.length; i++) {
      if (i > 0) {
        md.appendMarkdown('\n\n---\n\n');
      }
      const diagnostic = diagnostics[i];
      const badge = this.severityBadge(diagnostic.severity);
      try {
        const translated = await this.translationService.translate(diagnostic.message);
        md.appendMarkdown(`${badge}&nbsp; ${translated}`);
      } catch (err) {
        this.outputChannel.appendLine(`[error-translate] Translation failed: ${err}`);
        md.appendMarkdown(`${badge}&nbsp; ${diagnostic.message}`);
      }
    }

    return new vscode.Hover(md);
  }

  private severityBadge(severity: vscode.DiagnosticSeverity): string {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return '<span style="background:#f14c4c;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">Error</span>';
      case vscode.DiagnosticSeverity.Warning:
        return '<span style="background:#cca700;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">Warning</span>';
      case vscode.DiagnosticSeverity.Information:
        return '<span style="background:#3794ff;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">Info</span>';
      default:
        return '<span style="background:#89d185;color:#1e1e1e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">Hint</span>';
    }
  }
}
