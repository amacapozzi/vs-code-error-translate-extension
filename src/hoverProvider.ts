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
