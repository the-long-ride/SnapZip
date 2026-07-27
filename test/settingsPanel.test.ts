import { strict as assert } from 'assert';
import './setup';
import { renderHtml } from '../src/settingsPanel';

describe('settingsPanel renderHtml', () => {
  const baseState = {
    outputLocation: 'workspaceRoot',
    compressionLevel: 2,
    useGitignore: true,
    workspacePatterns: ['*.log', 'temp/'],
    globalPatterns: ['*.key', '*.pem']
  };

  it('renders output location selection', () => {
    const html = renderHtml(baseState);
    assert.ok(html.includes('value="workspaceRoot" selected'));
    assert.ok(html.includes('value="parentFolder"'));
  });

  it('renders compression level options and selects current value', () => {
    const html = renderHtml(baseState);
    assert.ok(html.includes('<option value="2" selected>'));
    assert.ok(html.includes('1 - Fastest'));
    assert.ok(html.includes('4 - Maximum'));
  });

  it('checks gitignore checkbox when enabled', () => {
    const htmlOn = renderHtml({ ...baseState, useGitignore: true });
    assert.ok(htmlOn.includes('id="useGitignore" checked'));
    const htmlOff = renderHtml({ ...baseState, useGitignore: false });
    assert.ok(!htmlOff.includes('id="useGitignore" checked'));
  });

  it('escapes HTML in patterns before rendering', () => {
    const html = renderHtml({
      ...baseState,
      workspacePatterns: ['<script>alert("xss")</script>']
    });
    assert.ok(!html.includes('<script>alert("xss")</script>'));
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
  });

  it('renders workspace and global patterns joined by newline', () => {
    const html = renderHtml(baseState);
    assert.ok(html.includes('*.log\ntemp/'));
    assert.ok(html.includes('*.key\n*.pem'));
  });

  it('includes all expected message handlers in the script', () => {
    const html = renderHtml(baseState);
    assert.ok(html.includes("type: 'setOutputLocation'"));
    assert.ok(html.includes("type: 'setCompressionLevel'"));
    assert.ok(html.includes("type: 'setUseGitignore'"));
    assert.ok(html.includes("type: 'setWorkspacePatterns'"));
    assert.ok(html.includes("type: 'setGlobalPatterns'"));
  });
});
