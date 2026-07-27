import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import './setup';
import {
  addGlobalPattern,
  addWorkspacePattern,
  copyWorkspacePatternsToClipboard,
  getCompressionLevel,
  getGlobalPatterns,
  getOutputLocation,
  getUseGitignore,
  getWorkspacePatterns,
  managePatterns,
  pasteWorkspacePatternsFromClipboard,
  setCompressionLevel,
  setGlobalPatterns,
  setOutputLocation,
  setUseGitignore,
  setWorkspacePatterns
} from '../src/patternsManager';
import { mockConfig, resetStubHistories, stubs } from './helpers';

const resourceUri = vscode.Uri.file('/workspace/project');

describe('patternsManager', () => {
  beforeEach(() => {
    resetStubHistories();
  });

  describe('getters', () => {
    it('getUseGitignore returns configuration value', () => {
      mockConfig({ 'ignore.useGitignore': false });
      assert.equal(getUseGitignore(resourceUri), false);
    });

    it('getOutputLocation returns configured location', () => {
      mockConfig({ 'output.location': 'workspaceRoot' });
      assert.equal(getOutputLocation(resourceUri), 'workspaceRoot');
    });

    it('getOutputLocation defaults to parentFolder', () => {
      mockConfig({});
      assert.equal(getOutputLocation(resourceUri), 'parentFolder');
    });

    it('getCompressionLevel returns configured level', () => {
      mockConfig({ 'output.compressionLevel': 4 });
      assert.equal(getCompressionLevel(resourceUri), 4);
    });

    it('getCompressionLevel defaults to 3', () => {
      mockConfig({});
      assert.equal(getCompressionLevel(resourceUri), 3);
    });

    it('getWorkspacePatterns returns configured array', () => {
      mockConfig({ 'ignore.workspacePatterns': ['*.log', 'temp/'] });
      assert.deepStrictEqual(getWorkspacePatterns(resourceUri), ['*.log', 'temp/']);
    });

    it('getGlobalPatterns returns configured array', () => {
      mockConfig({ 'ignore.global': ['*.pem', '*.key'] });
      assert.deepStrictEqual(getGlobalPatterns(), ['*.pem', '*.key']);
    });
  });

  describe('setters', () => {
    it('setCompressionLevel updates config at WorkspaceFolder scope', async () => {
      const config = mockConfig({});
      await setCompressionLevel(resourceUri, 2);
      assert.ok(config.update.calledOnceWith('output.compressionLevel', 2, vscode.ConfigurationTarget.WorkspaceFolder));
    });

    it('setOutputLocation updates config at WorkspaceFolder scope', async () => {
      const config = mockConfig({});
      await setOutputLocation(resourceUri, 'workspaceRoot');
      assert.ok(config.update.calledOnceWith('output.location', 'workspaceRoot', vscode.ConfigurationTarget.WorkspaceFolder));
    });

    it('setUseGitignore updates config at WorkspaceFolder scope', async () => {
      const config = mockConfig({});
      await setUseGitignore(resourceUri, false);
      assert.ok(config.update.calledOnceWith('ignore.useGitignore', false, vscode.ConfigurationTarget.WorkspaceFolder));
    });

    it('setWorkspacePatterns updates config at WorkspaceFolder scope', async () => {
      const config = mockConfig({});
      await setWorkspacePatterns(resourceUri, ['*.tmp']);
      assert.ok(config.update.calledOnceWith('ignore.workspacePatterns', ['*.tmp'], vscode.ConfigurationTarget.WorkspaceFolder));
    });

    it('setGlobalPatterns updates config at Global scope', async () => {
      const config = mockConfig({});
      await setGlobalPatterns(['*.crt']);
      assert.ok(config.update.calledOnceWith('ignore.global', ['*.crt'], vscode.ConfigurationTarget.Global));
    });
  });

  describe('addWorkspacePattern', () => {
    it('does nothing when user cancels input', async () => {
      stubs.window.showInputBox.resolves(undefined);
      await addWorkspacePattern(resourceUri);
      assert.equal(stubs.window.showInformationMessage.callCount, 0);
    });

    it('adds a new pattern and reports success', async () => {
      stubs.window.showInputBox.resolves('*.bak');
      mockConfig({ 'ignore.workspacePatterns': ['*.log'] });
      await addWorkspacePattern(resourceUri);
      assert.ok(stubs.window.showInformationMessage.calledWith('SnapZip: added workspace ignore pattern "*.bak".'));
    });

    it('does not duplicate existing workspace patterns', async () => {
      stubs.window.showInputBox.resolves('*.log');
      mockConfig({ 'ignore.workspacePatterns': ['*.log'] });
      await addWorkspacePattern(resourceUri);
      assert.ok(stubs.window.showInformationMessage.calledWith('SnapZip: pattern "*.log" already exists.'));
    });
  });

  describe('addGlobalPattern', () => {
    it('does nothing when user cancels input', async () => {
      stubs.window.showInputBox.resolves(undefined);
      await addGlobalPattern();
      assert.equal(stubs.window.showInformationMessage.callCount, 0);
    });

    it('adds a new global pattern and reports success', async () => {
      stubs.window.showInputBox.resolves('*.secret');
      mockConfig({ 'ignore.global': ['*.pem'] });
      await addGlobalPattern();
      assert.ok(stubs.window.showInformationMessage.calledWith('SnapZip: added global ignore pattern "*.secret".'));
    });

    it('does not duplicate existing global patterns', async () => {
      stubs.window.showInputBox.resolves('*.pem');
      mockConfig({ 'ignore.global': ['*.pem'] });
      await addGlobalPattern();
      assert.ok(stubs.window.showInformationMessage.calledWith('SnapZip: pattern "*.pem" already exists globally.'));
    });
  });

  describe('managePatterns', () => {
    it('shows info when there are no patterns', async () => {
      mockConfig({ 'ignore.workspacePatterns': [], 'ignore.global': [] });
      await managePatterns(resourceUri);
      assert.ok(stubs.window.showInformationMessage.calledWith('SnapZip: no custom ignore patterns configured yet.'));
    });

    it('removes selected workspace patterns', async () => {
      stubs.window.showQuickPick.resolves([{ label: '*.log', description: 'workspace' }]);
      const config = mockConfig({ 'ignore.workspacePatterns': ['*.log', '*.tmp'], 'ignore.global': [] });
      await managePatterns(resourceUri);
      assert.ok(config.update.calledWith('ignore.workspacePatterns', ['*.tmp']));
      assert.ok(stubs.window.showInformationMessage.calledWith('SnapZip: removed 1 pattern(s).'));
    });

    it('removes selected global patterns', async () => {
      stubs.window.showQuickPick.resolves([{ label: '*.pem', description: 'global' }]);
      const config = mockConfig({ 'ignore.workspacePatterns': [], 'ignore.global': ['*.pem', '*.key'] });
      await managePatterns(resourceUri);
      assert.ok(config.update.calledWith('ignore.global', ['*.key']));
    });

    it('does nothing when user cancels picker', async () => {
      stubs.window.showQuickPick.resolves(undefined);
      const config = mockConfig({ 'ignore.workspacePatterns': ['*.log'], 'ignore.global': [] });
      await managePatterns(resourceUri);
      assert.equal(config.update.callCount, 0);
    });
  });

  describe('clipboard helpers', () => {
    it('copyWorkspacePatternsToClipboard writes JSON and reports count', async () => {
      mockConfig({ 'ignore.workspacePatterns': ['*.log', 'temp/'] });
      await copyWorkspacePatternsToClipboard(resourceUri);
      assert.ok(stubs.env.clipboard.writeText.calledWith(JSON.stringify(['*.log', 'temp/'], null, 2)));
      assert.ok(stubs.window.showInformationMessage.calledWith('SnapZip: copied 2 workspace ignore pattern(s) to clipboard.'));
    });

    it('pasteWorkspacePatternsFromClipboard merges by default', async () => {
      stubs.env.clipboard.readText.resolves(JSON.stringify(['*.bak']));
      stubs.window.showQuickPick.resolves('Merge with existing');
      const config = mockConfig({ 'ignore.workspacePatterns': ['*.log'] });
      await pasteWorkspacePatternsFromClipboard(resourceUri);
      assert.ok(config.update.calledWith('ignore.workspacePatterns', ['*.log', '*.bak']));
    });

    it('pasteWorkspacePatternsFromClipboard replaces when chosen', async () => {
      stubs.env.clipboard.readText.resolves(JSON.stringify(['*.secret']));
      stubs.window.showQuickPick.resolves('Replace existing');
      const config = mockConfig({ 'ignore.workspacePatterns': ['*.log'] });
      await pasteWorkspacePatternsFromClipboard(resourceUri);
      assert.ok(config.update.calledWith('ignore.workspacePatterns', ['*.secret']));
    });

    it('pasteWorkspacePatternsFromClipboard errors on invalid clipboard', async () => {
      stubs.env.clipboard.readText.resolves('not-json');
      await pasteWorkspacePatternsFromClipboard(resourceUri);
      assert.ok(stubs.window.showErrorMessage.calledWith('SnapZip: clipboard does not contain a valid pattern list (JSON string array).'));
    });

    it('pasteWorkspacePatternsFromClipboard errors on non-string-array JSON', async () => {
      stubs.env.clipboard.readText.resolves('{"not":"array"}');
      await pasteWorkspacePatternsFromClipboard(resourceUri);
      assert.ok(stubs.window.showErrorMessage.calledWith('SnapZip: clipboard does not contain a valid pattern list (JSON string array).'));
    });
  });
});
