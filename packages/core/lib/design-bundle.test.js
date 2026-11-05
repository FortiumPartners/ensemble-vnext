'use strict';

// The mount test renders in Chromium through design-render.js (see its header for the install step).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const bundle = require('./design-bundle');
const render = require('./design-render');

jest.setTimeout(90000);

const FIX = path.join(__dirname, '__fixtures__', 'design');
const LIB = path.join(FIX, 'react-lib', 'index.jsx');
const RUNTIME = path.join(FIX, 'dc-runtime.js');
const tmp = (p = 'dbundle-') => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));

describe('recipe (AC-F4.4)', () => {
  it.each(bundle.RECIPES)('%s is its own recipe', (r) => expect(bundle.recipe(r)).toBe(r));
  it.each(['flutter', 'swiftui', '', undefined])('%p has no bundle, so parts are used', async (s) => {
    expect(bundle.recipe(s)).toEqual({ kind: 'parts' });
    // No tool is needed to say so: a project with no esbuild still gets the answer.
    expect(await bundle.build({ projectDir: tmp(), entry: 'x', namespace: 'N', stack: s })).toEqual({ kind: 'parts' });
  });
});

describe('esbuild options per recipe (AC-F4.1 to AC-F4.3)', () => {
  const opts = (name) => bundle.esbuildOptions(name, { entry: 'e.js', namespace: 'Ns' });
  const pluginNames = (o) => o.plugins.map((p) => p.name);

  it('react-web: an IIFE on the page globals, with no native alias and no node stubs', () => {
    const o = opts('react-web');
    expect(o).toMatchObject({ format: 'iife', globalName: 'Ns', platform: 'browser', jsx: 'automatic' });
    expect(o.alias).toBeUndefined();
    expect(o.jsxImportSource).toBeUndefined();
    expect(pluginNames(o)).toEqual(['react-globals']);
  });

  it('react-native: aliases to react-native-web and lists every Node built-in it stubs (AC-F4.2, AC-F4.5)', async () => {
    // The product holds react-native-web; esbuild is found by walking up to this repository's
    // node_modules, so the throwaway product lives under the fixtures folder.
    const p = fs.mkdtempSync(path.join(FIX, 'rn-product-'));
    try {
      fs.mkdirSync(path.join(p, 'node_modules', 'react-native-web'), { recursive: true });
      fs.writeFileSync(path.join(p, 'node_modules', 'react-native-web', 'index.js'), 'exports.View = "RNW_VIEW";');
      fs.writeFileSync(path.join(p, 'entry.js'), "import { View } from 'react-native';\nimport crypto from 'crypto';\nimport fs from 'node:fs';\nexport const v = [View, crypto, fs];");
      const ok = await bundle.build({ projectDir: p, entry: 'entry.js', namespace: 'Rn', stack: 'react-native' });
      expect(ok.js).toContain('RNW_VIEW');
      expect(ok.stubs.map((s) => s.module).sort()).toEqual(['crypto', 'node:fs']);
      expect(ok.stubs.every((s) => s.importer.endsWith('entry.js'))).toBe(true);
    } finally {
      fs.rmSync(p, { recursive: true, force: true });
    }
  });

  it('react-native (plain): the native alias, extensions and defines, with no NativeWind setting (AC-F4.2)', () => {
    const o = opts('react-native');
    expect(o.jsxImportSource).toBeUndefined();
    expect(o.alias).toEqual({ 'react-native': 'react-native-web' });
    expect(o.mainFields).toEqual(['browser', 'module', 'main']);
    expect(o.resolveExtensions.slice(0, 3)).toEqual(['.web.tsx', '.web.ts', '.web.js']);
    expect(o.define).toMatchObject({ __DEV__: 'false', 'process.env.NODE_ENV': '"production"', global: 'window' });
    expect(pluginNames(o)).toEqual(['react-globals', 'node-stubs']);
  });

  it('react-native-nativewind: jsxImportSource nativewind on the native recipe, node stubs kept, no Babel (AC-F4.3)', () => {
    const o = opts('react-native-nativewind');
    expect(o.jsxImportSource).toBe('nativewind');
    expect(o.jsx).toBe('automatic');
    expect(o.alias).toEqual({ 'react-native': 'react-native-web' });
    expect(o.define).toMatchObject({ __DEV__: 'false' });
    expect(pluginNames(o)).toEqual(['react-globals', 'node-stubs']);
    expect(pluginNames(o).some((n) => /babel/i.test(n))).toBe(false);
  });

  it('react-native-nativewind: JSX is compiled through nativewind/jsx-runtime, and its CSS needs the product Tailwind (D13)', async () => {
    const p = fs.mkdtempSync(path.join(FIX, 'nw-product-'));
    try {
      fs.mkdirSync(path.join(p, 'node_modules', 'nativewind'), { recursive: true });
      fs.writeFileSync(path.join(p, 'node_modules', 'nativewind', 'jsx-runtime.js'),
        'exports.Fragment = "F"; exports.jsx = function (t, props) { return { via: "NW_RUNTIME", t, props }; }; exports.jsxs = exports.jsx;');
      fs.writeFileSync(path.join(p, 'entry.jsx'), 'export const el = <div className="p-4" />;');
      const ok = await bundle.build({ projectDir: p, entry: 'entry.jsx', namespace: 'Nw', stack: 'react-native-nativewind' });
      expect(ok.js).toContain('NW_RUNTIME');
      expect(ok.css).toBe('');
      // The CSS comes from the product's own Tailwind; this repository has none, so the answer is exit 2.
      const noTailwind = await bundle.build({ projectDir: p, entry: 'entry.jsx', namespace: 'Nw', stack: 'react-native-nativewind', tailwindConfig: 'tailwind.config.js' }).catch((e) => e);
      expect(noTailwind.exitCode).toBe(2);
      expect(noTailwind.message).toMatch(/tailwindcss is not installed/);
    } finally {
      fs.rmSync(p, { recursive: true, force: true });
    }
  });

  it('returns an esbuild error with its message instead of swallowing it', async () => {
    const p = tmp();
    fs.writeFileSync(path.join(p, 'e.js'), "import './missing-module';");
    await expect(bundle.build({ projectDir: FIX, entry: path.join(p, 'e.js'), namespace: 'N', stack: 'react-web' })).rejects.toThrow(/missing-module/);
  });

  it('rejects a namespace that is not an identifier path', async () => {
    await expect(bundle.build({ projectDir: FIX, entry: LIB, namespace: 'a b', stack: 'react-web' })).rejects.toThrow('not a JavaScript identifier');
  });

  it('exits 2 naming esbuild or Tailwind when the product lacks them (D13)', async () => {
    const noEsbuild = await bundle.build({ projectDir: tmp(), entry: 'x.js', namespace: 'N', stack: 'react-web' }).catch((e) => e);
    expect(noEsbuild.exitCode).toBe(2);
    expect(noEsbuild.message).toMatch(/esbuild is not installed.*npm install --save-dev esbuild/);
    // CSS needs the product's own Tailwind, which this repository does not carry.
    const noTailwind = await bundle.build({ projectDir: FIX, entry: LIB, namespace: 'N', stack: 'react-web', tailwindConfig: 'tailwind.config.js' }).catch((e) => e);
    expect(noTailwind.exitCode).toBe(2);
    expect(noTailwind.message).toMatch(/tailwindcss is not installed/);
  });
});

describe('the fixture library mounts under dc-runtime (AC-F4.6)', () => {
  const boardWith = (script) => `<!doctype html><html><head><meta charset="utf-8"><script src="./support.js"></script>${script}</head><body>
<x-dc><div style="width: 320px; height: 200px; padding: 24px; box-sizing: border-box; font-family: monospace">
<x-import component-from-global-scope="Fixture.Badge" tone="warn">MOUNTED BADGE</x-import>
<x-import component-from-global-scope="Fixture.Counter" label="Clicked" start="3"></x-import>
</div></x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":320,"height":200}}'>
class Component extends DCLogic { renderVals() { return {}; } }
</script></body></html>`;

  async function renderBoard(html, lib) {
    const repo = tmp();
    const dir = path.join(repo, 'docs', 'ui', 'x');
    const mirror = path.join(dir, 'canvas', 'project');
    fs.mkdirSync(mirror, { recursive: true });
    fs.writeFileSync(path.join(mirror, '01-lib.dc.html'), html);
    if (lib) await bundle.build({ projectDir: FIX, entry: LIB, namespace: 'Fixture', stack: 'react-web', outDir: path.join(mirror, 'lib') });
    fs.writeFileSync(path.join(dir, 'design-map.json'), JSON.stringify({
      canvases: [{ dir: 'canvas/project' }],
      boards: [{ id: '01-lib', file: '01-lib.dc.html', kind: 'to-be', platform: 'web', viewport: [320, 200], status: 'draft' }],
    }));
    return render.render({ dir, runtime: process.env.DC_RUNTIME || RUNTIME, out: path.join(repo, 'out'), offline: !process.env.DC_RUNTIME, repo });
  }

  it('renders with no render errors, and differently from the same board without the bundle', async () => {
    const withLib = await renderBoard(boardWith('<script src="lib/bundle.js"></script>'), true);
    expect(withLib.errors).toEqual({});
    const without = await renderBoard(boardWith(''), false);
    expect(fs.readFileSync(withLib.frames[0].png).equals(fs.readFileSync(without.frames[0].png))).toBe(false);
  });
});

describe('CLI', () => {
  const cli = path.join(__dirname, 'design-bundle.js');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

  it('builds into --out and prints the recipe and stubs', () => {
    const out = path.join(tmp(), 'o');
    const r = run('build', '--project', FIX, '--entry', LIB, '--namespace', 'Fixture', '--stack', 'react-web', '--out', out);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ recipe: 'react-web', css: false, stubs: [] });
    expect(fs.existsSync(path.join(out, 'bundle.js'))).toBe(true);
  });

  it('prints parts for a stack with no recipe', () => {
    const r = run('build', '--project', '.', '--entry', 'x', '--namespace', 'N', '--stack', 'flutter', '--out', tmp());
    expect(JSON.parse(r.stdout)).toEqual({ kind: 'parts' });
  });

  it('exits 2 for a missing tool and 1 for bad arguments', () => {
    const r = spawnSync(process.execPath, [cli, 'build', '--project', '.', '--entry', 'x', '--namespace', 'N', '--stack', 'react-web', '--out', tmp()], { cwd: tmp(), encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/esbuild is not installed/);
    expect(run('build', '--project', '.').status).toBe(1);
    expect(run('nope').status).toBe(1);
    expect(() => bundle.parseArgs(['build', 'stray'])).toThrow('unexpected argument');
    expect(() => bundle.parseArgs(['build', '--out'])).toThrow('needs a value');
  });
});
