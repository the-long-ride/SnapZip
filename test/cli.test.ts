import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as unzipper from 'unzipper';
import {
  parseArgs,
  formatBytes,
  getVersion,
  findWorkspaceRoot,
  getHelpText,
  parseJsonc,
  loadIgnoreFile,
  loadVscodeSettings,
  loadSnapziprc,
  loadConfigFile,
  runCli,
} from '../src/cli';

describe('cli', () => {
  describe('parseArgs', () => {
    it('uses expected defaults when no arguments provided', () => {
      const opts = parseArgs([]);
      assert.equal(opts.targetFolder, undefined);
      assert.equal(opts.outputDir, undefined);
      assert.equal(opts.configFile, undefined);
      assert.equal(opts.compressionLevel, 3);
      assert.equal(opts.useGitignore, true);
      assert.deepEqual(opts.extraIgnorePatterns, []);
      assert.equal(opts.showHelp, false);
      assert.equal(opts.showVersion, false);
    });

    it('parses help flags', () => {
      assert.equal(parseArgs(['-h']).showHelp, true);
      assert.equal(parseArgs(['--help']).showHelp, true);
    });

    it('parses version flags', () => {
      assert.equal(parseArgs(['-v']).showVersion, true);
      assert.equal(parseArgs(['--version']).showVersion, true);
    });

    it('parses output directory option', () => {
      assert.equal(parseArgs(['-o', 'my-out']).outputDir, 'my-out');
      assert.equal(parseArgs(['--output', 'other-out']).outputDir, 'other-out');
      assert.equal(parseArgs(['--output=eq-out']).outputDir, 'eq-out');
    });

    it('parses config file option', () => {
      assert.equal(parseArgs(['-c', 'custom.json']).configFile, 'custom.json');
      assert.equal(parseArgs(['--config', 'other.json']).configFile, 'other.json');
      assert.equal(parseArgs(['--config=eq.json']).configFile, 'eq.json');
    });

    it('parses compression level option', () => {
      assert.equal(parseArgs(['-l', '1']).compressionLevel, 1);
      assert.equal(parseArgs(['--level', '4']).compressionLevel, 4);
      assert.equal(parseArgs(['--level=2']).compressionLevel, 2);
      // Ignores invalid levels
      assert.equal(parseArgs(['--level', '99']).compressionLevel, 3);
    });

    it('parses --no-gitignore option', () => {
      assert.equal(parseArgs(['--no-gitignore']).useGitignore, false);
    });

    it('parses ignore patterns (repeatable and comma-separated)', () => {
      const opts = parseArgs(['-i', '*.log,temp/', '--ignore=build/**', '-i', 'cache/']);
      assert.deepEqual(opts.extraIgnorePatterns, ['*.log', 'temp/', 'build/**', 'cache/']);
    });

    it('parses positional target folder', () => {
      const opts = parseArgs(['my-app', '-l', '2']);
      assert.equal(opts.targetFolder, 'my-app');
      assert.equal(opts.compressionLevel, 2);
    });
  });

  describe('helpers', () => {
    it('formatBytes formats sizes accurately', () => {
      assert.equal(formatBytes(0), '0 B');
      assert.equal(formatBytes(1024), '1.00 KB');
      assert.equal(formatBytes(1048576), '1.00 MB');
    });

    it('getVersion returns semver string', () => {
      const v = getVersion();
      assert.match(v, /^\d+\.\d+\.\d+/);
    });

    it('getHelpText returns usage documentation', () => {
      const help = getHelpText();
      assert.ok(help.includes('snapzip [folder] [options]'));
      assert.ok(help.includes('.vscode/settings.json'));
      assert.ok(help.includes('.snapzipignore'));
      assert.ok(help.includes('~/.snapziprc'));
    });

    it('findWorkspaceRoot locates git root or defaults to directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapzip-ws-test-'));
      try {
        const sub = path.join(tmpDir, 'a', 'b', 'c');
        fs.mkdirSync(sub, { recursive: true });

        // Without .git, returns target itself
        assert.equal(findWorkspaceRoot(sub), path.resolve(sub));

        // With .git in parent
        fs.mkdirSync(path.join(tmpDir, 'a', '.git'));
        assert.equal(findWorkspaceRoot(sub), path.resolve(tmpDir, 'a'));
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('parseJsonc strips comments and trailing commas', () => {
      const jsonc = `
      {
        // Single line comment
        "name": "snapzip", /* inline block */
        "items": [
          "a",
          "b", // trailing comma below
        ],
      }
      `;
      const res = parseJsonc(jsonc);
      assert.deepEqual(res, { name: 'snapzip', items: ['a', 'b'] });
    });

    it('loadIgnoreFile parses lines and strips comments', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapzip-ig-'));
      try {
        const p = path.join(tmpDir, '.snapzipignore');
        fs.writeFileSync(p, '# comment\n*.tmp\n\nbuild/\n');
        const lines = loadIgnoreFile(p);
        assert.deepEqual(lines, ['*.tmp', 'build/']);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('loadVscodeSettings extracts workspace and global patterns', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapzip-vsc-'));
      try {
        const vscodeDir = path.join(tmpDir, '.vscode');
        fs.mkdirSync(vscodeDir, { recursive: true });
        fs.writeFileSync(
          path.join(vscodeDir, 'settings.json'),
          `{
            // Comment
            "snapZip.ignore.workspacePatterns": ["ws-ignore/**"],
            "snapZip.ignore.global": ["*.secret"],
          }`
        );

        const config = loadVscodeSettings(tmpDir);
        assert.deepEqual(config.workspacePatterns, ['ws-ignore/**']);
        assert.deepEqual(config.globalPatterns, ['*.secret']);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('loadSnapziprc handles JSON and plain list formats', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapzip-rc-'));
      try {
        const rcPath = path.join(tmpDir, '.snapziprc');

        // Test array JSON
        fs.writeFileSync(rcPath, '["*.custom", "private/"]');
        let config = loadSnapziprc(tmpDir);
        assert.deepEqual(config.globalPatterns, ['*.custom', 'private/']);

        // Test object JSON
        fs.writeFileSync(
          rcPath,
          JSON.stringify({
            globalPatterns: ['*.glob'],
            workspacePatterns: ['ws/**'],
          })
        );
        config = loadSnapziprc(tmpDir);
        assert.deepEqual(config.globalPatterns, ['*.glob']);
        assert.deepEqual(config.workspacePatterns, ['ws/**']);

        // Test plain text list
        fs.writeFileSync(rcPath, '# comment\n*.bak\nsecrets/\n');
        config = loadSnapziprc(tmpDir);
        assert.deepEqual(config.globalPatterns, ['*.bak', 'secrets/']);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('loadConfigFile parses custom config files', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapzip-cfg-'));
      try {
        const cfgPath = path.join(tmpDir, 'custom.json');
        fs.writeFileSync(cfgPath, JSON.stringify({ globalPatterns: ['*.a'], workspacePatterns: ['*.b'] }));
        const res = loadConfigFile(cfgPath);
        assert.deepEqual(res.globalPatterns, ['*.a']);
        assert.deepEqual(res.workspacePatterns, ['*.b']);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('runCli', () => {
    let tmpDir: string;
    let targetDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapzip-run-test-'));
      targetDir = path.join(tmpDir, 'sample-folder');
      fs.mkdirSync(targetDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    async function collectZipEntries(zipPath: string): Promise<string[]> {
      const entries: string[] = [];
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(zipPath)
          .pipe(unzipper.Parse())
          .on('entry', (entry: unzipper.Entry) => {
            entries.push(entry.path);
            entry.autodrain();
          })
          .on('close', resolve)
          .on('error', reject);
      });
      return entries;
    }

    it('handles --help and returns 0', async () => {
      let output = '';
      const code = await runCli(['--help'], (s) => (output += s + '\n'));
      assert.equal(code, 0);
      assert.ok(output.includes('Usage:'));
    });

    it('handles --version and returns 0', async () => {
      let output = '';
      const code = await runCli(['--version'], (s) => (output += s + '\n'));
      assert.equal(code, 0);
      assert.ok(output.includes('snapzip v1.0.6'));
    });

    it('returns 1 when target folder does not exist', async () => {
      let errOutput = '';
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      const code = await runCli([nonExistent], () => {}, (s) => (errOutput += s + '\n'));
      assert.equal(code, 1);
      assert.ok(errOutput.includes('Target directory does not exist'));
    });

    it('returns 1 when target is a file instead of a folder', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, 'hello');
      let errOutput = '';
      const code = await runCli([filePath], () => {}, (s) => (errOutput += s + '\n'));
      assert.equal(code, 1);
      assert.ok(errOutput.includes('Target path is not a directory'));
    });

    it('compresses directory successfully and respects extra ignore patterns', async () => {
      fs.writeFileSync(path.join(targetDir, 'keep.txt'), 'keep me');
      fs.writeFileSync(path.join(targetDir, 'drop.log'), 'drop me');

      let output = '';
      const code = await runCli(
        [targetDir, '-i', '*.log', '-o', tmpDir],
        (s) => (output += s + '\n'),
        (s) => console.error(s)
      );

      assert.equal(code, 0);
      assert.ok(output.includes('✔ Compressed 1 files'));

      const zips = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.zip'));
      assert.equal(zips.length, 1);
      const zipPath = path.join(tmpDir, zips[0]);

      const entries = await collectZipEntries(zipPath);
      assert.deepEqual(entries, ['sample-folder/keep.txt']);
    });

    it('automatically respects patterns in .vscode/settings.json', async () => {
      fs.mkdirSync(path.join(tmpDir, '.git'));
      const vscodeDir = path.join(tmpDir, '.vscode');
      fs.mkdirSync(vscodeDir, { recursive: true });
      fs.writeFileSync(
        path.join(vscodeDir, 'settings.json'),
        JSON.stringify({
          'snapZip.ignore.workspacePatterns': ['**/skip-me/**'],
        })
      );

      const subDir = path.join(targetDir, 'skip-me');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'hidden.txt'), 'skip');
      fs.writeFileSync(path.join(targetDir, 'keep.txt'), 'keep');

      const outDir = path.join(tmpDir, 'out-zip');
      const code = await runCli([targetDir, '-o', outDir], () => {});
      assert.equal(code, 0);

      const zips = fs.readdirSync(outDir).filter((f) => f.endsWith('.zip'));
      const entries = await collectZipEntries(path.join(outDir, zips[0]));
      assert.deepEqual(entries, ['sample-folder/keep.txt']);
    });

    it('automatically respects patterns in .snapzipignore', async () => {
      fs.writeFileSync(path.join(targetDir, '.snapzipignore'), 'ignore-dir/\n');
      const ignoreDir = path.join(targetDir, 'ignore-dir');
      fs.mkdirSync(ignoreDir, { recursive: true });
      fs.writeFileSync(path.join(ignoreDir, 'ignored.txt'), 'ignored');
      fs.writeFileSync(path.join(targetDir, 'included.txt'), 'included');

      const outDir = path.join(tmpDir, 'out-snapzipignore');
      const code = await runCli([targetDir, '-o', outDir], () => {});
      assert.equal(code, 0);

      const zips = fs.readdirSync(outDir).filter((f) => f.endsWith('.zip'));
      const entries = await collectZipEntries(path.join(outDir, zips[0]));
      assert.deepEqual(entries, ['sample-folder/included.txt']);
    });

    it('respects patterns provided via custom --config file', async () => {
      const cfgPath = path.join(tmpDir, 'custom-rules.json');
      fs.writeFileSync(cfgPath, JSON.stringify({ workspacePatterns: ['*.draft'] }));

      fs.writeFileSync(path.join(targetDir, 'note.draft'), 'draft');
      fs.writeFileSync(path.join(targetDir, 'note.txt'), 'final');

      const outDir = path.join(tmpDir, 'out-config');
      const code = await runCli([targetDir, '--config', cfgPath, '-o', outDir], () => {});
      assert.equal(code, 0);

      const zips = fs.readdirSync(outDir).filter((f) => f.endsWith('.zip'));
      const entries = await collectZipEntries(path.join(outDir, zips[0]));
      assert.deepEqual(entries, ['sample-folder/note.txt']);
    });
  });
});
