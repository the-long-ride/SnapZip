import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';

export interface IgnoreOptions {
  useGitignore: boolean;
  workspacePatterns: string[];
  globalPatterns: string[];
}

/**
 * Rewrites a single gitignore line so it is scoped to `dir` (relative to the
 * zip root) instead of being applied globally. This approximates git's real
 * per-directory .gitignore precedence closely enough for export purposes.
 */
function scopePattern(rawLine: string, dirRel: string): string | null {
  // Normalize Windows-style backslashes to POSIX forward slashes so patterns
  // like `!electron\build\installer.nsh` work cross-platform.
  const normed = rawLine.replace(/\\/g, '/').trim();
  // Skip blank lines. KEEP `#` comment lines verbatim: the `ignore` library
  // natively skips lines whose first character is `#` per the .gitignore
  // spec, so we must NOT prefix them (e.g. `**/...`) -- doing so would turn
  // them into literal patterns that match a file named `# group`.
  if (!normed) return '';
  if (normed.startsWith('#')) return normed;

  let negate = false;
  let pattern = normed;
  if (pattern.startsWith('!')) {
    negate = true;
    pattern = pattern.slice(1);
  }

  const prefix = dirRel ? dirRel.replace(/\\/g, '/') : '';

  let scoped: string;
  if (pattern.startsWith('/')) {
    // Anchored to the directory that owns this .gitignore.
    scoped = prefix ? `/${prefix}${pattern}` : pattern;
  } else if (pattern.startsWith('**/')) {
    // Already explicitly ANY-depth (e.g. `**/build/`). Scope to owner dir
    // without prepending another `**/` -- that would require an intermediate
    // directory and break root-of-owner matches.
    scoped = prefix ? `/${prefix}/${pattern}` : pattern;
  } else if (pattern.includes('/') && !pattern.endsWith('/')) {
    // Contains a slash in the middle -> already anchored relative to owner dir.
    scoped = prefix ? `/${prefix}/${pattern}` : `/${pattern}`;
  } else {
    // Plain name (optionally trailing slash) -> matches at any depth under owner dir.
    scoped = prefix ? `/${prefix}/**/${pattern}` : `**/${pattern}`;
  }

  return negate ? `!${scoped}` : scoped;
}

function readGitignore(dirAbs: string, dirRel: string): string[] {
  const gi = path.join(dirAbs, '.gitignore');
  if (!fs.existsSync(gi)) return [];
  const content = fs.readFileSync(gi, 'utf8');
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const scoped = scopePattern(line, dirRel);
    // Skip blanks; keep `#` comment lines (ignore lib handles them natively).
    if (scoped) out.push(scoped);
  }
  return out;
}

/**
 * Walks up from `targetDirAbs` to `workspaceRootAbs`, collecting .gitignore
 * files along the ancestor chain (root .gitignore + each parent folder's
 * .gitignore), each scoped to its own directory.
 */
function collectAncestorGitignores(workspaceRootAbs: string, targetDirAbs: string): string[] {
  const chain: string[] = [];
  let dir = targetDirAbs;
  const dirs: string[] = [];
  while (true) {
    dirs.push(dir);
    if (path.resolve(dir) === path.resolve(workspaceRootAbs)) break;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root safeguard
    dir = parent;
  }
  // Walk from root down to target so more specific rules are added last.
  for (const d of dirs.reverse()) {
    const rel = path.relative(workspaceRootAbs, d);
    chain.push(...readGitignore(d, rel === '' ? '' : rel));
  }
  return chain;
}

/**
 * Recursively collects .gitignore files found *inside* the subtree being
 * zipped (nested .gitignore support), each scoped to its own directory.
 */
function collectSubtreeGitignores(workspaceRootAbs: string, dirAbs: string): string[] {
  const rel = path.relative(workspaceRootAbs, dirAbs);
  let patterns = readGitignore(dirAbs, rel === '' ? '' : rel);

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return patterns;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === '.git') continue; // never descend into .git for gitignore scanning
      patterns = patterns.concat(
        collectSubtreeGitignores(workspaceRootAbs, path.join(dirAbs, entry.name))
      );
    }
  }
  return patterns;
}

/**
 * Builds a single `ignore` matcher for exporting `targetDirAbs`, given the
 * workspace root. Returns a predicate that takes a path relative to
 * `workspaceRootAbs` (POSIX separators) and says whether it should be skipped.
 */
export function buildIgnoreMatcher(
  workspaceRootAbs: string,
  targetDirAbs: string,
  options: IgnoreOptions
): Ignore {
  const ig = ignore();

  // Helper: normalize Windows backslashes to POSIX and pass `#` comment
  // lines through untouched -- the `ignore` library skips comment lines per
  // the .gitignore spec (a leading `#` is treated as a comment), which lets
  // users keep human-readable group headers in their pattern lists.
  const addPatterns = (patterns: string[]): void => {
    const cleaned: string[] = [];
    for (const p of patterns) {
      const trimmed = p ? p.replace(/\\/g, '/').trim() : '';
      if (trimmed) cleaned.push(trimmed);
    }
    if (cleaned.length) ig.add(cleaned);
  };

  // Global (all workspaces) patterns always apply, unscoped.
  addPatterns(options.globalPatterns);

  // Workspace-specific custom patterns, unscoped (apply anywhere in workspace).
  addPatterns(options.workspacePatterns);

  if (options.useGitignore) {
    ig.add(collectAncestorGitignores(workspaceRootAbs, path.dirname(targetDirAbs) === targetDirAbs
      ? targetDirAbs
      : targetDirAbs));
    ig.add(collectSubtreeGitignores(workspaceRootAbs, targetDirAbs));
  }

  return ig;
}
