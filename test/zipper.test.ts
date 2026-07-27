import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ignore from 'ignore';
import * as unzipper from 'unzipper';
import { zipFolder, toZlibLevel, ZipResult } from '../src/zipper';

describe('zipper', () => {
  describe('toZlibLevel', () => {
    it('maps user-facing levels to zlib levels', () => {
      assert.equal(toZlibLevel(1), 2);
      assert.equal(toZlibLevel(2), 5);
      assert.equal(toZlibLevel(3), 7);
      assert.equal(toZlibLevel(4), 9);
    });

    it('defaults to level 7 for unknown levels', () => {
      assert.equal(toZlibLevel(0), 7);
      assert.equal(toZlibLevel(99), 7);
      assert.equal(toZlibLevel(-3), 7);
    });
  });

  describe('zipFolder', () => {
    let tmpDir: string;
    let workspaceRoot: string;
    let targetDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapzip-test-'));
      workspaceRoot = path.join(tmpDir, 'workspace');
      targetDir = path.join(workspaceRoot, 'markdown-explorer');
      fs.mkdirSync(targetDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeFile(absPath: string, content = 'content') {
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content);
    }

    async function collectEntries(zipPath: string): Promise<{ path: string; size: number }[]> {
      const entries: { path: string; size: number }[] = [];
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(zipPath)
          .pipe(unzipper.Parse())
          .on('entry', (entry: any) => {
            entries.push({ path: entry.path, size: entry.vars.uncompressedSize as number });
            entry.autodrain();
          })
          .on('close', resolve)
          .on('error', reject);
      });
      return entries;
    }

    it('creates a zip containing all files in the target tree', async () => {
      writeFile(path.join(targetDir, 'a.txt'), 'a');
      writeFile(path.join(targetDir, 'b.txt'), 'bb');
      writeFile(path.join(targetDir, 'nested', 'c.txt'), 'ccc');

      const result: ZipResult = await zipFolder(workspaceRoot, targetDir, targetDir, ignore(), 3);

      assert.ok(fs.existsSync(result.outputPath));
      assert.equal(result.fileCount, 3);
      const names = (await collectEntries(result.outputPath)).map((e) => e.path).sort();
      assert.deepStrictEqual(names, [
        'markdown-explorer/a.txt',
        'markdown-explorer/b.txt',
        'markdown-explorer/nested/c.txt'
      ]);
    });

    it('skips files ignored by the matcher', async () => {
      writeFile(path.join(targetDir, 'keep.txt'), 'keep');
      writeFile(path.join(targetDir, 'drop.log'), 'drop');
      writeFile(path.join(targetDir, 'secrets.env'), 'secret');
      writeFile(path.join(targetDir, 'dist', 'bundle.js'), 'bundle');

      const ig = ignore().add(['*.log', '*.env', 'dist/']);
      const result = await zipFolder(workspaceRoot, targetDir, targetDir, ig, 1);

      const names = (await collectEntries(result.outputPath)).map((e) => e.path).sort();
      assert.equal(result.fileCount, 1);
      assert.deepStrictEqual(names, ['markdown-explorer/keep.txt']);
    });

    it('excludes the output zip itself to avoid recursion', async () => {
      writeFile(path.join(targetDir, 'file.txt'), 'file');

      const outputDir = targetDir;
      const result = await zipFolder(workspaceRoot, targetDir, outputDir, ignore(), 1);

      assert.ok(result.outputPath.startsWith(outputDir));
      const names = (await collectEntries(result.outputPath)).map((e) => e.path).sort();
      assert.deepStrictEqual(names, ['markdown-explorer/file.txt']);
    });

    it('writes the zip to the specified output directory', async () => {
      const outputDir = path.join(tmpDir, 'output');
      writeFile(path.join(targetDir, 'x.txt'), 'x');

      const result = await zipFolder(workspaceRoot, targetDir, outputDir, ignore(), 2);

      assert.ok(result.outputPath.startsWith(outputDir));
      assert.ok(path.basename(result.outputPath).startsWith('markdown-explorer-'));
      assert.ok(result.outputPath.endsWith('.zip'));
    });

    it('adds files with the folder-name prefix', async () => {
      writeFile(path.join(targetDir, 'root.txt'), 'root');

      const result = await zipFolder(workspaceRoot, targetDir, targetDir, ignore(), 3);

      const names = (await collectEntries(result.outputPath)).map((e) => e.path);
      assert.ok(names.every((n) => n.startsWith('markdown-explorer/')));
    });

    it('produces a deterministic zip file count equal to collected files', async () => {
      writeFile(path.join(targetDir, '1.txt'), '1');
      writeFile(path.join(targetDir, '2.txt'), '2');
      writeFile(path.join(targetDir, '3.txt'), '3');

      const result = await zipFolder(workspaceRoot, targetDir, targetDir, ignore(), 4);

      assert.equal(result.fileCount, 3);
      const entries = await collectEntries(result.outputPath);
      assert.equal(entries.length, 3);
    });
  });
});
