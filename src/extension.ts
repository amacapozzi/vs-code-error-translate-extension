import * as vscode from 'vscode';
import { TranslationService } from './translationService';
import { ErrorTranslateHoverProvider } from './hoverProvider';
import { NativeHoverTranslateProvider } from './nativeHoverProvider';
import { GoogleTranslateProvider } from './providers/googleTranslate';
import { GroqProvider } from './providers/groq';
import { NvidiaNimProvider } from './providers/nvidiaNim';
import { DeepLProvider } from './providers/deepl';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Error Translate');
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(outputChannel, statusBar);

  let hoverDisposables: vscode.Disposable[] = [];

  const register = () => {
    hoverDisposables.forEach(d => d.dispose());
    hoverDisposables = [];
    statusBar.hide();

    const translationService = buildTranslationService(outputChannel, statusBar);
    if (!translationService) {
      return;
    }

    const config = vscode.workspace.getConfiguration('errorTranslate');
    const hoverDocsEnabled = config.get<boolean>('hoverDocs.enabled', true);

    const hoverProvider = new ErrorTranslateHoverProvider(translationService, outputChannel);
    const nativeHoverProvider = new NativeHoverTranslateProvider(
      translationService,
      outputChannel,
      hoverDocsEnabled
    );

    hoverDisposables.push(
      vscode.languages.registerHoverProvider('*', hoverProvider),
      vscode.languages.registerHoverProvider('*', nativeHoverProvider)
    );
    outputChannel.appendLine('[error-translate] Provider registered successfully');
  };

  register();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('errorTranslate')) {
        outputChannel.appendLine('[error-translate] Configuration changed, re-registering...');
        register();
      }
    }),
    { dispose: () => hoverDisposables.forEach(d => d.dispose()) }
  );
}

export function deactivate(): void {}

function buildTranslationService(
  outputChannel: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): TranslationService | null {
  const config = vscode.workspace.getConfiguration('errorTranslate');

  if (!config.get<boolean>('enabled', true)) {
    outputChannel.appendLine('[error-translate] Extension disabled via settings');
    return null;
  }

  const targetLang = config.get<string>('targetLanguage', 'es');
  const providerName = config.get<string>('provider', 'groq');

  switch (providerName) {
    case 'deepl': {
      const apiKey = config.get<string>('deepl.apiKey', '');
      if (!apiKey) {
        warnMissingKey(statusBar, 'DeepL', 'errorTranslate.deepl.apiKey');
        return null;
      }
      return new TranslationService(new DeepLProvider(apiKey), 'deepl', targetLang);
    }
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
