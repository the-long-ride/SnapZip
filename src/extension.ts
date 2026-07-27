import * as vscode from 'vscode';
import * as path from 'path';
import { buildIgnoreMatcher } from './ignoreEngine';
import { zipFolder } from './zipper';
import {
  getCompressionLevel,
  getGlobalPatterns,
  getOutputLocation,
  getUseGitignore,
  getWorkspacePatterns,
  addWorkspacePattern,
  addGlobalPattern,
  managePatterns,
  copyWorkspacePatternsToClipboard,
  pasteWorkspacePatternsFromClipboard
} from './patternsManager';
import { openSettingsPanel } from './settingsPanel';

function resolveWorkspaceRoot(targetUri: vscode.Uri): string | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(targetUri);
  return folder?.uri.fsPath;
}

async function runZip(targetDirAbs: string, workspaceRootAbs: string, resourceUri: vscode.Uri) {
  const useGitignore = getUseGitignore(resourceUri);
  const workspacePatterns = getWorkspacePatterns(resourceUri);
  const globalPatterns = getGlobalPatterns();
  const outputLocation = getOutputLocation(resourceUri);
  const compressionLevel = getCompressionLevel(resourceUri);

  const outputDirAbs =
    outputLocation === 'workspaceRoot' ? workspaceRootAbs : path.dirname(targetDirAbs);

  const ig = buildIgnoreMatcher(workspaceRootAbs, targetDirAbs, {
    useGitignore,
    workspacePatterns,
    globalPatterns
  });

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `SnapZip: compressing "${path.basename(targetDirAbs)}"...`,
      cancellable: false
    },
    async () => {
      const result = await zipFolder(workspaceRootAbs, targetDirAbs, outputDirAbs, ig, compressionLevel);
      const openAction = 'Reveal in Explorer';
      const choice = await vscode.window.showInformationMessage(
        `SnapZip: created ${path.basename(result.outputPath)} (${result.fileCount} files).`,
        openAction
      );
      if (choice === openAction) {
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.outputPath));
      }
    }
  );
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('snapZip.compressFolder', async (uri?: vscode.Uri) => {
      let targetUri = uri;
      if (!targetUri) {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Compress as .zip'
        });
        targetUri = picked?.[0];
      }
      if (!targetUri) return;

      const workspaceRootAbs = resolveWorkspaceRoot(targetUri) ?? targetUri.fsPath;
      try {
        await runZip(targetUri.fsPath, workspaceRootAbs, targetUri);
      } catch (err: any) {
        vscode.window.showErrorMessage(`SnapZip: failed to compress folder - ${err?.message ?? err}`);
      }
    }),

    vscode.commands.registerCommand('snapZip.compressWorkspace', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        vscode.window.showWarningMessage('SnapZip: no workspace folder is open.');
        return;
      }
      try {
        for (const folder of folders) {
          await runZip(folder.uri.fsPath, folder.uri.fsPath, folder.uri);
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`SnapZip: failed to compress workspace - ${err?.message ?? err}`);
      }
    }),

    vscode.commands.registerCommand('snapZip.addWorkspaceIgnorePattern', async () => {
      const uri = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!uri) {
        vscode.window.showWarningMessage('SnapZip: no workspace folder is open.');
        return;
      }
      await addWorkspacePattern(uri);
    }),

    vscode.commands.registerCommand('snapZip.addGlobalIgnorePattern', async () => {
      await addGlobalPattern();
    }),

    vscode.commands.registerCommand('snapZip.manageIgnorePatterns', async () => {
      const uri = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!uri) {
        vscode.window.showWarningMessage('SnapZip: no workspace folder is open.');
        return;
      }
      await managePatterns(uri);
    }),

    vscode.commands.registerCommand('snapZip.copyWorkspacePatterns', async () => {
      const uri = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!uri) {
        vscode.window.showWarningMessage('SnapZip: no workspace folder is open.');
        return;
      }
      await copyWorkspacePatternsToClipboard(uri);
    }),

    vscode.commands.registerCommand('snapZip.pasteWorkspacePatterns', async () => {
      const uri = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!uri) {
        vscode.window.showWarningMessage('SnapZip: no workspace folder is open.');
        return;
      }
      await pasteWorkspacePatternsFromClipboard(uri);
    }),

    vscode.commands.registerCommand('snapZip.openSettings', () => {
      openSettingsPanel(context);
    })
  );
}

export function deactivate() {}
