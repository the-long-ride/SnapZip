import * as path from 'path';
import * as sinon from 'sinon';

const createConfigMock = () => ({
  get: sinon.stub(),
  update: sinon.stub().resolves(undefined)
});

const createWebviewPanelMock = () => ({
  webview: {
    html: '',
    onDidReceiveMessage: sinon.stub(),
    postMessage: sinon.stub().resolves(undefined)
  },
  onDidDispose: sinon.stub(),
  reveal: sinon.stub(),
  dispose: sinon.stub()
});

const commandCallbacks: Record<string, (...args: any[]) => any> = {};

const commands = {
  registerCommand: sinon.stub().callsFake((commandId: string, callback: (...args: any[]) => any) => {
    commandCallbacks[commandId] = callback;
    return { dispose: sinon.stub() };
  }),
  executeCommand: sinon.stub().resolves(undefined),
  get callbacks() {
    return commandCallbacks;
  }
};

const workspace = {
  getConfiguration: sinon.stub().returns(createConfigMock()),
  getWorkspaceFolder: sinon.stub().callsFake((uri: { fsPath: string }) => {
    const folders = workspace.workspaceFolders ?? [];
    return folders.find((f: any) => {
      const root = f.uri.fsPath as string;
      return uri.fsPath === root || uri.fsPath.startsWith(root + path.sep);
    });
  }),
  workspaceFolders: undefined as any
};

const window = {
  showInputBox: sinon.stub().resolves(undefined),
  showQuickPick: sinon.stub().resolves(undefined),
  showInformationMessage: sinon.stub().resolves(undefined),
  showErrorMessage: sinon.stub().resolves(undefined),
  showWarningMessage: sinon.stub().resolves(undefined),
  withProgress: sinon.stub().callsFake((_options: any, task: (progress: any) => Promise<any>) =>
    task({ report: sinon.stub() })
  ),
  createWebviewPanel: sinon.stub().returns(createWebviewPanelMock())
};

const env = {
  clipboard: {
    writeText: sinon.stub().resolves(undefined),
    readText: sinon.stub().resolves('')
  }
};

const Uri = {
  file: (fsPath: string) => ({ fsPath, scheme: 'file' }),
  parse: (src: string) => ({ fsPath: src.replace(/^file:\/\//, ''), scheme: 'file' })
};

const ProgressLocation = {
  Notification: 15,
  Window: 10,
  SourceControl: 14
};

const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3
};

const ViewColumn = {
  Active: -1,
  One: 1,
  Two: 2,
  Three: 3
};

export const stubs = {
  commands,
  workspace,
  window,
  env,
  Uri,
  ProgressLocation,
  ConfigurationTarget,
  ViewColumn,
  createConfigMock,
  createWebviewPanelMock
};

const vscode = {
  commands,
  workspace,
  window,
  env,
  Uri,
  ProgressLocation,
  ConfigurationTarget,
  ViewColumn
};

export default vscode;
