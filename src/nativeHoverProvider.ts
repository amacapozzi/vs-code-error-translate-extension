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

    let hovers: vscode.Hover[] | undefined;
    try {
      hovers = await withInternalFetchGuard(() =>
        Promise.resolve(
          vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            document.uri,
            position
          )
        )
      );
    } catch (err) {
      this.outputChannel.appendLine(`[error-translate] Failed to fetch native hover content: ${err}`);
      return undefined;
    }

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
