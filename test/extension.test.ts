import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as sinon from 'sinon';
import * as vscode from 'vscode';
import './setup';
import { activate } from '../src/extension';
import { mockConfig, resetStubHistories, stubs } from './helpers';

function createMockContext(): vscode.ExtensionContext {
  return {
    subscriptions: []
  } as any;
}

describe('extension', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapzip-ext-test-'));
    resetStubHistories();
    mockConfig({
      'output.location': 'parentFolder',
      'output.compressionLevel': 1,
      'ignore.useGitignore': false,
      'ignore.workspacePatterns': [],
      'ignore.global': []
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers all SnapZip commands on activate', () => {
    activate(createMockContext());
    const ids = Object.keys(stubs.commands.callbacks);
    assert.deepStrictEqual(ids.sort(), [
      'snapZip.addGlobalIgnorePattern',
      'snapZip.addWorkspaceIgnorePattern',
      'snapZip.compressFolder',
      'snapZip.compressWorkspace',
      'snapZip.copyWorkspacePatterns',
      'snapZip.manageIgnorePatterns',
      'snapZip.openSettings',
      'snapZip.pasteWorkspacePatterns'
    ].sort());
  });

  describe('compressFolder command', () => {
    it('compresses a selected folder and shows success', async () => {
      const target = path.join(tmpDir, 'markdown-explorer');
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, 'readme.md'), 'hello');
      stubs.workspace.workspaceFolders = [{ uri: { fsPath: tmpDir } }];

      activate(createMockContext());
      const callback = stubs.commands.callbacks['snapZip.compressFolder'];
      await callback(vscode.Uri.file(target));

      assert.ok(stubs.window.withProgress.calledOnce);
      const calls = stubs.window.showInformationMessage.getCalls();
      assert.ok(calls.some((c: sinon.SinonSpyCall) => {
        const msg = c.args[0] as string;
        return msg.startsWith('SnapZip: created') && msg.includes('files)');
      }));
    });

    it('shows error when compression fails', async () => {
      const targetFile = path.join(tmpDir, 'not-a-folder.txt');
      fs.writeFileSync(targetFile, 'x');
      mockConfig({ 'output.location': 'workspaceRoot' });
      stubs.workspace.workspaceFolders = undefined;

      activate(createMockContext());
      const callback = stubs.commands.callbacks['snapZip.compressFolder'];
      await callback(vscode.Uri.file(targetFile));

      assert.ok(stubs.window.showErrorMessage.calledOnce);
      const error = stubs.window.showErrorMessage.firstCall.args[0] as string;
      assert.ok(error.startsWith('SnapZip: failed to compress folder'));
    });
  });

  describe('compressWorkspace command', () => {
    it('shows warning when no workspace is open', async () => {
      stubs.workspace.workspaceFolders = undefined;
      activate(createMockContext());
      const callback = stubs.commands.callbacks['snapZip.compressWorkspace'];
      await callback();
      assert.ok(stubs.window.showWarningMessage.calledWith('SnapZip: no workspace folder is open.'));
    });

    it('compresses each workspace folder', async () => {
      const folderA = path.join(tmpDir, 'a');
      const folderB = path.join(tmpDir, 'b');
      fs.mkdirSync(folderA, { recursive: true });
      fs.mkdirSync(folderB, { recursive: true });
      fs.writeFileSync(path.join(folderA, 'x.txt'), 'x');
      fs.writeFileSync(path.join(folderB, 'y.txt'), 'y');
      stubs.workspace.workspaceFolders = [
        { uri: { fsPath: folderA } },
        { uri: { fsPath: folderB } }
      ];

      activate(createMockContext());
      const callback = stubs.commands.callbacks['snapZip.compressWorkspace'];
      await callback();

      assert.equal(stubs.window.withProgress.callCount, 2);
      const successes = stubs.window.showInformationMessage.getCalls().filter((c: sinon.SinonSpyCall) => {
        const msg = c.args[0] as string;
        return msg.startsWith('SnapZip: created');
      });
      assert.equal(successes.length, 2);
    });
  });

  describe('settings command', () => {
    it('opens the settings webview panel', async () => {
      stubs.workspace.workspaceFolders = [{ uri: { fsPath: tmpDir } }];
      activate(createMockContext());
      const callback = stubs.commands.callbacks['snapZip.openSettings'];
      callback();
      assert.ok(stubs.window.createWebviewPanel.calledOnce);
    });

    it('warns when no workspace is open', async () => {
      stubs.workspace.workspaceFolders = undefined;
      activate(createMockContext());
      const callback = stubs.commands.callbacks['snapZip.openSettings'];
      callback();
      assert.ok(stubs.window.showWarningMessage.calledWith('SnapZip: open a workspace folder first to edit settings.'));
    });
  });
});
