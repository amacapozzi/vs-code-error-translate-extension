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
