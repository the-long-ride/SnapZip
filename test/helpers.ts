import type * as sinon from 'sinon';
import * as sinonLib from 'sinon';
import { stubs } from './mocks/vscode';

export { stubs };

export interface MockConfig {
  get: sinon.SinonStub<[string] | [string, any], any>;
  update: sinon.SinonStub;
}

export function mockConfig(values: Record<string, any>): MockConfig {
  const config: MockConfig = {
    get: sinonLib.stub(),
    update: sinonLib.stub().resolves(undefined)
  };
  config.get.callsFake((key: string, defaultValue?: any) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue
  );
  stubs.workspace.getConfiguration.returns(config);
  return config;
}

export function resetStubHistories(): void {
  for (const stub of [
    stubs.commands.registerCommand,
    stubs.commands.executeCommand,
    stubs.workspace.getConfiguration,
    stubs.window.showInputBox,
    stubs.window.showQuickPick,
    stubs.window.showInformationMessage,
    stubs.window.showErrorMessage,
    stubs.window.showWarningMessage,
    stubs.window.showOpenDialog,
    stubs.window.withProgress,
    stubs.window.createWebviewPanel,
    stubs.env.clipboard.writeText,
    stubs.env.clipboard.readText
  ]) {
    stub.resetHistory();
  }
  for (const key of Object.keys(stubs.commands.callbacks)) {
    delete stubs.commands.callbacks[key];
  }
  stubs.workspace.workspaceFolders = undefined;
}
