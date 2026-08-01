import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildIgnoreMatcher } from '../src/ignoreEngine';

describe('ignoreEngine', () => {
  let tmpDir: string;
  let workspaceRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapzip-ignore-test-'));
    workspaceRoot = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(absPath: string, content = 'x') {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content);
  }

  it('applies global patterns', () => {
    const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
      useGitignore: false,
      workspacePatterns: [],
      globalPatterns: ['*.key', 'secrets/**']
    });
    assert.ok(matcher.ignores('secrets/root.crt'));
    assert.ok(matcher.ignores('deploy.key'));
  });

  it('applies workspace patterns', () => {
    const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
      useGitignore: false,
      workspacePatterns: ['*.tmp', 'cache/'],
      globalPatterns: []
    });
    assert.ok(matcher.ignores('build/output.tmp'));
    assert.ok(matcher.ignores('cache/data.json'));
    assert.ok(!matcher.ignores('src/main.ts'));
  });

  it('ignores comment lines in pattern lists', () => {
    const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
      useGitignore: false,
      workspacePatterns: ['# comment', '*.log'],
      globalPatterns: ['# also a comment', 'node_modules/']
    });
    assert.ok(matcher.ignores('debug.log'));
    assert.ok(!matcher.ignores('# comment'));
  });

  it('keeps # group-header comments in pattern lists (native ignore comment handling)', () => {
    const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
      useGitignore: false,
      workspacePatterns: ['# --- group ---', 'cache/', '# another group', '*.tmp'],
      globalPatterns: []
    });
    assert.ok(matcher.ignores('cache/x.json'));
    assert.ok(matcher.ignores('a.tmp'));
    // Comment line itself is not an actual ignore target.
    assert.ok(!matcher.ignores('# --- group ---'));
  });

  it('ignores built directories at any depth, not only project root', () => {
    const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
      useGitignore: false,
      workspacePatterns: [],
      globalPatterns: ['**/build/', '**/dist/', '**/out/']
    });
    assert.ok(matcher.ignores('build/bundle.js'));
    assert.ok(matcher.ignores('dist/app.js'));
    assert.ok(matcher.ignores('packages/api/build/bundle.js'));
    assert.ok(matcher.ignores('apps/web/dist/index.html'));
    assert.ok(matcher.ignores('deep/nested/folder/out/foo.js'));
    assert.ok(!matcher.ignores('src/main.ts'));
  });

  it('normalizes Windows-style backslashes in patterns', () => {
    const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
      useGitignore: false,
      workspacePatterns: ['sub\\cache\\'],
      globalPatterns: []
    });
    assert.ok(matcher.ignores('sub/cache/x.json'));
  });

  it('handles negation (!) patterns from workspace patterns (gitignore re-include idiom)', () => {
    // Real-world idiom: re-include a single file inside an ignored directory
    // by first re-including the parent dir, then excluding everything else in
    // it, then negating the specific file.
    const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
      useGitignore: false,
      workspacePatterns: [
        '**/build/',
        '!electron/build/',
        'electron/build/*',
        '!electron/build/installer.nsh'
      ],
      globalPatterns: []
    });
    assert.ok(!matcher.ignores('electron/build/installer.nsh'));
    assert.ok(matcher.ignores('electron/build/other.js'));
    assert.ok(matcher.ignores('packages/api/build/x.js'));
  });

  it('normalizes backslash negation patterns from workspace patterns', () => {
    // `!electron\build\installer.nsh` (Windows style) -- with parent re-included.
    const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
      useGitignore: false,
      workspacePatterns: [
        '**/build/',
        '!electron\\build\\',
        'electron/build/*',
        '!electron\\build\\installer.nsh'
      ],
      globalPatterns: []
    });
    assert.ok(!matcher.ignores('electron/build/installer.nsh'));
  });

  describe('gitignore support', () => {
    it('respects root .gitignore', () => {
      writeFile(path.join(workspaceRoot, '.gitignore'), '*.env\n.env.local\n');
      writeFile(path.join(workspaceRoot, 'app.env'), 'x');
      writeFile(path.join(workspaceRoot, 'app.ts'), 'x');

      const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
        useGitignore: true,
        workspacePatterns: [],
        globalPatterns: []
      });

      assert.ok(matcher.ignores('app.env'));
      assert.ok(matcher.ignores('.env.local'));
      assert.ok(!matcher.ignores('app.ts'));
    });

    it('respects parent-folder .gitignore (scoped to its directory)', () => {
      const target = path.join(workspaceRoot, 'packages', 'api');
      fs.mkdirSync(target, { recursive: true });
      writeFile(path.join(workspaceRoot, '.gitignore'), '*.log');
      writeFile(path.join(workspaceRoot, 'packages', '.gitignore'), 'private.md');

      const matcher = buildIgnoreMatcher(workspaceRoot, target, {
        useGitignore: true,
        workspacePatterns: [],
        globalPatterns: []
      });

      assert.ok(matcher.ignores('debug.log'));
      assert.ok(matcher.ignores('packages/private.md'));
      assert.ok(matcher.ignores('packages/api/private.md'));
    });

    it('respects nested .gitignore inside the target subtree', () => {
      const target = path.join(workspaceRoot, 'src');
      fs.mkdirSync(target, { recursive: true });
      writeFile(path.join(target, '.gitignore'), '*.generated.ts');
      writeFile(path.join(target, 'real.ts'), 'x');
      writeFile(path.join(target, 'types.generated.ts'), 'x');

      const matcher = buildIgnoreMatcher(workspaceRoot, target, {
        useGitignore: true,
        workspacePatterns: [],
        globalPatterns: []
      });

      assert.ok(matcher.ignores('src/types.generated.ts'));
      assert.ok(!matcher.ignores('src/real.ts'));
    });

    it('does not descend into .git for gitignore scanning', () => {
      const gitDir = path.join(workspaceRoot, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      writeFile(path.join(gitDir, '.gitignore'), '*.ignored');
      writeFile(path.join(workspaceRoot, 'a.txt'), 'x');

      const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
        useGitignore: true,
        workspacePatterns: [],
        globalPatterns: []
      });

      assert.ok(!matcher.ignores('a.txt'));
    });

    it('handles negation patterns from .gitignore', () => {
      writeFile(path.join(workspaceRoot, '.gitignore'), '*.log\n!important.log\n');

      const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
        useGitignore: true,
        workspacePatterns: [],
        globalPatterns: []
      });

      assert.ok(matcher.ignores('debug.log'));
      assert.ok(!matcher.ignores('important.log'));
    });

    it('handles directory-only patterns', () => {
      writeFile(path.join(workspaceRoot, '.gitignore'), 'dist/\n');

      const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
        useGitignore: true,
        workspacePatterns: [],
        globalPatterns: []
      });

      assert.ok(matcher.ignores('dist/bundle.js'));
    });

    it('respects # group comments in .gitignore without matching them as patterns', () => {
      writeFile(
        path.join(workspaceRoot, '.gitignore'),
        '# --- Build output ---\ndist/\n# --- Logs ---\n*.log\n'
      );

      const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
        useGitignore: true,
        workspacePatterns: [],
        globalPatterns: []
      });

      assert.ok(matcher.ignores('dist/bundle.js'));
      assert.ok(matcher.ignores('debug.log'));
      assert.ok(!matcher.ignores('# --- Build output ---'));
    });

    it('ignores nested built directories via **/build/ style .gitignore rules', () => {
      writeFile(
        path.join(workspaceRoot, '.gitignore'),
        '**/build/\n**/dist/\n'
      );

      const matcher = buildIgnoreMatcher(workspaceRoot, workspaceRoot, {
        useGitignore: true,
        workspacePatterns: [],
        globalPatterns: []
      });

      assert.ok(matcher.ignores('packages/api/build/x.js'));
      assert.ok(matcher.ignores('apps/web/dist/index.html'));
      assert.ok(matcher.ignores('build/top.js'));
    });
  });
});
