import * as vscode from 'vscode';

const CONFIG_SECTION = 'snapZip';

export function getUseGitignore(resource: vscode.Uri): boolean {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION, resource)
    .get<boolean>('ignore.useGitignore', true);
}

export function getOutputLocation(resource: vscode.Uri): 'parentFolder' | 'workspaceRoot' {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION, resource)
    .get<'parentFolder' | 'workspaceRoot'>('output.location', 'parentFolder');
}

export function getCompressionLevel(resource: vscode.Uri): number {
  return vscode.workspace.getConfiguration(CONFIG_SECTION, resource).get<number>('output.compressionLevel', 3);
}

export async function setCompressionLevel(resource: vscode.Uri, level: number): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION, resource)
    .update('output.compressionLevel', level, vscode.ConfigurationTarget.WorkspaceFolder);
}

export async function setOutputLocation(
  resource: vscode.Uri,
  location: 'parentFolder' | 'workspaceRoot'
): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION, resource)
    .update('output.location', location, vscode.ConfigurationTarget.WorkspaceFolder);
}

export async function setUseGitignore(resource: vscode.Uri, value: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION, resource)
    .update('ignore.useGitignore', value, vscode.ConfigurationTarget.WorkspaceFolder);
}

export function getWorkspacePatterns(resource: vscode.Uri): string[] {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION, resource)
    .get<string[]>('ignore.workspacePatterns', []);
}

export function getGlobalPatterns(): string[] {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<string[]>('ignore.global', []);
}

export async function setWorkspacePatterns(resource: vscode.Uri, patterns: string[]): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION, resource)
    .update('ignore.workspacePatterns', patterns, vscode.ConfigurationTarget.WorkspaceFolder);
}

export async function setGlobalPatterns(patterns: string[]): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update('ignore.global', patterns, vscode.ConfigurationTarget.Global);
}

export async function addWorkspacePattern(resource: vscode.Uri): Promise<void> {
  const pattern = await vscode.window.showInputBox({
    prompt: 'Gitignore-style pattern to exclude for this workspace (e.g. dist/**, *.log)',
    placeHolder: '*.log'
  });
  if (!pattern) return;
  const current = getWorkspacePatterns(resource);
  if (current.includes(pattern)) {
    vscode.window.showInformationMessage(`SnapZip: pattern "${pattern}" already exists.`);
    return;
  }
  await setWorkspacePatterns(resource, [...current, pattern]);
  vscode.window.showInformationMessage(`SnapZip: added workspace ignore pattern "${pattern}".`);
}

export async function addGlobalPattern(): Promise<void> {
  const pattern = await vscode.window.showInputBox({
    prompt: 'Gitignore-style pattern to exclude for ALL workspaces (e.g. *.pem, .env.*)',
    placeHolder: '*.pem'
  });
  if (!pattern) return;
  const current = getGlobalPatterns();
  if (current.includes(pattern)) {
    vscode.window.showInformationMessage(`SnapZip: pattern "${pattern}" already exists globally.`);
    return;
  }
  await setGlobalPatterns([...current, pattern]);
  vscode.window.showInformationMessage(`SnapZip: added global ignore pattern "${pattern}".`);
}

export async function managePatterns(resource: vscode.Uri): Promise<void> {
  const workspacePatterns = getWorkspacePatterns(resource);
  const globalPatterns = getGlobalPatterns();

  const items: vscode.QuickPickItem[] = [
    ...workspacePatterns.map((p) => ({ label: p, description: 'workspace' })),
    ...globalPatterns.map((p) => ({ label: p, description: 'global' }))
  ];

  if (items.length === 0) {
    vscode.window.showInformationMessage('SnapZip: no custom ignore patterns configured yet.');
    return;
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a pattern to remove (Escape to cancel)',
    canPickMany: true
  });
  if (!picked || picked.length === 0) return;

  const toRemoveWorkspace = new Set(picked.filter((p) => p.description === 'workspace').map((p) => p.label));
  const toRemoveGlobal = new Set(picked.filter((p) => p.description === 'global').map((p) => p.label));

  if (toRemoveWorkspace.size > 0) {
    await setWorkspacePatterns(
      resource,
      workspacePatterns.filter((p) => !toRemoveWorkspace.has(p))
    );
  }
  if (toRemoveGlobal.size > 0) {
    await setGlobalPatterns(globalPatterns.filter((p) => !toRemoveGlobal.has(p)));
  }
  vscode.window.showInformationMessage(`SnapZip: removed ${picked.length} pattern(s).`);
}

export async function copyWorkspacePatternsToClipboard(resource: vscode.Uri): Promise<void> {
  const patterns = getWorkspacePatterns(resource);
  await vscode.env.clipboard.writeText(JSON.stringify(patterns, null, 2));
  vscode.window.showInformationMessage(
    `SnapZip: copied ${patterns.length} workspace ignore pattern(s) to clipboard.`
  );
}

export async function pasteWorkspacePatternsFromClipboard(resource: vscode.Uri): Promise<void> {
  const text = await vscode.env.clipboard.readText();
  let incoming: string[];
  try {
    incoming = JSON.parse(text);
    if (!Array.isArray(incoming) || !incoming.every((p) => typeof p === 'string')) {
      throw new Error('not a string array');
    }
  } catch {
    vscode.window.showErrorMessage('SnapZip: clipboard does not contain a valid pattern list (JSON string array).');
    return;
  }

  const choice = await vscode.window.showQuickPick(['Merge with existing', 'Replace existing'], {
    placeHolder: 'How should these patterns be applied to this workspace?'
  });
  if (!choice) return;

  const current = getWorkspacePatterns(resource);
  const next = choice === 'Replace existing' ? incoming : Array.from(new Set([...current, ...incoming]));
  await setWorkspacePatterns(resource, next);
  vscode.window.showInformationMessage(`SnapZip: applied ${next.length} workspace ignore pattern(s).`);
}
