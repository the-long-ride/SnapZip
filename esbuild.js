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

const extensionOpts = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: 'out/extension.js',
  external: ['vscode'],
  logLevel: 'info',
  sourcemap: false,
  minify: true,
  plugins: [emptyShim]
};

const cliOpts = {
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: 'out/cli.js',
  banner: {
    js: '#!/usr/bin/env node'
  },
  logLevel: 'info',
  sourcemap: false,
  minify: true,
  plugins: [emptyShim]
};

if (watch) {
  (async () => {
    const watchPlugin = (name) => ({
      name: `watch-${name}`,
      setup(build) {
        build.onStart(() => {
          console.log(`[watch:${name}] build started`);
        });
        build.onEnd((result) => {
          console.log(`[watch:${name}] build finished with ${result.errors.length} errors`);
        });
      }
    });

    extensionOpts.plugins.push(watchPlugin('extension'));
    cliOpts.plugins.push(watchPlugin('cli'));

    const extCtx = await esbuild.context(extensionOpts);
    const cliCtx = await esbuild.context(cliOpts);
    await Promise.all([extCtx.watch(), cliCtx.watch()]);
  })();
} else {
  Promise.all([
    esbuild.build(extensionOpts),
    esbuild.build(cliOpts)
  ]).catch(() => process.exit(1));
}
