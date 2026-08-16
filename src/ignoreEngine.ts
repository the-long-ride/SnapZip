import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';

export interface IgnoreOptions {
  useGitignore: boolean;
  workspacePatterns: string[];
  globalPatterns: string[];
}

/** Compatible with the `ignore` library's (unexported) TestResult. */
export interface MatcherTestResult {
  ignored: boolean;
  unignored: boolean;
}

/**
 * Minimal matcher interface consumed by zipper.ts.
 * Mirrors the two `ignore` library methods actually used (ignores / test).
 */
export interface Matcher {
  ignores(pathname: string): boolean;
  test(pathname: string): MatcherTestResult;
  /**
   * Returns true if any negation (`!`) pattern in global, workspace, or
   * .gitignore rules could target a file inside `dirPath` (POSIX,
   * workspace-root-relative, no trailing slash).
   *
   * Used by the zipper to decide whether to descend into an otherwise-ignored
   * directory: if a user wrote `!electron/build/installer.nsh` or `!*.nsh` but
   * the global patterns include `**\/build\/`, the directory would be pruned
   * before the file check ever runs. This flag tells the zipper to descend.
   */
  hasNegationDescendant(dirPath: string): boolean;
}

// ---------------------------------------------------------------------------
// Rule compilation & representation
// ---------------------------------------------------------------------------

interface CompiledRule {
  isNegation: boolean;
  raw: string;
  ig: Ignore;
}

interface RuleSet {
  /**
   * Directory relative to workspace root (POSIX separators, empty string for root).
   */
  dirRel: string;
  rules: CompiledRule[];
}

function compileRuleSet(dirRel: string, patterns: string[]): RuleSet {
  const rules: CompiledRule[] = [];
  for (const p of patterns) {
    if (!p) continue;
    let s = p.trim();
    if (!s || s.startsWith('#')) continue;

    const isEscapedExclamation = s.startsWith('\\!');
    // Normalize backslashes to forward slashes and collapse duplicate slashes
    s = s.replace(/\\+/g, '/').replace(/\/+/g, '/');
    if (isEscapedExclamation) {
      s = '\\!' + s.slice(2);
    }
    s = s.trim();

    // Check if it's an unescaped negation rule
    if (s.startsWith('!') && !isEscapedExclamation) {
      const cleanPat = s.slice(1).trim();
      if (cleanPat) {
        rules.push({
          isNegation: true,
          raw: cleanPat,
          ig: ignore().add(cleanPat)
        });
      }
    } else {
      // Normal ignore pattern (or escaped \! pattern)
      const cleanPat = isEscapedExclamation ? s.slice(2) : s;
      rules.push({
        isNegation: false,
        raw: cleanPat,
        ig: ignore().add(s)
      });
    }
  }
  return { dirRel, rules };
}

// ---------------------------------------------------------------------------
// CombinedMatcher — git-accurate per-directory & negation evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates paths sequentially across global settings, workspace settings,
 * and per-directory .gitignore files.
 *
 * Handles negation patterns (`!`) correctly even when a parent directory
 * matches a broader ignore pattern (e.g. `**\/build\/` + `!electron/build/installer.nsh`).
 */
class CombinedMatcher implements Matcher {
  private ruleSets: RuleSet[];
  private allNegations: { dirRel: string; raw: string }[];

  constructor(ruleSets: RuleSet[]) {
    this.ruleSets = ruleSets;
    this.allNegations = [];
    for (const rs of ruleSets) {
      for (const r of rs.rules) {
        if (r.isNegation) {
          this.allNegations.push({ dirRel: rs.dirRel, raw: r.raw });
        }
      }
    }
  }

  ignores(pathname: string): boolean {
    return this.test(pathname).ignored;
  }

  hasNegationDescendant(dirPath: string): boolean {
    if (this.allNegations.length === 0) return false;
    const normalizedDir = dirPath.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, '');
    const dirPrefix = normalizedDir ? normalizedDir + '/' : '';

    for (const neg of this.allNegations) {
      const pat = neg.raw.replace(/^\//, '');
      const fullPat = neg.dirRel ? `${neg.dirRel}/${pat}` : pat;

      // 1. Direct prefix match: pattern is inside the directory (e.g. 'electron/build/installer.nsh' vs 'electron/build' or 'electron')
      if (fullPat.startsWith(dirPrefix)) return true;

      // 2. Directory is inside pattern directory (e.g. pattern was a folder)
      if (dirPrefix.startsWith(fullPat.replace(/\/$/, '') + '/')) return true;

      // 3. Basename / any-depth pattern (e.g. '*.nsh', 'installer.nsh', '**/installer.nsh')
      if (!pat.includes('/') || pat.startsWith('**/') || fullPat.startsWith('**/')) {
        // If scoped to a directory, check if dirPath is within that scope
        if (!neg.dirRel || dirPrefix.startsWith(neg.dirRel + '/') || normalizedDir === neg.dirRel || neg.dirRel.startsWith(dirPrefix)) {
          return true;
        }
      }

      // 4. Wildcard pattern (e.g. 'electron/**/installer.nsh' or 'electron/*/installer.nsh')
      if (fullPat.includes('*') || fullPat.includes('?')) {
        const baseDirOfPat = fullPat.split(/[*?]/)[0];
        if (dirPrefix.startsWith(baseDirOfPat) || baseDirOfPat.startsWith(dirPrefix)) {
          return true;
        }
      }
    }
    return false;
  }

  test(pathname: string): MatcherTestResult {
    let isIgnored = false;
    let isUnignored = false;

    for (const rs of this.ruleSets) {
      if (rs.dirRel) {
        if (pathname !== rs.dirRel && !pathname.startsWith(rs.dirRel + '/')) {
          continue;
        }
      }

      const localPath = !rs.dirRel ? pathname : pathname.slice(rs.dirRel.length + 1);
      if (!localPath) continue;

      for (const rule of rs.rules) {
        if (rule.ig.ignores(localPath)) {
          if (rule.isNegation) {
            isIgnored = false;
            isUnignored = true;
          } else {
            isIgnored = true;
            isUnignored = false;
          }
        }
      }
    }

    return { ignored: isIgnored, unignored: isUnignored };
  }
}

// ---------------------------------------------------------------------------
// .gitignore file reading & collection
// ---------------------------------------------------------------------------

/** Read raw lines from a .gitignore file, or return [] if absent. */
function readGitignore(dirAbs: string): string[] {
  const gi = path.join(dirAbs, '.gitignore');
  if (!fs.existsSync(gi)) return [];
  return fs.readFileSync(gi, 'utf8').split(/\r?\n/);
}

/**
 * Walks up from `targetDirAbs` to `workspaceRootAbs`, collecting .gitignore
 * files along the ancestor chain (root through parent of target).
 * Returns root-first so deeper entries override shallower ones.
 */
function collectAncestorGitignores(
  workspaceRootAbs: string,
  targetDirAbs: string
): RuleSet[] {
  const dirs: string[] = [];
  let dir = targetDirAbs;
  while (true) {
    dirs.push(dir);
    if (path.resolve(dir) === path.resolve(workspaceRootAbs)) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const ruleSets: RuleSet[] = [];
  for (const d of dirs.reverse()) {
    const rel = path.relative(workspaceRootAbs, d).split(path.sep).join('/');
    const patterns = readGitignore(d);
    if (patterns.length > 0) {
      ruleSets.push(compileRuleSet(rel, patterns));
    }
  }
  return ruleSets;
}

/**
 * Recursively collects .gitignore files inside `dirAbs` (inclusive) and its
 * subdirectories.
 */
function collectSubtreeGitignores(
  workspaceRootAbs: string,
  dirAbs: string
): RuleSet[] {
  const rel = path.relative(workspaceRootAbs, dirAbs).split(path.sep).join('/');
  const patterns = readGitignore(dirAbs);
  const ruleSets: RuleSet[] = [];
  if (patterns.length > 0) {
    ruleSets.push(compileRuleSet(rel, patterns));
  }

  let dirents: fs.Dirent[] = [];
  try {
    dirents = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return ruleSets;
  }
  for (const entry of dirents) {
    if (entry.isDirectory()) {
      if (entry.name === '.git') continue;
      ruleSets.push(
        ...collectSubtreeGitignores(workspaceRootAbs, path.join(dirAbs, entry.name))
      );
    }
  }
  return ruleSets;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wraps a plain `Ignore` instance into a `Matcher`.
 * `hasNegationDescendant` returns false.
 */
export function wrapIgnore(ig: Ignore): Matcher {
  return {
    ignores: (p) => ig.ignores(p),
    test: (p) => ig.test(p),
    hasNegationDescendant: () => false,
  };
}

/**
 * Builds a matcher for zipping `targetDirAbs` inside `workspaceRootAbs`.
 *
 * Global settings, workspace settings, and per-directory `.gitignore` files
 * are compiled into rule sets with accurate git-precedence order and full
 * negation re-inclusion support.
 */
export function buildIgnoreMatcher(
  workspaceRootAbs: string,
  targetDirAbs: string,
  options: IgnoreOptions
): Matcher {
  const ruleSets: RuleSet[] = [];

  // 1. Global patterns
  if (options.globalPatterns.length > 0) {
    ruleSets.push(compileRuleSet('', options.globalPatterns));
  }

  // 2. Workspace patterns
  if (options.workspacePatterns.length > 0) {
    ruleSets.push(compileRuleSet('', options.workspacePatterns));
  }

  // 3. Per-directory .gitignore files
  if (options.useGitignore) {
    const targetIsRoot =
      path.resolve(targetDirAbs) === path.resolve(workspaceRootAbs);

    if (!targetIsRoot) {
      // Ancestors: root → parent of target (excludes target itself to avoid
      // duplication with the subtree scan below).
      ruleSets.push(
        ...collectAncestorGitignores(workspaceRootAbs, path.dirname(targetDirAbs))
      );
    }

    // Subtree: target → all nested directories (includes target itself;
    // when target === root this also covers the root .gitignore).
    ruleSets.push(
      ...collectSubtreeGitignores(workspaceRootAbs, targetDirAbs)
    );
  }

  return new CombinedMatcher(ruleSets);
}
