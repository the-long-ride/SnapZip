# Changelog

All notable changes to the SnapZip extension will be documented in this file.

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
