const esbuild = require('esbuild');

const emptyShim = {
  name: 'empty',
  setup(build) {
    build.onResolve({ filter: /^(glob|minimatch|path-scurry|minipass|jackspeak|package-json-from-dist|foreground-child)$/ }, (args) => ({
      path: args.path,
      namespace: 'empty'
    }));
    build.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({
      contents: 'module.exports = function noop(){}; module.exports.default = module.exports; module.exports.glob = function(){return [];}; module.exports.sync = function(){return [];};',
      loader: 'js'
    }));
  }
};

const watch = process.argv.includes('--watch');

const opts = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'out/extension.js',
  external: ['vscode'],
  logLevel: 'info',
  sourcemap: false,
  minify: true,
  plugins: [emptyShim]
};

if (watch) {
  (async () => {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
  })();
} else {
  esbuild.build(opts).catch(() => process.exit(1));
}
