'use strict';

// Needs Chromium: `npx playwright install chromium` (CI installs it in the jest job). A missing
// browser fails these tests with that message rather than skipping them (D13).
//
// The fixture boards render with the pinned runtime and no network (D14) unless DC_RUNTIME names a
// newer dc-runtime.js, in which case the same boards are the release-change test (AC-F3.5) and the
// byte-for-byte checks are skipped.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const render = require('./design-render');

jest.setTimeout(90000);

const FIX = path.join(__dirname, '__fixtures__', 'design');
const LIVE = Boolean(process.env.DC_RUNTIME);
const RUNTIME = LIVE ? path.resolve(process.env.DC_RUNTIME) : path.join(__dirname, 'dc-runtime.js');
const OFFLINE = !LIVE;
const maybeIt = LIVE ? it.skip : it;

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const sh = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const tmp = (p = 'drender-') => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const fixture = (name) => fs.readFileSync(path.join(FIX, name), 'utf8');

const board = (id, o = {}) => ({ id, file: `${id}.dc.html`, kind: 'to-be', platform: 'web', viewport: [320, 200], status: 'draft', ...o });

/** A design folder `<repo>/docs/ui/x` with a mirror holding `files` and a map holding `boards`. */
function mkDesign(boards, files) {
  const repo = tmp();
  const dir = path.join(repo, 'docs', 'ui', 'x');
  fs.mkdirSync(path.join(dir, 'canvas', 'project'), { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, 'canvas', 'project', name)), { recursive: true });
    fs.writeFileSync(path.join(dir, 'canvas', 'project', name), text);
  }
  fs.writeFileSync(path.join(dir, 'design-map.json'), JSON.stringify({ canvases: [{ dir: 'canvas/project' }], boards }));
  return { repo, dir };
}
const run = (d, o = {}) => render.render({ dir: d.dir, runtime: RUNTIME, out: path.join(d.repo, 'out', String(Math.random()).slice(2)), offline: OFFLINE, repo: d.repo, ...o });
const bytes = (f) => fs.readFileSync(f);
const png = (r, id, state = null) => r.frames.find((f) => f.board === id && f.state === state).png;

describe('rendering the fixture boards (AC-F3.1, AC-F3.2, AC-F3.4, AC-F3.5)', () => {
  const d = mkDesign(
    [board('01-plain'), board('02-state', { states: { empty: { setup: 'no rows', props: { empty: true } } } }), board('03-broken')],
    { '01-plain.dc.html': fixture('plain.dc.html'), '02-state.dc.html': fixture('stateful.dc.html'), '03-broken.dc.html': fixture('broken.dc.html') },
  );
  let first;
  beforeAll(async () => { first = await run(d); });

  it('writes one PNG per board at the board viewport, plus NN-name--state.png per state', () => {
    expect(first.frames.map((f) => path.basename(f.png)).sort()).toEqual(
      ['01-plain.png', '02-state--empty.png', '02-state.png', '03-broken.png'],
    );
    const sig = bytes(png(first, '01-plain')).subarray(0, 8).toString('hex');
    expect(sig).toBe('89504e470d0a1a0a');
    // IHDR width and height sit at bytes 16-23 of a PNG.
    const b = bytes(png(first, '01-plain'));
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([320, 200]);
  });

  it('renders a state with its props, so an sc-if branch changes (D7)', () => {
    expect(bytes(png(first, '02-state', 'empty')).equals(bytes(png(first, '02-state')))).toBe(false);
  });

  it('reports a board whose logic throws, and no errors for clean boards', () => {
    expect(first.errors['03-broken'].join(' ')).toMatch(/fixture board threw on purpose/);
    expect(first.errors['01-plain']).toBeUndefined();
    expect(first.errors['02-state']).toBeUndefined();
  });

  maybeIt('renders a known board to an identical PNG across two runs with the pinned runtime (AC-F3.4)', async () => {
    const again = await run(d, { boards: ['01-plain', '02-state'] });
    expect(bytes(png(again, '01-plain')).equals(bytes(png(first, '01-plain')))).toBe(true);
    expect(bytes(png(again, '02-state', 'empty')).equals(bytes(png(first, '02-state', 'empty')))).toBe(true);
  });

  it('renders only the boards asked for, and refuses an unknown id', async () => {
    const one = await run(d, { boards: ['01-plain'] });
    expect(one.frames).toHaveLength(1);
    await expect(run(d, { boards: ['nope'] })).rejects.toThrow('no board nope');
  });

  it('aborts every request that is not to the local server when offline (D14)', async () => {
    const blocked = mkDesign([board('01-net')], {
      '01-net.dc.html': fixture('plain.dc.html').replace('</head>',
        "<script>fetch('https://example.com/').catch(function () { throw new Error('BLOCKED'); });</script></head>"),
    });
    const r = await run(blocked, { offline: true });
    expect(r.errors['01-net'].join(' ')).toMatch(/BLOCKED/);
  });
});

describe('rendering older source', () => {
  const alpha = fixture('plain.dc.html').replaceAll('Plain board', 'ALPHA');
  const beta = fixture('plain.dc.html').replaceAll('Plain board', 'BETA');
  let d; let c1; let atAlpha; let atBeta;

  beforeAll(async () => {
    d = mkDesign([board('01-a'), board('02-b')], { '01-a.dc.html': alpha, '02-b.dc.html': alpha });
    sh(d.repo, 'init', '-q');
    sh(d.repo, 'add', '-A');
    sh(d.repo, 'commit', '-qm', 'alpha');
    c1 = sh(d.repo, 'rev-parse', 'HEAD');
    atAlpha = await run(d);
    for (const f of ['01-a.dc.html', '02-b.dc.html']) fs.writeFileSync(path.join(d.dir, 'canvas', 'project', f), beta);
    sh(d.repo, 'commit', '-qam', 'beta');
    atBeta = await run(d);
  });

  it('--at renders an older commit instead of the working tree (AC-F3.3)', async () => {
    const r = await run(d, { at: c1 });
    expect(bytes(png(r, '01-a')).equals(bytes(png(atAlpha, '01-a')))).toBe(true);
    expect(bytes(png(r, '01-a')).equals(bytes(png(atBeta, '01-a')))).toBe(false);
  });

  it('--approved renders a built board at its approved_commit and the rest at HEAD (D4)', async () => {
    const map = JSON.parse(fs.readFileSync(path.join(d.dir, 'design-map.json'), 'utf8'));
    map.boards[0] = { ...map.boards[0], status: 'building', approved_commit: c1 };
    fs.writeFileSync(path.join(d.dir, 'design-map.json'), JSON.stringify(map));
    const r = await run(d, { approved: true });
    expect(bytes(png(r, '01-a')).equals(bytes(png(atAlpha, '01-a')))).toBe(true);
    expect(bytes(png(r, '02-b')).equals(bytes(png(atBeta, '02-b')))).toBe(true);
  });

  it('refuses a commit that does not exist', async () => {
    await expect(run(d, { at: 'deadbeef' })).rejects.toThrow(/git archive/);
  });
});

describe('a board that uses the design system (D4)', () => {
  const withDs = fixture('plain.dc.html')
    .replace('<script src="./support.js"></script>', '<script src="./support.js"></script><script src="ds/acme/paint.js"></script>')
    .replace('background: #f8fafc;', '');
  const paint = "document.documentElement.style.background = '#ff0000';\n";

  it('copies docs/ui/_design-system/<folder>/ in as ds/<folder>/, from the same commit under --at', async () => {
    const d = mkDesign([board('01-ds')], { '01-ds.dc.html': withDs });
    const without = await run(d);
    const dsDir = path.join(d.repo, 'docs', 'ui', '_design-system', 'acme');
    fs.mkdirSync(dsDir, { recursive: true });
    fs.writeFileSync(path.join(dsDir, 'paint.js'), paint);
    sh(d.repo, 'init', '-q');
    sh(d.repo, 'add', '-A');
    sh(d.repo, 'commit', '-qm', 'with ds');
    const head = sh(d.repo, 'rev-parse', 'HEAD');
    const painted = await run(d);
    expect(bytes(png(painted, '01-ds')).equals(bytes(png(without, '01-ds')))).toBe(false);

    fs.rmSync(path.join(d.repo, 'docs', 'ui', '_design-system'), { recursive: true });
    const unpainted = await run(d);
    const atCommit = await run(d, { at: head });
    expect(bytes(png(unpainted, '01-ds')).equals(bytes(png(without, '01-ds')))).toBe(true);
    expect(bytes(png(atCommit, '01-ds')).equals(bytes(png(painted, '01-ds')))).toBe(true);
  });
});

describe('the local server (O-SEC2)', () => {
  const get = (port, p) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
  });

  it('serves files inside the root and refuses anything that resolves outside it', async () => {
    const parent = tmp();
    const root = path.join(parent, 'root');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'ok.html'), 'ok');
    fs.writeFileSync(path.join(parent, 'secret.txt'), 'secret');
    fs.mkdirSync(path.join(parent, 'root-evil'));
    fs.writeFileSync(path.join(parent, 'root-evil', 'secret.txt'), 'secret');
    const s = await render.serve(root);
    try {
      expect(await get(s.port, '/ok.html')).toBe(200);
      expect(await get(s.port, '/missing.html')).toBe(404);
      expect(await get(s.port, '/../secret.txt')).toBe(403);
      expect(await get(s.port, '/%2e%2e/secret.txt')).toBe(403);
      // The sibling whose name starts with the root's name: the bare-prefix bypass.
      expect(await get(s.port, '/../root-evil/secret.txt')).toBe(403);
      expect(await get(s.port, '/%00')).toBe(400);
      expect(await get(s.port, '/%E0%A4%A')).toBe(400);
    } finally {
      await s.close();
    }
  });
});

describe('withProps (D7)', () => {
  it('overrides a tweak default and keeps its other keys and $preview', () => {
    const out = render.withProps(fixture('stateful.dc.html'), { empty: true }, 'b');
    expect(out).toContain('"empty":{"type":"boolean","default":true}');
    expect(out).toContain('"$preview":{"width":320,"height":200}');
  });

  it('adds data-props when the script has none, and refuses a board with no script', () => {
    const bare = '<script type="text/x-dc" data-dc-script>class Component extends DCLogic {}</script>';
    expect(render.withProps(bare, { a: 1 }, 'b')).toContain(`data-props='{"a":{"default":1}}'`);
    expect(() => render.withProps('<div></div>', { a: 1 }, 'b')).toThrow('no data-dc-script');
  });
});

describe('missing tools exit 2 naming the install step (D13)', () => {
  const cli = path.join(__dirname, 'design-render.js');
  const cliRun = (d, env = {}) => spawnSync(process.execPath, [cli, 'render', '--dir', d.dir, '--runtime', RUNTIME, '--out', path.join(d.repo, 'o')],
    { cwd: d.repo, env: { ...process.env, ...env }, encoding: 'utf8' });

  it('resolveTool names the package and the install command', () => {
    expect(() => render.resolveTool('definitely-not-installed-pkg', os.tmpdir(), 'run `npm install x`')).toThrow(render.ToolError);
    try {
      render.resolveTool('definitely-not-installed-pkg', os.tmpdir(), 'run `npm install x`');
    } catch (e) {
      expect(e.exitCode).toBe(2);
      expect(e.message).toMatch(/definitely-not-installed-pkg.*npm install x/);
    }
  });

  it('exits 2 when Playwright is not resolvable from the project', () => {
    const d = mkDesign([board('01-plain')], { '01-plain.dc.html': fixture('plain.dc.html') });
    // Resolution starts at the project root and the global npm root, never at this repository.
    const r = cliRun(d, { PATH: path.dirname(process.execPath) });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/playwright is not installed.*npm install --save-dev playwright.*npx playwright install chromium/);
  });

  it('exits 2 when Playwright has no Chromium, and renders through the CLI when it has', () => {
    const d = mkDesign([board('01-plain')], { '01-plain.dc.html': fixture('plain.dc.html') });
    // Playwright resolves from this repository: run the CLI with the repo as the project root.
    const run2 = (env) => spawnSync(process.execPath, [cli, 'render', '--dir', d.dir, '--runtime', RUNTIME, '--out', path.join(d.repo, 'o')],
      { cwd: path.join(__dirname, '..', '..', '..'), env: { ...process.env, ...env }, encoding: 'utf8' });
    const noBrowser = run2({ PLAYWRIGHT_BROWSERS_PATH: tmp('empty-browsers-') });
    expect(noBrowser.status).toBe(2);
    expect(noBrowser.stderr).toMatch(/npx playwright install chromium/);
    const ok = run2({});
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout).frames).toHaveLength(1);
  });

  it('rejects bad arguments with exit 1', () => {
    const r = spawnSync(process.execPath, [cli, 'render', '--dir', 'x'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--out is required/);
    expect(render.parseArgs(['render', '--approved', '--dir', 'd']).opts).toEqual({ approved: true, dir: 'd' });
    expect(() => render.parseArgs(['render', '--dir'])).toThrow('needs a value');
  });
});

describe('the pinned runtime (D1, D2)', () => {
  const crypto = require('crypto');
  const cli = path.join(__dirname, 'design-render.js');
  it('PINNED_RUNTIME is the shipped file and its hash constant matches it', () => {
    expect(render.PINNED_RUNTIME).toBe(path.join(__dirname, 'dc-runtime.js'));
    const sha = crypto.createHash('sha256').update(fs.readFileSync(render.PINNED_RUNTIME)).digest('hex');
    expect(render.PINNED_RUNTIME_SHA256).toBe(sha);
  });

  it('runtime-check reports match for the pinned file and no match for a one-byte change', () => {
    expect(render.runtimeCheck(render.PINNED_RUNTIME)).toEqual({
      match: true, pinned: render.PINNED_RUNTIME_SHA256, live: render.PINNED_RUNTIME_SHA256,
    });
    const copy = path.join(tmp('rt-'), 'dc-runtime.js');
    fs.writeFileSync(copy, fs.readFileSync(render.PINNED_RUNTIME, 'utf8') + ' ');
    const r = render.runtimeCheck(copy);
    expect(r.match).toBe(false);
    expect(r.pinned).toBe(render.PINNED_RUNTIME_SHA256);
    expect(r.live).not.toBe(r.pinned);
  });

  it('the runtime-check verb prints the result as JSON, and needs --live', () => {
    const ok = spawnSync(process.execPath, [cli, 'runtime-check', '--live', render.PINNED_RUNTIME], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout).match).toBe(true);
    const bad = spawnSync(process.execPath, [cli, 'runtime-check'], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/--live is required/);
  });

  it('render with no runtime uses the pinned one', async () => {
    const d = mkDesign([board('01-plain')], { '01-plain.dc.html': fixture('plain.dc.html') });
    const r = await render.render({ dir: d.dir, out: path.join(d.repo, 'o'), repo: d.repo, offline: true });
    expect(r.frames).toHaveLength(1);
  });

  it('ships no playwright directory or package under .claude/ (AC-N4)', () => {
    const root = path.join(__dirname, '..', '..', '..', '.claude');
    const found = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (/^playwright/i.test(e.name)) found.push(path.join(d, e.name));
        if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'worktrees') walk(path.join(d, e.name));
      }
    };
    walk(root);
    expect(found).toEqual([]);
  });
});

describe('the libraries ship with their mirrors', () => {
  const root = path.join(__dirname, '..', '..', '..');
  it.each(['design-render.js', 'design-bundle.js', 'dc-runtime.js'])('%s exists in .claude/lib (identical) and packages/full/lib (a link)', (f) => {
    expect(fs.readFileSync(path.join(root, '.claude', 'lib', f), 'utf8')).toBe(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    const link = path.join(root, 'packages', 'full', 'lib', f);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe(`../../core/lib/${f}`);
  });

  it('neither library requires anything under __fixtures__ (copy_libs ships top-level *.js only)', () => {
    for (const f of ['design-render.js', 'design-bundle.js']) {
      expect(fs.readFileSync(path.join(__dirname, f), 'utf8')).not.toMatch(/require\([^)]*__fixtures__/);
    }
  });

  it('pins the runtime fixture by hash', () => {
    const sha = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'dc-runtime.js'))).digest('hex');
    // Read from the Design type's canvas version 1793773596-7b8f on 2026-11-04 (D14).
    expect(sha).toBe('b795ee21261f2e7da1b10cb25b4a4cfa275d1b96165f89396f1fed426e191844');
  });
});

describe('measures (D3)', () => {
  const ids = {
    contrast: 'measure-contrast', target: 'measure-target', clipped: 'measure-clipped',
    overlap: 'measure-overlap', offtoken: 'measure-offtoken', imp: 'measure-import', plain: 'plain',
  };
  const files = Object.fromEntries(Object.values(ids).map((n) => [`${n}.dc.html`, fixture(`${n}.dc.html`)]));
  const mk = () => mkDesign(Object.values(ids).map((n) => board(n)), files);
  const writeTokens = (d, json, folder = 'acme') => {
    const dir = path.join(d.repo, 'docs', 'ui', '_design-system', folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify(json));
  };
  const of = (r, id, check, verdict) => r.measures.filter((m) => m.board === id && m.check === check && (verdict === undefined || m.verdict === verdict));

  it('can run the script in the board iframe through page.frames()', async () => {
    const d = mk();
    const r = await run(d, { boards: [ids.contrast] });
    expect(of(r, ids.contrast, 'measurement')).toEqual([]);
    expect(of(r, ids.contrast, 'contrast').length).toBeGreaterThan(0);
  });

  it('with no floor, reports the lowest contrast and smallest target and no verdict', async () => {
    const r = await run(mk(), { boards: [ids.contrast, ids.target] });
    const [c] = of(r, ids.contrast, 'contrast');
    expect(c.verdict).toBeNull();
    expect(c.value).toBeCloseTo(2.32, 1); // #aaaaaa on white
    expect(c.count).toBe(11);
    const [t] = of(r, ids.target, 'target-size');
    expect(t).toMatchObject({ verdict: null, value: 24, count: 2 });
  });

  it('ten low-contrast elements sharing one colour pair give one below-floor measure with count 10', async () => {
    const r = await run(mk(), { boards: [ids.contrast], floor: { contrast: 4.5 } });
    const m = of(r, ids.contrast, 'contrast');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ verdict: 'below-floor', count: 10, state: null, viewport: '320x200' });
    expect(m[0].value).toBeLessThan(4.5);
  });

  it('flags a 24 px link under a 44 px floor, and not the 48 px button', async () => {
    const r = await run(mk(), { boards: [ids.target], floor: { target: 44 } });
    const m = of(r, ids.target, 'target-size');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ verdict: 'below-floor', value: 24, detail: '24x24', count: 1 });
    expect(m[0].element).toMatch(/^a/);
  });

  it('reports clipped text and overlapping buttons as layout faults', async () => {
    const r = await run(mk(), { boards: [ids.clipped, ids.overlap] });
    expect(of(r, ids.clipped, 'layout').map((m) => m.detail)).toContain('clipped-text');
    expect(of(r, ids.overlap, 'layout')).toContainEqual(expect.objectContaining({ verdict: 'fault', detail: 'overlapping-targets', count: 1 }));
    const plain = of(await run(mk(), { boards: [ids.plain] }), ids.plain, 'layout').map((m) => m.detail);
    expect(plain).not.toContain('clipped-text');
    expect(plain).not.toContain('overlapping-targets');
  });

  it('without a tokens.json, fidelity is not-measured and compares nothing', async () => {
    const r = await run(mk(), { boards: [ids.offtoken] });
    expect(of(r, ids.offtoken, 'fidelity')).toEqual([expect.objectContaining({ verdict: 'not-measured' })]);
  });

  it('one off-token per distinct colour with a count, in the grouped tokens shape; a stacked family compares by its first family', async () => {
    const d = mk();
    writeTokens(d, { color: { tokens: [{ name: 'ink', value: '#111111' }, { name: 'paper', value: '#fff' }] }, type: { families: { mono: 'monospace, "Courier New"' } } });
    const r = await run(d, { boards: [ids.offtoken] });
    const f = of(r, ids.offtoken, 'fidelity', 'off-token');
    expect(f.filter((m) => m.detail === 'text')).toEqual([expect.objectContaining({ value: 'rgba(255, 0, 0, 1)', count: 2 })]);
    expect(f.filter((m) => m.detail === 'font-family')).toEqual([expect.objectContaining({ value: 'georgia', count: 1 })]);
    expect(f.filter((m) => m.detail === 'background')).toEqual([]); // white is a token, written as #fff
    expect(f.filter((m) => m.detail === 'border')).toEqual([]); // zero-width borders are not compared
  });

  it('reads the list tokens shape too', async () => {
    const d = mk();
    writeTokens(d, { tokens: [{ name: 'ink', value: '#111' }, { name: 'paper', value: 'rgb(255 255 255)' }, { name: 'radius', value: '6px' }] });
    const f = of(await run(d, { boards: [ids.offtoken] }), ids.offtoken, 'fidelity', 'off-token');
    expect(f.map((m) => `${m.detail}:${m.value}`)).toEqual(['text:rgba(255, 0, 0, 1)']);
  });

  it('an hsl() colour token makes colour fidelity not-measured, naming the token', async () => {
    const d = mk();
    writeTokens(d, { color: { tokens: [{ name: 'brand', value: 'hsl(220 50% 50%)' }] }, type: { families: { mono: 'monospace' } } });
    const f = of(await run(d, { boards: [ids.offtoken] }), ids.offtoken, 'fidelity');
    expect(f).toContainEqual(expect.objectContaining({ verdict: 'not-measured', detail: 'color', value: 'brand' }));
    expect(f.filter((m) => m.detail === 'text')).toEqual([]);
  });

  it('reports a failed x-import from the console, not as a render error', async () => {
    const r = await run(mk(), { boards: [ids.imp] });
    const f = of(r, ids.imp, 'fidelity', 'import-failed');
    expect(f).toHaveLength(1);
    expect(f[0].value).toMatch(/does-not-exist/);
    // The console message itself is not pushed into errors (the runtime's own render error is separate).
    expect((r.errors[ids.imp] || []).join(' ')).not.toMatch(/FAILED to load/);
  });

  it('takes the state from the target, not the copy filename', async () => {
    const d = mkDesign([board('02-state', { states: { empty: { props: { empty: true } } } })], { '02-state.dc.html': fixture('stateful.dc.html') });
    const r = await run(d, { floor: { contrast: 4.5 } });
    expect(r.measures.some((m) => m.state === 'empty')).toBe(true);
    expect(r.measures.every((m) => m.state === null || m.state === 'empty')).toBe(true);
    // Every measure names its frame: the board, the state and the viewport it was measured at.
    expect(r.measures.every((m) => m.board === '02-state' && m.viewport === '320x200')).toBe(true);
    expect(r.frames.every((f) => f.viewport === '320x200')).toBe(true);
  });

  it('maps --floor-contrast and --floor-target on the CLI, and rejects a bad number', () => {
    const d = mk();
    const cli = path.join(__dirname, 'design-render.js');
    const args = (...extra) => [cli, 'render', '--dir', d.dir, '--runtime', RUNTIME, '--out', path.join(d.repo, 'o'), '--boards', ids.target, ...extra];
    const cwd = path.join(__dirname, '..', '..', '..');
    const ok = spawnSync(process.execPath, args('--floor-target', '44'), { cwd, encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout).measures.find((m) => m.check === 'target-size').verdict).toBe('below-floor');
    const bad = spawnSync(process.execPath, args('--floor-contrast', 'abc'), { cwd, encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/--floor-contrast must be a positive number/);
  });

  it('normalizeColor accepts hex of 3, 4, 6 and 8 digits and rgb()/rgba(), and refuses other syntax', () => {
    expect(render.normalizeColor('#abc')).toBe('rgba(170, 187, 204, 1)');
    expect(render.normalizeColor('#abcd')).toBe('rgba(170, 187, 204, 0.87)');
    expect(render.normalizeColor('#aabbcc80')).toBe('rgba(170, 187, 204, 0.5)');
    expect(render.normalizeColor('rgb(1 2 3 / 50%)')).toBe('rgba(1, 2, 3, 0.5)');
    expect(render.normalizeColor('rgba(1, 2, 3, 0.25)')).toBe('rgba(1, 2, 3, 0.25)');
    expect(render.normalizeColor('hsl(1 2% 3%)')).toBeNull();
    expect(render.normalizeColor('var(--x)')).toBeNull();
  });
});
