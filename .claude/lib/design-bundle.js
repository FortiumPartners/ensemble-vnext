'use strict';

/**
 * design-bundle.js -- bundle a product's React components into ONE classic script a canvas can load.
 *
 * WHY THIS EXISTS
 *
 * A Design System artifact loads `components/bundle.js` with a plain `<script>`, so it must be a
 * single browser-ready IIFE that assigns `window.<namespace>`, shares the page's React instead of
 * bundling its own, and has no import, no network and no literal `</script`. What it takes to get a
 * product's components there depends on the stack, hence `recipe(stack)`; a stack with no recipe
 * gets no bundle and the canvas uses parts boards instead (AC-F4.4).
 *
 *   react-web                 esbuild IIFE, React from the page's globals
 *   react-native              + `react-native` -> `react-native-web`, `.web.*` extensions first, and
 *                               an empty module for each Node built-in the graph imports
 *   react-native-nativewind   + `jsxImportSource: 'nativewind'`; no Babel step (spike findings)
 *
 * esbuild and Tailwind are the PRODUCT's (D13): resolved from the project, then the global npm root,
 * never shipped in `.claude/`; a missing one is a ToolError (exit 2) naming the install step. CSS is
 * compiled with the product's own Tailwind 3 and config, restricted to the bundled files; with no
 * `tailwindConfig` the CSS step is skipped and `css` is ''.
 *
 * CLI (run from the project root; JSON on stdout, error on stderr, exit 1, or 2 for a missing tool):
 *   node .claude/lib/design-bundle.js build --project <dir> --entry <file> --namespace <Ns>
 *     --stack <react-web|react-native|react-native-nativewind> --out <dir> [--tailwind-config <file>]
 *
 * Example: node .claude/lib/design-bundle.js build --project . --entry src/index.ts --namespace Acme --stack react-web --out docs/ui/_design-system/acme
 */

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');
const { resolveTool, ToolError } = require('./design-render');

const RECIPES = ['react-web', 'react-native', 'react-native-nativewind'];
const NAMESPACE_RE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

// The page already holds React (the runtime loads it), so a component library must read the globals
// rather than bundle a second copy. These shims are virtual modules, not files: `copy_libs` ships
// only top-level `*.js`, so shim files in a subfolder would never reach a project.
const SHIM_REACT = 'module.exports = window.React;';
const SHIM_REACT_DOM = 'module.exports = window.ReactDOM;';
const SHIM_JSX = 'const R = window.React;\n'
  + 'function jsx(type, props, key) { const p = Object.assign({}, props); if (key !== undefined) p.key = key; return R.createElement(type, p); }\n'
  + 'module.exports = { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: R.Fragment };';
const SHIMS = {
  react: SHIM_REACT,
  'react-dom': SHIM_REACT_DOM,
  'react-dom/client': SHIM_REACT_DOM,
  'react/jsx-runtime': SHIM_JSX,
  'react/jsx-dev-runtime': SHIM_JSX,
};

/** One of RECIPES, or `{ kind: 'parts' }` for every other stack (AC-F4.4). */
function recipe(stack) {
  return RECIPES.includes(stack) ? stack : { kind: 'parts' };
}

const reactGlobals = {
  name: 'react-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (a) => (SHIMS[a.path] ? { path: a.path, namespace: 'react-shim' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'react-shim' }, (a) => ({ contents: SHIMS[a.path], loader: 'js' }));
  },
};

/** An empty module for each Node built-in the graph imports, recorded in `stubs` (AC-F4.5). */
function nodeStubs(stubs) {
  return {
    name: 'node-stubs',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => {
        if (!BUILTINS.has(a.path)) return undefined;
        stubs.push({ module: a.path, importer: a.importer });
        return { path: a.path, namespace: 'node-stub' };
      });
      b.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
    },
  };
}

/**
 * The esbuild options for a recipe. Exposed so a test can assert on them without building
 * (NativeWind's `nativewind/jsx-runtime` is not installable here); `stubs` is filled during a build.
 */
function esbuildOptions(name, { entry, namespace, stubs = [] }) {
  const opts = {
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    format: 'iife',
    globalName: namespace,
    platform: 'browser',
    target: 'es2019',
    logLevel: 'silent',
    jsx: 'automatic',
    plugins: [reactGlobals],
  };
  if (name !== 'react-web') {
    Object.assign(opts, {
      mainFields: ['browser', 'module', 'main'],
      resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.jsx', '.json'],
      alias: { 'react-native': 'react-native-web' },
      // react-native-web reads these at module load; without them it throws in the browser.
      define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false', 'process.env.EXPO_OS': '"web"', global: 'window' },
    });
    opts.plugins = [reactGlobals, nodeStubs(stubs)];
  }
  if (name === 'react-native-nativewind') opts.jsxImportSource = 'nativewind';
  return opts;
}

/** Compile the product's Tailwind 3 CSS for exactly the bundled files. */
async function compileCss({ projectDir, tailwindConfig, files }) {
  const hint = 'run `npm install --save-dev tailwindcss postcss` in the product';
  const tailwind = resolveTool('tailwindcss', projectDir, hint);
  const postcss = resolveTool('postcss', projectDir, hint);
  const config = require(path.resolve(projectDir, tailwindConfig));
  const result = await postcss([tailwind({ ...(config.default || config), content: files })])
    .process('@tailwind base;\n@tailwind components;\n@tailwind utilities;', { from: undefined });
  return result.css;
}

/**
 * Bundle `entry` for `stack`.
 * @returns {Promise<{js: string, css: string, stubs: {module, importer}[]} | {kind: 'parts'}>}
 *   an esbuild failure rejects with its message; nothing is swallowed
 */
async function build({ projectDir, entry, namespace, stack, tailwindConfig, outDir }) {
  const name = recipe(stack);
  if (typeof name !== 'string') return name;
  if (!NAMESPACE_RE.test(namespace || '')) throw new Error(`namespace ${JSON.stringify(namespace)} is not a JavaScript identifier path`);
  const esbuild = resolveTool('esbuild', projectDir, 'run `npm install --save-dev esbuild` in the product');

  const stubs = [];
  const root = path.resolve(projectDir);
  const r = await esbuild.build({ ...esbuildOptions(name, { entry: path.resolve(root, entry), namespace, stubs }), absWorkingDir: root });
  // A `</script` inside the bundle would end the host page's script tag early.
  const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

  let css = '';
  if (tailwindConfig) {
    const files = Object.keys(r.metafile.inputs).filter((f) => !f.includes('node_modules') && !f.includes(':')).map((f) => path.resolve(root, f));
    css = await compileCss({ projectDir: root, tailwindConfig, files });
  }
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'bundle.js'), js);
    if (css) fs.writeFileSync(path.join(outDir, 'bundle.css'), css);
  }
  return { js, css, stubs };
}

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) throw new Error(`unexpected argument: ${rest[i]}`);
    if (i + 1 >= rest.length) throw new Error(`${rest[i]} needs a value`);
    flags[rest[i].slice(2)] = rest[++i];
  }
  return { verb, flags };
}

async function main(argv) {
  const { verb, flags } = parseArgs(argv);
  if (verb !== 'build') throw new Error('usage: design-bundle.js build --project D --entry F --namespace Ns --stack S --out D [--tailwind-config F]');
  for (const f of ['project', 'entry', 'namespace', 'stack', 'out']) if (!flags[f]) throw new Error(`--${f} is required`);
  const r = await build({
    projectDir: flags.project, entry: flags.entry, namespace: flags.namespace, stack: flags.stack,
    tailwindConfig: flags['tailwind-config'], outDir: flags.out,
  });
  if (r.kind === 'parts') return r;
  return { recipe: recipe(flags.stack), bytes: r.js.length, css: r.css.length > 0, stubs: r.stubs };
}

module.exports = { recipe, build, esbuildOptions, parseArgs, RECIPES, ToolError };

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (r) => process.stdout.write(JSON.stringify(r) + '\n'),
    (e) => {
      process.stderr.write('design-bundle.js: ' + e.message + '\n');
      process.exit(e.exitCode || 1);
    },
  );
}
