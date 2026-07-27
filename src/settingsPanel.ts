import * as vscode from 'vscode';
import {
  getCompressionLevel,
  getGlobalPatterns,
  getOutputLocation,
  getUseGitignore,
  getWorkspacePatterns,
  setCompressionLevel,
  setGlobalPatterns,
  setOutputLocation,
  setUseGitignore,
  setWorkspacePatterns
} from './patternsManager';

let activePanel: vscode.WebviewPanel | undefined;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderHtml(state: {
  outputLocation: string;
  compressionLevel: number;
  useGitignore: boolean;
  workspacePatterns: string[];
  globalPatterns: string[];
}): string {
  const levelLabels: Record<number, string> = {
    1: '1 - Fastest (least compressed)',
    2: '2 - Fast',
    3: '3 - Balanced (default)',
    4: '4 - Maximum (smallest, slowest)'
  };

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 20px 24px 40px;
    max-width: 640px;
  }
  h2 { margin-top: 28px; margin-bottom: 6px; font-size: 1.05em; }
  h2:first-child { margin-top: 0; }
  .hint { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin: 0 0 10px; }
  select, textarea, input[type="text"] {
    width: 100%;
    box-sizing: border-box;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 6px 8px;
    border-radius: 3px;
    font-family: var(--vscode-font-family);
  }
  textarea { min-height: 90px; font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; resize: vertical; }
  label.checkbox { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 14px;
    border-radius: 3px;
    cursor: pointer;
    margin-top: 8px;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .row { margin-bottom: 4px; }
  .saved { color: var(--vscode-testing-iconPassed, #4caf50); font-size: 0.85em; margin-left: 10px; opacity: 0; transition: opacity .2s; }
  .saved.show { opacity: 1; }
  .section { border: 1px solid var(--vscode-widget-border, #3c3c3c); border-radius: 6px; padding: 14px 16px; margin-bottom: 14px; }
</style>
</head>
<body>

  <div class="section">
    <h2>Output location</h2>
    <p class="hint">Where generated .zip files are saved.</p>
    <select id="outputLocation">
      <option value="parentFolder" ${state.outputLocation === 'parentFolder' ? 'selected' : ''}>Parent folder of the item being zipped</option>
      <option value="workspaceRoot" ${state.outputLocation === 'workspaceRoot' ? 'selected' : ''}>Workspace root folder</option>
    </select>
  </div>

  <div class="section">
    <h2>Compression level</h2>
    <p class="hint">1 = fastest / least compressed, 4 = slowest / smallest file.</p>
    <select id="compressionLevel">
      ${[1, 2, 3, 4]
        .map(
          (n) => `<option value="${n}" ${state.compressionLevel === n ? 'selected' : ''}>${levelLabels[n]}</option>`
        )
        .join('')}
    </select>
  </div>

  <div class="section">
    <h2>Git ignore rules</h2>
    <label class="checkbox">
      <input type="checkbox" id="useGitignore" ${state.useGitignore ? 'checked' : ''} />
      Respect .gitignore files (root, parent folders, and nested folders of the target)
    </label>
  </div>

  <div class="section">
    <h2>Workspace ignore patterns</h2>
    <p class="hint">One gitignore-style pattern per line. Lines starting with # are ignored as comments. Applies only to this workspace.</p>
    <textarea id="workspacePatterns" spellcheck="false">${esc(state.workspacePatterns.join('\n'))}</textarea>
    <div class="row">
      <button id="saveWorkspacePatterns">Save</button>
      <span class="saved" id="savedWorkspace">Saved</span>
    </div>
  </div>

  <div class="section">
    <h2>Global ignore patterns</h2>
    <p class="hint">One gitignore-style pattern per line. Lines starting with # are ignored as comments. Applies to every workspace (sensitive files, credentials, etc.).</p>
    <textarea id="globalPatterns" spellcheck="false">${esc(state.globalPatterns.join('\n'))}</textarea>
    <div class="row">
      <button id="saveGlobalPatterns">Save</button>
      <span class="saved" id="savedGlobal">Saved</span>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();

  document.getElementById('outputLocation').addEventListener('change', (e) => {
    vscode.postMessage({ type: 'setOutputLocation', value: e.target.value });
  });

  document.getElementById('compressionLevel').addEventListener('change', (e) => {
    vscode.postMessage({ type: 'setCompressionLevel', value: Number(e.target.value) });
  });

  document.getElementById('useGitignore').addEventListener('change', (e) => {
    vscode.postMessage({ type: 'setUseGitignore', value: e.target.checked });
  });

  function flash(id) {
    const el = document.getElementById(id);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1200);
  }

  document.getElementById('saveWorkspacePatterns').addEventListener('click', () => {
    const lines = document.getElementById('workspacePatterns').value.split('\\n').map(s => s.trim()).filter(Boolean);
    vscode.postMessage({ type: 'setWorkspacePatterns', value: lines });
    flash('savedWorkspace');
  });

  document.getElementById('saveGlobalPatterns').addEventListener('click', () => {
    const lines = document.getElementById('globalPatterns').value.split('\\n').map(s => s.trim()).filter(Boolean);
    vscode.postMessage({ type: 'setGlobalPatterns', value: lines });
    flash('savedGlobal');
  });
</script>
</body>
</html>`;
}

export function openSettingsPanel(context: vscode.ExtensionContext) {
  const resourceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!resourceUri) {
    vscode.window.showWarningMessage('SnapZip: open a workspace folder first to edit settings.');
    return;
  }

  if (activePanel) {
    activePanel.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'snapZipSettings',
    'SnapZip Settings',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  activePanel = panel;

  const render = () => {
    panel.webview.html = renderHtml({
      outputLocation: getOutputLocation(resourceUri),
      compressionLevel: getCompressionLevel(resourceUri),
      useGitignore: getUseGitignore(resourceUri),
      workspacePatterns: getWorkspacePatterns(resourceUri),
      globalPatterns: getGlobalPatterns()
    });
  };
  render();

  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.type) {
      case 'setOutputLocation':
        await setOutputLocation(resourceUri, msg.value);
        break;
      case 'setCompressionLevel':
        await setCompressionLevel(resourceUri, msg.value);
        break;
      case 'setUseGitignore':
        await setUseGitignore(resourceUri, msg.value);
        break;
      case 'setWorkspacePatterns':
        await setWorkspacePatterns(resourceUri, msg.value);
        break;
      case 'setGlobalPatterns':
        await setGlobalPatterns(msg.value);
        break;
    }
  });

  panel.onDidDispose(() => {
    activePanel = undefined;
  });
}
