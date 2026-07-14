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
    for (const hover of hovers) {
      const translated = await this.translateHoverContents(hover);
      if (!translated) {
        continue;
      }
      if (parts.length > 0) {
        parts.push('\n\n---\n\n');
      }
      parts.push(translated);
    }

    if (parts.length === 0) {
      return undefined;
    }

    const md = new vscode.MarkdownString(
      `<span style="color:#3794ff;font-weight:700;">$(globe) Translated</span>\n\n${parts.join('')}`
    );
    md.supportHtml = true;
    md.supportThemeIcons = true;

    return new vscode.Hover(md);
  }

  // Returns undefined when a hover has no translatable prose (e.g. a bare type
  // signature) so we don't show a redundant duplicate of the original native hover.
  private async translateHoverContents(hover: vscode.Hover): Promise<string | undefined> {
    const rendered: string[] = [];
    let hadProse = false;

    for (const content of hover.contents) {
      if (typeof content !== 'string' && 'language' in content) {
        // Legacy MarkedString code object ({language, value}) — the whole item is
        // code, never translate it; re-wrap it as a fence so it still renders.
        rendered.push('```' + content.language + '\n' + content.value + '\n```');
        continue;
      }

      const markdown = typeof content === 'string' ? content : content.value;

      try {
        const segments = splitCodeAndProse(markdown);
        const translatedSegments = await Promise.all(
          segments.map(segment => {
            if (segment.type === 'code' || segment.text.trim() === '') {
              return Promise.resolve(segment.text);
            }
            hadProse = true;
            return this.translationService.translate(segment.text);
          })
        );
        rendered.push(translatedSegments.join(''));
      } catch (err) {
        this.outputChannel.appendLine(`[error-translate] Hover doc translation failed: ${err}`);
        rendered.push(markdown);
      }
    }

    return hadProse ? rendered.join('\n\n') : undefined;
  }
}
