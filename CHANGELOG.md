# Changelog

All notable changes to the SnapZip extension will be documented in this file.

## [1.0.4] - 2026-08-17

### Security
- Updated transitive dependencies to patched releases, resolving three Dependabot advisories:
  - `brace-expansion` `5.0.8` → `5.0.9` (CVE-2026-69152 — DoS via unbounded intermediate arrays, bypass of the CVE-2026-14257 mitigation).
  - `fast-uri` `3.1.4` → `3.1.5` (GHSA-7p8r-x3mc-p8w7 — host confusion via backslash authority introducer).
  - `js-yaml` `4.3.0` → `4.3.1` (GHSA-5p4m-2wfm-xmqj — quadratic CPU consumption in `!!omap` resolution).
- `npm audit` now reports **0 vulnerabilities**.

### Changed
- Release pipeline (`release.yml`) now builds the `.vsix` once and:
  - attaches it to the GitHub release page as a downloadable asset,
  - publishes the exact same artifact to the VS Code Marketplace and Open VSX,
  - renders the current-version changelog, VS Code Marketplace / Open VSX links, and an auto-generated contributors list in the release notes.

## [1.0.3] - 2026-08-17

### Fixed
- `.gitignore` plain-name patterns (e.g. `*.log`) now correctly match **direct children** of the owning directory, not only deeper descendants. Previously a pattern in `packages/api/.gitignore` would miss `packages/api/foo.log`.
- Root `.gitignore` patterns now apply when zipping a sub-folder whose parent chain includes the root (e.g. `error.log` at the workspace root is excluded even when zipping `src/`).
- Deeper `.gitignore` files properly override shallower ones (git precedence). A `!keep.log` rule in a nested file now re-includes a file that a parent `*.log` rule would have excluded.
- Patterns containing a middle slash (e.g. `secret/file.key`) are now anchored to the owning `.gitignore` directory and no longer match unrelated directories elsewhere in the tree.
- Negation (`!`) re-include rules (e.g. `!electron/build/installer.nsh`) are no longer dropped when a parent directory matches an ignore glob (e.g. `**/build/`). The engine now checks for negation descendants before pruning directories and evaluates matching file targets explicitly.
- Escaped-exclamation patterns (`\!important.txt`) are treated as a literal filename rather than being mis-parsed as a negation rule after backslash normalization.
- The root `.gitignore` is no longer collected twice when the target directory equals the workspace root, which previously caused sequential `!` negation rules to flip incorrectly.

### Changed
- `buildIgnoreMatcher` now returns a `CombinedMatcher` (a new internal interface) instead of the raw `Ignore` object, encapsulating per-directory `.gitignore` evaluation with correct git-spec scoping.
- `zipper.ts` updated to accept the new `Matcher` interface, decoupling it from the `ignore` library's internal types.
- README updated to reflect that `.gitignore` handling now follows real git per-directory semantics rather than being described as an approximation.

### Added
- 6 new regression/correctness tests covering: direct-child matching, parent-`.gitignore` propagation, deeper-file override precedence, slash-anchored patterns, escaped `!` literals, and duplicate-collection avoidance.

## [1.0.2] - 2026-08-01

### Changed
- Default global ignore patterns for built directories (`build/`, `dist/`, `out/`, `target/`, `__pycache__/`, `.next/`, `coverage/`, `.nuxt/`, `.output/`, `.turbo/`, `.expo/`, `.svelte-kit/`) now match at **any depth** (`**/build/`) instead of only the project root, so nested folder outputs like `packages/api/build/` are excluded too.
- Global default patterns are now organized into readable `#` group-header sections (Secrets & credentials, SnapZip output, Dependency directories, Build / output directories, Git metadata).

### Fixed
- `#` comment lines in workspace/global pattern lists and `.gitignore` files are now preserved and passed through to the ignore engine natively (previously they were silently dropped at read time).
- Negation patterns (`!`) such as `!electron/build/installer.nsh` are now honored, including Windows-style backslash variants (`!electron\build\installer.nsh`) which are normalized to POSIX separators.
- `**/...` style rules in `.gitignore` files are no longer double-wrapped (e.g. `**/build/` no longer becomes `**/**/build/`), which previously broke matches at the owner-directory root.
- `tsconfig.test.json` inherited `exclude: ["test"]` from the base config, preventing the test files from compiling on a fresh checkout; fixed by overriding `exclude` in the test config.

### Added
- User `!` negation patterns can now re-include a previously-emitted SnapZip output zip (e.g. `!my-app-2026-01-01-000000.snapzip.zip`) when re-zipping the same directory. The engine's built-in self-recursion guard now defers to an explicit user `!` rule that targets the output-zip path.

## [1.0.1] - 2026-07-28

## [1.0.0] - 2026-07-27

### Added
- Initial release of SnapZip.
- Compress folders or workspace via Explorer context menu and title bar action.
- Gitignore-aware folder filtering (respects root, parent, and nested .gitignore files).
- Per-workspace and global ignore pattern management with comment support (#).
- Visual settings panel for configuring compression level, output location, and ignore patterns.
- Fast esbuild-bundled build pipeline with zero external runtime dependencies shipped.
