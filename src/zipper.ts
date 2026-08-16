import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { Matcher } from './ignoreEngine';

export interface ZipResult {
  outputPath: string;
  fileCount: number;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
}

/**
 * Collects every file under `dirAbs` (recursively) that is not ignored,
 * as paths relative to `workspaceRootAbs` (posix-style, for matcher lookup)
 * and relative to `dirAbs` (for archive entry naming).
 */
function collectFiles(
  workspaceRootAbs: string,
  dirAbs: string,
  originalTargetDirAbs: string,
  ig: Matcher,
  outputAbsToExclude: string | null,
  acc: { entryRel: string; abs: string }[] = []
): { entryRel: string; abs: string }[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return acc;
  }

  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name);
    if (outputAbsToExclude && path.resolve(abs) === path.resolve(outputAbsToExclude)) {
      // The output zip itself is skipped by default to avoid self-recursion.
      // However, if the user has explicitly re-included it via a `!` negation
      // pattern (workspace/global/gitignore), honor that request and include it.
      const relToRootOut = path.relative(workspaceRootAbs, abs).split(path.sep).join('/');
      const testResult = ig.test(relToRootOut);
      if (!testResult.unignored) continue;
    }

    const relToRoot = path.relative(workspaceRootAbs, abs).split(path.sep).join('/');
    const checkPath = entry.isDirectory() ? `${relToRoot}/` : relToRoot;

    if (ig.ignores(checkPath)) {
      // Even if this directory is ignored, a user `!` negation pattern may
      // re-include a specific file inside it (e.g. `!electron/build/installer.nsh`
      // with global `**/build/`).  Check before pruning the whole subtree.
      if (entry.isDirectory() && ig.hasNegationDescendant(relToRoot)) {
        collectFiles(workspaceRootAbs, abs, originalTargetDirAbs, ig, outputAbsToExclude, acc);
      }
      continue;
    }

    if (entry.isDirectory()) {
      collectFiles(workspaceRootAbs, abs, originalTargetDirAbs, ig, outputAbsToExclude, acc);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      acc.push({ entryRel: path.relative(originalTargetDirAbs, abs).split(path.sep).join('/'), abs });
    }
  }
  return acc;
}

/**
 * Zips `targetDirAbs` into `outputDirAbs`, filtering files with `ig`
 * (matcher paths are relative to `workspaceRootAbs`).
 */
/**
 * Maps the user-facing 1-4 compression level to zlib's 1-9 scale used by
 * `archiver`, spreading it across the range so the difference is noticeable.
 */
export function toZlibLevel(userLevel: number): number {
  const map: Record<number, number> = { 1: 2, 2: 5, 3: 7, 4: 9 };
  return map[userLevel] ?? 7;
}

function getArchiver(): typeof archiver {
  if (typeof archiver === 'function') {
    return archiver;
  }
  if (typeof (archiver as any).default === 'function') {
    return (archiver as any).default;
  }
  return archiver;
}

export function zipFolder(
  workspaceRootAbs: string,
  targetDirAbs: string,
  outputDirAbs: string,
  ig: Matcher,
  compressionLevel = 3
): Promise<ZipResult> {
  const folderName = path.basename(targetDirAbs);
  const outputPath = path.join(outputDirAbs, `${folderName}-${timestamp()}.zip`);

  const files = collectFiles(workspaceRootAbs, targetDirAbs, targetDirAbs, ig, outputPath);

  return new Promise((resolve, reject) => {
    fs.mkdirSync(outputDirAbs, { recursive: true });
    const output = fs.createWriteStream(outputPath);
    const archiveFn = getArchiver();
    const archive = archiveFn('zip', { zlib: { level: toZlibLevel(compressionLevel) } });

    output.on('finish', () => resolve({ outputPath, fileCount: files.length }));
    archive.on('warning', () => {});
    archive.on('error', (err: Error) => reject(err));

    archive.pipe(output);
    for (const f of files) {
      archive.file(f.abs, { name: `${folderName}/${f.entryRel}` });
    }
    archive.finalize();
  });
}
