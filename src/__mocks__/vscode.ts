const vscode = {
  languages: {
    registerHoverProvider: jest.fn(),
    getDiagnostics: jest.fn()
  },
  window: {
    createStatusBarItem: jest.fn(() => ({
      text: '',
      tooltip: '',
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn()
    })),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn()
    }))
  },
  Hover: class {
    constructor(public contents: any) {}
  },
  MarkdownString: class {
    value: string = '';
    appendMarkdown(text: string) { this.value += text; return this; }
    constructor(value?: string) { this.value = value ?? ''; }
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2
  }
};

module.exports = vscode;
