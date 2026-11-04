'use strict';

/**
 * design-render.js -- render a design's boards to PNG frames with the Design type's own runtime.
 *
 * WHY THIS EXISTS
 *
 * A board is a `.dc.html` file that only means something once the canvas runtime (`dc-runtime.js`)
 * has mounted it. Verification and review compare frames, so something has to produce the same
 * frame from the same source, locally, with no Artifact call (D2). This module serves a throwaway
 * render root on 127.0.0.1, loads each board in a headless Chromium, waits for the runtime's own
 * `__dc_booted` / `__dc_render_errors` messages (never a fixed sleep) and screenshots it.
 *
 *   <out>/NN-name.png              the default state
 *   <out>/NN-name--<state>.png     one per `states.<name>`, rendered from a temporary copy of the
 *                                  board whose `data-props` carry that state's `props` (D7)
 *
 * Playwright is the PRODUCT's (D13): resolved from the project, then the global npm root, never
 * shipped in `.claude/`. Missing Playwright, or Playwright without its Chromium, is a ToolError
 * (exit 2) naming the install step.
 *
 * CLI (run from the project root; JSON on stdout, error on stderr, exit 1, or 2 for a missing tool):
 *   node .claude/lib/design-render.js render --dir docs/ui/<slug> --runtime <dc-runtime.js> --out <dir>
 *     [--boards a,b] [--at <sha> | --approved]
 *
 * `--at` renders from `git archive <sha>`; `--approved` renders each approved, building or shipped
 * board at its `approved_commit` and the rest at HEAD (D4). The design system's committed files in
 * `docs/ui/_design-system/` always come from the same commit as the board and are served as
 * `ds/<folder>/`.
 *
 * Module option `offline` (used by the pinned-runtime tests, D14): the runtime's two React CDN
 * requests are answered from the `react` / `react-dom` devDependencies and every other request
 * that does not go to the local server is aborted, so a test can never pass or fail on a CDN.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const designMap = require('./design-map');

const LAUNCH_TIMEOUT_MS = 30000;
const BOOT_TIMEOUT_MS = 15000;
const BUILT_STATUSES = ['approved', 'building', 'shipped'];
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

// The page the board loads in. The iframe matters: the runtime posts `__dc_render_errors` only
// when `window.parent !== window`.
const HOST_HTML = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0"><iframe id="f" style="border:0;width:100vw;height:100vh;display:block"></iframe>
<script>
window.__msgs = [];
addEventListener('message', function (e) {
  if (e.data && typeof e.data.type === 'string' && e.data.type.indexOf('__dc') === 0) window.__msgs.push(e.data);
});
document.getElementById('f').src = new URLSearchParams(location.search).get('b');
</script></body></html>`;

/** A missing or unusable tool: the CLI exits 2 and the message names the install step (D13). */
class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolError';
    this.exitCode = 2;
  }
}

/**
 * Resolve a Node package from the product first, then the global npm root (D13).
 * `installHint` is the sentence a missing tool is reported with.
 */
function resolveTool(name, projectRoot, installHint) {
  const roots = [path.resolve(projectRoot || '.')];
  try {
    return require(require.resolve(name, { paths: roots }));
  } catch (_) { /* try the global root */ }
  const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
  if (g.status === 0 && g.stdout.trim()) {
    try {
      return require(require.resolve(name, { paths: [g.stdout.trim()] }));
    } catch (_) { /* fall through */ }
  }
  throw new ToolError(`${name} is not installed for this project: ${installHint}`);
}

/**
 * Serve `root` on 127.0.0.1 with an ephemeral port. A request that resolves outside `root` is
 * refused (O-SEC2): the check is `root + path.sep`, because a bare prefix test lets a sibling
 * folder such as `<root>-evil` through.
 */
function serve(root) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    let file;
    try {
      const pathname = decodeURIComponent(req.url.split('?')[0]);
      if (pathname.includes('\0')) throw new Error('nul');
      file = path.resolve(base, '.' + pathname);
    } catch (_) {
      res.writeHead(400);
      return res.end();
    }
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ port: server.address().port, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

function git(repo, args, opts = {}) {
  return spawnSync('git', ['-C', repo, ...args], { maxBuffer: 256 * 1024 * 1024, ...opts });
}

/** Extract `paths` of `commit` under `dest`; a path the commit lacks is skipped when `optional`. */
function archiveInto(top, commit, paths, dest, { optional = false } = {}) {
  for (const p of paths) {
    const a = git(top, ['archive', '--format=tar', commit, '--', p]);
    if (a.status !== 0) {
      if (optional) continue;
      throw new Error(`git archive ${commit} -- ${p} failed: ${String(a.stderr).trim()}`);
    }
    const t = spawnSync('tar', ['-x', '-C', dest], { input: a.stdout });
    if (t.status !== 0) throw new Error(`could not extract ${p} at ${commit}: ${String(t.stderr).trim()}`);
  }
}

/**
 * Set each named tweak's `default` in the board's `data-props` (D7). The runtime reads
 * `getAttribute("data-props")` on `script[data-dc-script]` as one object per tweak, e.g.
 * `{"empty":{"type":"boolean","default":false}}`, and mounts the board with each `default`, so
 * rewriting source needs no runtime API. Other keys of a tweak (type, label) are kept.
 */
function withProps(source, props, boardId) {
  const tag = /<script\b[^>]*\bdata-dc-script\b[^>]*>/.exec(source);
  if (!tag) throw new Error(`board ${boardId} has no data-dc-script block, so a state cannot be applied`);
  const attr = /\sdata-props=(["'])([\s\S]*?)\1/.exec(tag[0]);
  let current = {};
  if (attr) {
    const raw = attr[2].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    try { current = JSON.parse(raw); } catch (_) { current = {}; }
  }
  const next = { ...current };
  for (const [k, v] of Object.entries(props)) {
    next[k] = { ...(next[k] && typeof next[k] === 'object' ? next[k] : {}), default: v };
  }
  const value = JSON.stringify(next).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  const nextTag = attr
    ? tag[0].replace(attr[0], ` data-props='${value}'`)
    : tag[0].replace(/\bdata-dc-script\b/, `data-dc-script data-props='${value}'`);
  return source.replace(tag[0], () => nextTag);
}

/** A render root: the boards' mirror folder, ds/<folder>/ copies, the runtime as support.js, the host page. */
function buildRoot({ mirror, dsDir, runtime }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'design-render-')));
  fs.cpSync(mirror, root, { recursive: true });
  if (dsDir && fs.existsSync(dsDir)) {
    for (const e of fs.readdirSync(dsDir, { withFileTypes: true })) {
      if (e.isDirectory()) fs.cpSync(path.join(dsDir, e.name), path.join(root, 'ds', e.name), { recursive: true });
    }
  }
  fs.copyFileSync(runtime, path.join(root, 'support.js'));
  fs.writeFileSync(path.join(root, 'host.html'), HOST_HTML);
  return root;
}

/** The two React UMD files the runtime would fetch from jsdelivr, from the pinned devDependencies. */
function reactFiles() {
  // `exports` hides umd/, so locate the package by its package.json and join the path.
  const umd = (pkg, file) => path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'umd', file);
  return {
    'react@18.3.1/umd/react.production.min.js': umd('react', 'react.production.min.js'),
    'react-dom@18.3.1/umd/react-dom.production.min.js': umd('react-dom', 'react-dom.production.min.js'),
  };
}

async function routeOffline(page, port) {
  const react = reactFiles();
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
    const hit = Object.keys(react).find((k) => url.startsWith('https://cdn.jsdelivr.net/npm/' + k));
    if (hit) return route.fulfill({ path: react[hit], contentType: 'text/javascript' });
    return route.abort();
  });
}

const messageText = (e) => (typeof e === 'string' ? e : (e && (e.message || e.error)) || JSON.stringify(e));

/** Screenshot one file of the render root; returns the runtime's render errors. */
async function capture(browser, { port, file, viewport, png, offline }) {
  const page = await browser.newPage({ viewport: { width: viewport[0], height: viewport[1] } });
  const errors = [];
  try {
    if (offline) await routeOffline(page, port);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/host.html?b=${encodeURIComponent(file)}`);
    // Wait on the runtime's own messages, not a sleep: a fixed delay makes the stable-PNG test a timing bet.
    try {
      // Strings, not functions: a coverage-instrumented function body cannot be serialised into the page.
      await page.waitForFunction(
        "window.__msgs.some((m) => m.type === '__dc_booted') && window.__msgs.some((m) => m.type === '__dc_render_errors')",
        null, { timeout: BOOT_TIMEOUT_MS },
      );
    } catch (_) {
      errors.push('the runtime never sent __dc_booted and __dc_render_errors');
    }
    const msgs = await page.evaluate('window.__msgs');
    for (const m of msgs) {
      if (m.type === '__dc_render_errors') for (const e of m.errors || []) errors.push(messageText(e));
      if (m.type === '__dc_booted' && m.mounted === false) errors.push('the runtime booted but mounted nothing');
    }
    await page.screenshot({ path: png });
  } finally {
    await page.close();
  }
  return errors;
}

async function launch(projectRoot) {
  const pw = resolveTool('playwright', projectRoot, 'run `npm install --save-dev playwright` (or `npm install -g playwright`), then `npx playwright install chromium`');
  try {
    return await pw.chromium.launch({ timeout: LAUNCH_TIMEOUT_MS });
  } catch (e) {
    if (/Executable doesn't exist|playwright install/i.test(e.message)) {
      throw new ToolError("Playwright's Chromium is not installed: run `npx playwright install chromium`");
    }
    throw e;
  }
}

/**
 * Render a design's boards.
 * @param {object} o
 * @param {string} o.dir      docs/ui/<slug>, holding design-map.json
 * @param {string} o.runtime  path to dc-runtime.js (written into the render root as support.js)
 * @param {string} o.out      directory the PNGs are written to
 * @param {string[]} [o.boards] board ids to render (default: every board not superseded)
 * @param {string} [o.at]     commit to render from instead of the working tree
 * @param {boolean} [o.approved] render each approved/building/shipped board at its approved_commit
 * @param {boolean} [o.offline] see the header (D14)
 * @param {string} [o.repo]   repository the git calls run in (default: the working directory)
 * @param {string} [o.projectRoot] where Playwright is resolved from first (default: the working directory)
 * @returns {Promise<{frames: {board, state, png}[], errors: Object<string, string[]>}>}
 */
async function render(o) {
  const map = designMap.read(o.dir);
  const repo = path.resolve(o.repo || '.');
  const ids = o.boards && o.boards.length ? o.boards : null;
  const boards = map.boards.filter((b) => (ids ? ids.includes(b.id) : b.status !== 'superseded'));
  if (ids) for (const id of ids) if (!boards.some((b) => b.id === id)) throw new Error(`no board ${id}`);

  const commitOf = (b) => {
    if (o.at) return o.at;
    if (o.approved) return BUILT_STATUSES.includes(b.status) && b.approved_commit ? b.approved_commit : 'HEAD';
    return null; // working tree
  };
  const groups = new Map();
  for (const b of boards) {
    const c = commitOf(b);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(b);
  }

  const canvasDir = (map.canvases && map.canvases[0] && map.canvases[0].dir) || 'canvas/project';
  const dirAbs = path.resolve(o.dir);
  const runtime = path.resolve(o.runtime);
  if (!fs.existsSync(runtime)) throw new Error(`runtime not found: ${runtime}`);
  fs.mkdirSync(o.out, { recursive: true });

  const browser = await launch(o.projectRoot || '.');
  const result = { frames: [], errors: {} };
  const cleanup = [];
  try {
    for (const [commit, group] of groups) {
      let mirror = path.join(dirAbs, canvasDir);
      let dsDir = path.join(dirAbs, '..', '_design-system');
      if (commit) {
        const top = git(repo, ['rev-parse', '--show-toplevel']).stdout.toString().trim();
        const ex = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'design-src-')));
        cleanup.push(ex);
        const relMirror = path.relative(fs.realpathSync(top), path.join(fs.realpathSync(dirAbs), canvasDir));
        const relDs = path.relative(fs.realpathSync(top), path.join(fs.realpathSync(dirAbs), '..', '_design-system'));
        archiveInto(top, commit, [relMirror], ex);
        archiveInto(top, commit, [relDs], ex, { optional: true });
        mirror = path.join(ex, relMirror);
        dsDir = path.join(ex, relDs);
      }
      const root = buildRoot({ mirror, dsDir, runtime });
      cleanup.push(root);
      const server = await serve(root);
      try {
        for (const b of group) {
          const targets = [{ state: null, file: b.file, png: `${b.id}.png` }];
          for (const [name, st] of Object.entries(b.states || {})) {
            if (!st || !st.props) continue; // a state without props has nothing to override
            const copy = path.join(path.dirname(b.file), `${b.id}--${name}.dc.html`);
            fs.writeFileSync(path.join(root, copy), withProps(fs.readFileSync(path.join(root, b.file), 'utf8'), st.props, b.id));
            targets.push({ state: name, file: copy, png: `${b.id}--${name}.png` });
          }
          for (const t of targets) {
            const png = path.join(o.out, t.png);
            const errs = await capture(browser, { port: server.port, file: t.file, viewport: b.viewport, png, offline: o.offline });
            result.frames.push({ board: b.id, state: t.state, png });
            if (errs.length) (result.errors[b.id] = result.errors[b.id] || []).push(...errs.map((e) => (t.state ? `[${t.state}] ${e}` : e)));
          }
        }
      } finally {
        await server.close();
      }
    }
  } finally {
    await browser.close();
    for (const d of cleanup) fs.rmSync(d, { recursive: true, force: true });
  }
  return result;
}

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) throw new Error(`unexpected argument ${rest[i]}`);
    const key = rest[i].slice(2);
    if (key === 'approved') opts.approved = true;
    else if (rest[i + 1] === undefined || rest[i + 1].startsWith('--')) throw new Error(`--${key} needs a value`);
    else opts[key] = rest[++i];
  }
  return { verb, opts };
}

async function main(argv) {
  const { verb, opts } = parseArgs(argv);
  if (verb !== 'render') throw new Error('usage: design-render.js render --dir D --runtime R --out O [--boards a,b] [--at SHA | --approved]');
  for (const f of ['dir', 'runtime', 'out']) if (!opts[f]) throw new Error(`--${f} is required`);
  if (opts.at && opts.approved) throw new Error('--at and --approved are exclusive');
  return render({ ...opts, boards: opts.boards ? opts.boards.split(',') : null });
}

module.exports = { render, serve, resolveTool, withProps, parseArgs, ToolError };

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (r) => process.stdout.write(JSON.stringify(r) + '\n'),
    (e) => {
      process.stderr.write('design-render.js: ' + e.message + '\n');
      process.exit(e.exitCode || 1);
    },
  );
}
