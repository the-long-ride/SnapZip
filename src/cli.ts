import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildIgnoreMatcher, DEFAULT_GLOBAL_PATTERNS } from './ignoreEngine';
import { zipFolder } from './zipper';

export interface CliOptions {
  targetFolder?: string;
  outputDir?: string;
  configFile?: string;
  compressionLevel: number;
  useGitignore: boolean;
  extraIgnorePatterns: string[];
  showHelp: boolean;
  showVersion: boolean;
}

export interface LoadedConfig {
  workspacePatterns: string[];
  globalPatterns: string[];
}

export function getVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch {
    // Fallback if package.json cannot be read
  }
  return '1.0.6';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function findWorkspaceRoot(startDir: string): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(curr, '.git'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) {
      break;
    }
    curr = parent;
  }
  return path.resolve(startDir);
}

export function parseJsonc(content: string): any {
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^\\:])\/\/.*$/gm, '$1')
    .replace(/,\s*([\]}])/g, '$1');
  return JSON.parse(stripped);
}

export function loadIgnoreFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
  } catch {
    return [];
  }
}

export function loadVscodeSettings(workspaceRoot: string, targetDir?: string): LoadedConfig {
  const dirs = [workspaceRoot];
  if (targetDir && path.resolve(targetDir) !== path.resolve(workspaceRoot)) {
    dirs.push(targetDir);
  }

  const workspacePatterns: string[] = [];
  const globalPatterns: string[] = [];

  for (const d of dirs) {
    const settingsPath = path.join(d, '.vscode', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const data = parseJsonc(fs.readFileSync(settingsPath, 'utf8'));
        if (Array.isArray(data['snapZip.ignore.workspacePatterns'])) {
          workspacePatterns.push(...data['snapZip.ignore.workspacePatterns']);
        }
        if (Array.isArray(data['snapZip.ignore.global'])) {
          globalPatterns.push(...data['snapZip.ignore.global']);
        }
      } catch {
        // Ignore
      }
    }
  }

  return { workspacePatterns, globalPatterns };
}

export function loadSnapziprc(customHome?: string): LoadedConfig {
  const home = customHome || os.homedir();
  const candidates = [
    path.join(home, '.snapziprc'),
    path.join(home, '.config', 'snapzip', 'config.json'),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf8').trim();
        if (raw.startsWith('{') || raw.startsWith('[')) {
          const parsed = parseJsonc(raw);
          if (Array.isArray(parsed)) {
            return { globalPatterns: parsed, workspacePatterns: [] };
          }
          return {
            globalPatterns: Array.isArray(parsed.globalPatterns || parsed['ignore.global'])
              ? (parsed.globalPatterns || parsed['ignore.global'])
              : [],
            workspacePatterns: Array.isArray(parsed.workspacePatterns || parsed['ignore.workspacePatterns'])
              ? (parsed.workspacePatterns || parsed['ignore.workspacePatterns'])
              : [],
          };
        } else {
          const lines = raw
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith('#'));
          return { globalPatterns: lines, workspacePatterns: [] };
        }
      } catch {
        // Skip unreadable
      }
    }
  }

  return { workspacePatterns: [], globalPatterns: [] };
}

export function loadConfigFile(configPath: string): LoadedConfig {
  const resolved = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Configuration file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8').trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    const parsed = parseJsonc(raw);
    if (Array.isArray(parsed)) {
      return { globalPatterns: [], workspacePatterns: parsed };
    }
    return {
      globalPatterns: Array.isArray(parsed.globalPatterns || parsed['ignore.global'])
        ? (parsed.globalPatterns || parsed['ignore.global'])
        : [],
      workspacePatterns: Array.isArray(parsed.workspacePatterns || parsed['ignore.workspacePatterns'])
        ? (parsed.workspacePatterns || parsed['ignore.workspacePatterns'])
        : [],
    };
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  return { globalPatterns: [], workspacePatterns: lines };
}

export function getHelpText(): string {
  return `SnapZip CLI - Fast, gitignore-aware zip compression

Usage:
  snapzip [folder] [options]

Arguments:
  folder                  Directory to compress (default: current directory ".")

Options:
  -o, --output <dir>      Output directory for generated .zip (default: folder's parent)
  -l, --level <1-4>       Compression level: 1 (fastest) to 4 (maximum) (default: 3)
  -c, --config <path>     Path to custom configuration file (.json or ignore list)
  --no-gitignore          Do not respect .gitignore rules
  -i, --ignore <pattern>  Extra ignore pattern (repeatable or comma-separated)
  -v, --version           Show version
  -h, --help              Show help information

Configuration files automatically recognized:
  - .vscode/settings.json (snapZip.ignore.workspacePatterns, snapZip.ignore.global)
  - .snapzipignore        (in workspace root and target directory)
  - ~/.snapziprc          (user-level global config)

Examples:
  npx @the-long-ride/snapzip
  npx @the-long-ride/snapzip src --output dist
  npx @the-long-ride/snapzip my-project --level 4 --ignore "*.log,temp/"
`;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    compressionLevel: 3,
    useGitignore: true,
    extraIgnorePatterns: [],
    showHelp: false,
    showVersion: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      options.showHelp = true;
    } else if (arg === '-v' || arg === '--version') {
      options.showVersion = true;
    } else if (arg === '--no-gitignore') {
      options.useGitignore = false;
    } else if (arg === '-o' || arg === '--output') {
      i++;
      if (i < argv.length) {
        options.outputDir = argv[i];
      }
    } else if (arg.startsWith('--output=')) {
      options.outputDir = arg.slice('--output='.length);
    } else if (arg === '-c' || arg === '--config') {
      i++;
      if (i < argv.length) {
        options.configFile = argv[i];
      }
    } else if (arg.startsWith('--config=')) {
      options.configFile = arg.slice('--config='.length);
    } else if (arg === '-l' || arg === '--level') {
      i++;
      if (i < argv.length) {
        const parsed = parseInt(argv[i], 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 4) {
          options.compressionLevel = parsed;
        }
      }
    } else if (arg.startsWith('--level=')) {
      const parsed = parseInt(arg.slice('--level='.length), 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 4) {
        options.compressionLevel = parsed;
      }
    } else if (arg === '-i' || arg === '--ignore') {
      i++;
      if (i < argv.length) {
        const patterns = argv[i].split(',').map((p) => p.trim()).filter(Boolean);
        options.extraIgnorePatterns.push(...patterns);
      }
    } else if (arg.startsWith('--ignore=')) {
      const patterns = arg.slice('--ignore='.length).split(',').map((p) => p.trim()).filter(Boolean);
      options.extraIgnorePatterns.push(...patterns);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    options.targetFolder = positional[0];
  }

  return options;
}

export async function runCli(
  argv: string[],
  out: (s: string) => void = (s: string) => { process.stdout.write(s + '\n'); },
  err: (s: string) => void = (s: string) => { process.stderr.write(s + '\n'); }
): Promise<number> {
  const options = parseArgs(argv);

  if (options.showHelp) {
    out(getHelpText());
    return 0;
  }

  if (options.showVersion) {
    out(`snapzip v${getVersion()}`);
    return 0;
  }

  const rawTarget = options.targetFolder ?? '.';
  const targetDirAbs = path.resolve(process.cwd(), rawTarget);

  if (!fs.existsSync(targetDirAbs)) {
    err(`Error: Target directory does not exist: ${targetDirAbs}`);
    return 1;
  }

  const stat = fs.statSync(targetDirAbs);
  if (!stat.isDirectory()) {
    err(`Error: Target path is not a directory: ${targetDirAbs}`);
    return 1;
  }

  const workspaceRootAbs = findWorkspaceRoot(targetDirAbs);
  const outputDirAbs = options.outputDir
    ? path.resolve(process.cwd(), options.outputDir)
    : path.dirname(targetDirAbs) === targetDirAbs
    ? targetDirAbs
    : path.dirname(targetDirAbs);

  const startTime = Date.now();

  try {
    // 1. Global patterns: default + ~/.snapziprc + .vscode global
    const globalPatterns = [...DEFAULT_GLOBAL_PATTERNS];
    const userRc = loadSnapziprc();
    globalPatterns.push(...userRc.globalPatterns);

    const vscodeConfig = loadVscodeSettings(workspaceRootAbs, targetDirAbs);
    globalPatterns.push(...vscodeConfig.globalPatterns);

    // 2. Workspace patterns: .snapziprc + .vscode workspace + .snapzipignore + custom config + CLI extra
    const workspacePatterns: string[] = [];
    workspacePatterns.push(...userRc.workspacePatterns);
    workspacePatterns.push(...vscodeConfig.workspacePatterns);

    // .snapzipignore in workspace root
    workspacePatterns.push(...loadIgnoreFile(path.join(workspaceRootAbs, '.snapzipignore')));

    // .snapzipignore in target directory if distinct
    if (path.resolve(targetDirAbs) !== path.resolve(workspaceRootAbs)) {
      workspacePatterns.push(...loadIgnoreFile(path.join(targetDirAbs, '.snapzipignore')));
    }

    // Explicit custom config file
    if (options.configFile) {
      const customConfig = loadConfigFile(options.configFile);
      globalPatterns.push(...customConfig.globalPatterns);
      workspacePatterns.push(...customConfig.workspacePatterns);
    }

    // Command-line ad-hoc patterns (-i / --ignore)
    workspacePatterns.push(...options.extraIgnorePatterns);

    const matcher = buildIgnoreMatcher(workspaceRootAbs, targetDirAbs, {
      useGitignore: options.useGitignore,
      workspacePatterns,
      globalPatterns,
    });

    const result = await zipFolder(
      workspaceRootAbs,
      targetDirAbs,
      outputDirAbs,
      matcher,
      options.compressionLevel
    );

    const elapsed = Date.now() - startTime;
    let sizeStr = '';
    try {
      const stats = fs.statSync(result.outputPath);
      sizeStr = ` (${formatBytes(stats.size)})`;
    } catch {
      // Ignored if stat fails
    }

    out(`✔ Compressed ${result.fileCount} files into ${result.outputPath}${sizeStr} in ${elapsed}ms`);
    return 0;
  } catch (error: any) {
    err(`Error during compression: ${error?.message ?? String(error)}`);
    return 1;
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
