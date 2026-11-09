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
 * Playwright is the PRODUCT's (D13): resolved from the project (as `playwright` or `@playwright/test`),
 * then each workspace package folder of a monorepo, then the global npm root, never shipped in
 * `.claude/`. Missing Playwright, or Playwright without its Chromium, is a ToolError
 * (exit 2) naming the install step.
 *
 * CLI (run from the project root; JSON on stdout, error on stderr, exit 1, or 2 for a missing tool):
 *   node .claude/lib/design-render.js render --dir docs/ui/<slug> --out <dir>
 *     [--runtime <dc-runtime.js>] [--boards a,b] [--at <sha> | --approved] [--map <file>]
 *     [--floor-contrast <ratio>] [--floor-target <px>]
 *   node .claude/lib/design-render.js runtime-check --live <file>
 *
 * `--runtime` is optional: it defaults to PINNED_RUNTIME, the `dc-runtime.js` that ships beside this
 * module, so every command renders with the same runtime (D1). `runtime-check --live <file>` prints
 * `{ match, pinned, live }` (sha256 of the pinned copy and of the file given) so a command that has
 * read the canvas's own runtime can say when the pinned copy has drifted (D2).
 *
 * REFRESHING THE PINNED RUNTIME is a framework release step, never done during a run: run the
 * release-change test with `DC_RUNTIME=<live file> npx jest packages/core/lib/design-render.test.js`,
 * then copy the live file over `packages/core/lib/dc-runtime.js` (and `.claude/lib/dc-runtime.js`),
 * and update PINNED_RUNTIME_SHA256 and its provenance comment below.
 *
 * `--map` reads the boards from that JSON file instead of `<dir>/design-map.json`: a drawing
 * agent renders before the command has written the map (only the command writes it), so it
 * passes a scratch map holding just the boards it drew. Board files still resolve under `--dir`.
 *
 * `--at` renders from `git archive <sha>`; `--approved` renders each approved, building or shipped
 * board at its `approved_commit` and the rest at HEAD (D4). The design system's committed files in
 * `docs/ui/_design-system/` always come from the same commit as the board and are served as
 * `ds/<folder>/`.
 *
 * MEASURES (D3). While a board's page is open, one read-only script measures it: text contrast,
 * target size, layout faults, and fidelity (computed colours and font families against the
 * `ds/<folder>/tokens.json` files in the render root, plus the runtime's `x-import: FAILED to
 * load` console messages). `render()` returns them as `measures`, one per distinct (check,
 * verdict, value) per frame with a `count`; each names its frame by `board`, `state` and `viewport` (`WxH`). `--floor-contrast` / `--floor-target` (module option
 * `floor: { contrast, target }`) give a verdict; with no floor each frame reports its lowest
 * contrast and smallest target and no verdict. A measure is data for the critic, never a gate.
 *
 * Module option `offline` (used by the pinned-runtime tests): the runtime's two React CDN
 * requests are answered from the `react` / `react-dom` devDependencies and every other request
 * that does not go to the local server is aborted, so a test can never pass or fail on a CDN.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const designMap = require('./design-map');

/** The canvas runtime every render uses unless `--runtime` / `o.runtime` says otherwise (D1). */
const PINNED_RUNTIME = path.join(__dirname, 'dc-runtime.js');
// Read from the Design type's canvas version 1793773596-7b8f on 2026-11-04.
const PINNED_RUNTIME_SHA256 = 'b795ee21261f2e7da1b10cb25b4a4cfa275d1b96165f89396f1fed426e191844';

const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** Compare the pinned runtime with a live copy: { match, pinned, live } (D2). */
function runtimeCheck(liveFile) {
  const pinned = sha256File(PINNED_RUNTIME);
  const live = sha256File(path.resolve(liveFile));
  return { match: pinned === live, pinned, live };
}

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
document.getElementById('f').src = new URLSearchParams(location.search).get('b').split('/').map(encodeURIComponent).join('/');
</script></body></html>`;

/**
 * A state name as a file name: every run of characters outside [A-Za-z0-9._-] becomes one '-',
 * leading and trailing '-' are trimmed, and an empty result becomes 'state'. A name that is already
 * safe is unchanged. State names are free text (`empty?`), but they must not reach a URL or a PNG
 * name as `?`, `#`, `%`, `/` or a space.
 */
function stateSlug(name) {
  return String(name).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'state';
}

/**
 * The file-name slug of each state of one board, as a Map name -> slug, with no two alike. Two
 * passes: a name that is already safe keeps itself (so an existing frame never changes file name
 * whatever its position), then each other name takes its slug, or `-2`, `-3`... the first form not
 * already taken by a name or slug of this board.
 */
function stateSlugs(names) {
  const slugs = new Map();
  const taken = new Set();
  for (const n of names) if (stateSlug(n) === n) { slugs.set(n, n); taken.add(n); }
  for (const n of names) {
    if (slugs.has(n)) continue;
    const base = stateSlug(n);
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    slugs.set(n, slug);
    taken.add(slug);
  }
  return slugs;
}

/** A missing or unusable tool: the CLI exits 2 and the message names the install step (D13). */
class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolError';
    this.exitCode = 2;
  }
}

/** Names a package may also be installed under; used only when a caller opts in (see resolveTool). */
const TOOL_ALIASES = { playwright: ['@playwright/test'] };

/** Strip quotes and a trailing comment from one YAML scalar. */
const yamlScalar = (v) => v.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');

/**
 * Read the `packages:` list of a pnpm-workspace.yaml without a YAML dependency: block form
 * (`- 'apps/*'`) and flow form (`packages: ['apps/*', 'packages/*']`, on one line or several). The list ends at the next
 * top-level key (`catalog:`, `onlyBuiltDependencies:` ...), so those entries are never read.
 */
function pnpmWorkspacePatterns(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return []; }
  const out = [];
  const pushFlow = (body) => {
    for (const item of body.split(',')) if (yamlScalar(item)) out.push(yamlScalar(item));
  };
  let inPackages = false;
  let flowBuf = null; // a flow list opened on the `packages:` line and not yet closed
  const closeFlow = () => {
    const end = flowBuf.indexOf(']');
    if (end !== -1) { pushFlow(flowBuf.slice(1, end)); flowBuf = null; }
  };
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    if (flowBuf !== null) {
      flowBuf += ' ' + line.replace(/\s+#.*$/, '').trim();
      closeFlow();
      continue;
    }
    const top = /^(['"]?)([A-Za-z0-9_$-]+)\1\s*:\s*(.*)$/.exec(line);
    if (top) {
      inPackages = top[2] === 'packages';
      const rest = top[3].replace(/\s+#.*$/, '').trim();
      if (inPackages && rest.startsWith('[')) { flowBuf = rest; closeFlow(); }
      continue;
    }
    const item = inPackages && /^\s*-\s+(.*)$/.exec(line);
    if (item && yamlScalar(item[1])) out.push(yamlScalar(item[1]));
  }
  return out;
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };

/**
 * Workspace package folders of a project: pnpm-workspace.yaml `packages:`, else package.json
 * `workspaces` (an array or `{ packages }`). `dir/*` expands to that folder's immediate subfolders
 * sorted by name; a plain path is taken as is; a `!folder` entry drops that folder, other `!` entries
 * and anything with `**` are skipped; only
 * folders that exist and hold a package.json are kept. A path outside the repo is allowed.
 */
function workspaceFolders(projectRoot) {
  let patterns = pnpmWorkspacePatterns(path.join(projectRoot, 'pnpm-workspace.yaml'));
  if (!patterns.length) {
    try {
      const w = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).workspaces;
      patterns = Array.isArray(w) ? w : (w && Array.isArray(w.packages) ? w.packages : []);
    } catch (_) { patterns = []; }
  }
  const folders = [];
  const excluded = patterns
    .filter((r) => typeof r === 'string' && r.startsWith('!') && !r.includes('*'))
    .map((r) => path.resolve(projectRoot, r.slice(1).replace(/\/+$/, '')));
  for (const raw of patterns) {
    if (typeof raw !== 'string' || raw.startsWith('!') || raw.includes('**')) continue;
    const pat = raw.replace(/\/+$/, '');
    let candidates;
    if (pat.endsWith('/*')) {
      const parent = path.resolve(projectRoot, pat.slice(0, -2));
      try {
        candidates = fs.readdirSync(parent, { withFileTypes: true })
          .filter((e) => e.isDirectory() || (e.isSymbolicLink() && isDir(path.join(parent, e.name))))
          .map((e) => e.name).sort().map((n) => path.join(parent, n));
      } catch (_) { candidates = []; }
    } else if (!pat.includes('*')) {
      candidates = [path.resolve(projectRoot, pat)];
    } else {
      candidates = [];
    }
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'package.json')) && !excluded.includes(c) && !folders.includes(c)) folders.push(c);
    }
  }
  return folders;
}

/**
 * Resolve a Node package from the product first, then the global npm root (D13).
 * `installHint` is the sentence a missing tool is reported with.
 *
 * `opts` is optional. With `{ workspace: true, alias: [...] }` (passed only by `launch()`, through
 * `locateTool`), the
 * project root and then each workspace package folder is searched, each under `name` and then the
 * alias names (first hit wins), before the global root: a pnpm monorepo installs Playwright in an
 * app folder, never at the root. Without it the lookup is the root and the global root only, which
 * is what the bundler's tools (design-bundle.js) rely on.
 */
function resolveTool(name, projectRoot, installHint, opts) {
  return locateTool(name, projectRoot, installHint, opts).mod;
}

/** resolveTool, also returning the folder it was found from and whether that is a workspace package. */
function locateTool(name, projectRoot, installHint, opts) {
  const root = path.resolve(projectRoot || '.');
  const names = [name, ...((opts && opts.alias) || [])];
  const searched = [root];
  const tryFolder = (folder) => {
    for (const n of names) {
      try { return { mod: require(require.resolve(n, { paths: [folder] })), folder }; } catch (_) { /* next */ }
    }
    return null;
  };
  let hit = tryFolder(root);
  if (!hit && opts && opts.workspace) {
    for (const folder of workspaceFolders(root)) {
      searched.push(folder);
      hit = tryFolder(folder);
      if (hit) { hit.workspace = true; break; }
    }
  }
  if (hit) return hit;
  const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
  if (g.status === 0 && g.stdout.trim()) {
    searched.push(g.stdout.trim());
    hit = tryFolder(g.stdout.trim());
    if (hit) return hit;
  }
  throw new ToolError(`${name} is not installed for this project (searched: ${searched.join(', ')}): ${installHint}`);
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

/**
 * Copy a folder's contents into `dest`, bytes only: folders are made with the default mode and files
 * written fresh, so no mode, owner or setgid bit is carried (fs.cpSync copies the mode, and a setgid
 * source folder makes the chmod fail with EPERM on macOS under /private/tmp). Symlinks are followed;
 * a folder link back to an already-visited real path is skipped so a cycle cannot loop.
 */
function copyTree(src, dest, seen = new Set()) {
  const real = fs.realpathSync(src);
  if (seen.has(real)) return;
  seen.add(real);
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyTree(from, to, seen);
    else fs.writeFileSync(to, fs.readFileSync(from));
  }
}

/** A render root: the boards' mirror folder, ds/<folder>/ copies, the runtime as support.js, the host page. */
function buildRoot({ mirror, dsDir, runtime }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'design-render-')));
  copyTree(mirror, root);
  if (dsDir && fs.existsSync(dsDir)) {
    for (const e of fs.readdirSync(dsDir, { withFileTypes: true })) {
      if (e.isDirectory()) copyTree(path.join(dsDir, e.name), path.join(root, 'ds', e.name));
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

/**
 * The in-page measurement (D3): a STRING, evaluated in the board's iframe with its arguments
 * embedded as JSON. It only reads (no style or DOM writes), so the PNG stays byte-identical.
 * Returns { measures, fidelity }: contrast, target-size and layout measures are final; `fidelity`
 * is the distinct computed colours and font families, compared with the tokens in Node.
 */
const MEASURE_SCRIPT = String.raw`function (args) {
  var floor = args.floor || {};
  var SKIP = { SCRIPT: 1, STYLE: 1, TITLE: 1, NOSCRIPT: 1, META: 1, LINK: 1, HEAD: 1 };
  var measures = [];
  function parse(c) {
    var m = /^rgba?\(([^)]+)\)$/.exec(c);
    if (!m) return null;
    var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some(isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lin(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function round(n, d) { var k = Math.pow(10, d); return Math.round(n * k) / k; }
  function describe(el) {
    var d = el.tagName.toLowerCase();
    if (el.id) d += '#' + el.id;
    if (typeof el.className === 'string' && el.className.trim()) d += '.' + el.className.trim().split(/\s+/)[0];
    var t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (t) d += ' "' + t + '"';
    return d.slice(0, 80);
  }
  function visible(el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function hasText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim()) return true;
    }
    return false;
  }
  function group(map, key, make) {
    if (map[key]) { map[key].count++; return; }
    map[key] = make(); map[key].count = 1; map.order.push(key);
  }
  function groups() { return { order: [] }; }
  function drain(map, into) { map.order.forEach(function (k) { into.push(map[k]); }); }
  function backdrop(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (s.backgroundImage !== 'none') return null;
      var c = parse(s.backgroundColor);
      if (c && c.a >= 1) return c;
      if (c && c.a > 0) return null;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  var all = [document.body].concat(Array.prototype.slice.call(document.body.querySelectorAll('*')))
    .filter(function (el) { return !SKIP[el.tagName] && visible(el); });
  var textEls = all.filter(hasText);

  // Contrast.
  var cg = groups(), unmeasured = null, lowest = null, measuredCount = 0;
  textEls.forEach(function (el) {
    var fg = parse(getComputedStyle(el).color), bg = backdrop(el);
    if (!fg || !bg) {
      if (!unmeasured) unmeasured = { check: 'contrast', verdict: 'not-measured', value: null, count: 0, element: describe(el) };
      unmeasured.count++;
      return;
    }
    if (fg.a < 1) fg = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
    var rt = ratio(fg, bg);
    measuredCount++;
    if (typeof floor.contrast === 'number') {
      if (rt < floor.contrast) {
        var pair = Math.round(fg.r) + ',' + Math.round(fg.g) + ',' + Math.round(fg.b) + ' on ' + bg.r + ',' + bg.g + ',' + bg.b;
        group(cg, pair, function () { return { check: 'contrast', verdict: 'below-floor', value: round(rt, 2), detail: pair, element: describe(el) }; });
      }
    } else if (!lowest || rt < lowest.value) {
      lowest = { check: 'contrast', verdict: null, value: round(rt, 2), element: describe(el) };
    }
  });
  drain(cg, measures);
  if (lowest) { lowest.count = measuredCount; measures.push(lowest); }
  if (unmeasured) measures.push(unmeasured);

  // Target size.
  var TARGET = 'a[href],button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=tab],[role=menuitem],[tabindex]';
  var targets = all.filter(function (el) { return el.matches(TARGET) && (!el.hasAttribute('tabindex') || el.tabIndex >= 0 || el.matches('a[href],button,input,select,textarea')); });
  var tg = groups(), smallest = null;
  targets.forEach(function (el) {
    var r = el.getBoundingClientRect(), w = round(r.width, 1), h = round(r.height, 1), m = Math.min(w, h);
    if (typeof floor.target === 'number') {
      if (m < floor.target) group(tg, w + 'x' + h, function () { return { check: 'target-size', verdict: 'below-floor', value: m, detail: w + 'x' + h, element: describe(el) }; });
    } else if (!smallest || m < smallest.value) {
      smallest = { check: 'target-size', verdict: null, value: m, detail: w + 'x' + h, element: describe(el) };
    }
  });
  drain(tg, measures);
  if (smallest) { smallest.count = targets.length; measures.push(smallest); }

  // Layout faults.
  var de = document.documentElement;
  if (de.scrollWidth > de.clientWidth) measures.push({ check: 'layout', verdict: 'fault', detail: 'horizontal-overflow', value: de.scrollWidth + '>' + de.clientWidth, count: 1, element: 'page' });
  var lg = groups();
  textEls.forEach(function (el) {
    var cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth && (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis')) {
      var v = el.scrollWidth + '>' + el.clientWidth;
      group(lg, v, function () { return { check: 'layout', verdict: 'fault', detail: 'clipped-text', value: v, element: describe(el) }; });
    }
  });
  drain(lg, measures);
  var pairs = 0, firstPair = null, many = targets.slice(0, 500);
  var rects = many.map(function (el) { return el.getBoundingClientRect(); });
  for (var i = 0; i < many.length; i++) {
    for (var j = i + 1; j < many.length; j++) {
      if (many[i].contains(many[j]) || many[j].contains(many[i])) continue;
      var a = rects[i], b = rects[j];
      var ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 1 && oy > 1) { pairs++; if (!firstPair) firstPair = describe(many[i]) + ' / ' + describe(many[j]); }
    }
  }
  if (pairs) measures.push({ check: 'layout', verdict: 'fault', detail: 'overlapping-targets', value: pairs, count: pairs, element: firstPair });
  var edge = 0, edgeEl = null, edgeN = 0;
  all.forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.right <= window.innerWidth + 1) return;
    for (var n = el.parentElement; n && n !== document.body && n !== de; n = n.parentElement) {
      var ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return;
    }
    edgeN++;
    if (r.right > edge) { edge = r.right; edgeEl = describe(el); }
  });
  if (edgeN) measures.push({ check: 'layout', verdict: 'fault', detail: 'past-right-edge', value: Math.round(edge) + '>' + window.innerWidth, count: edgeN, element: edgeEl });

  // Fidelity inputs: distinct computed values, compared with the tokens in Node.
  var fg2 = groups();
  function seen(detail, value, el) {
    group(fg2, detail + '|' + value, function () { return { detail: detail, value: value, element: describe(el) }; });
  }
  all.forEach(function (el) {
    var cs = getComputedStyle(el);
    var bg = parse(cs.backgroundColor);
    if (bg ? bg.a > 0 : cs.backgroundColor !== 'transparent') seen('background', cs.backgroundColor, el);
    ['Top', 'Right', 'Bottom', 'Left'].forEach(function (side) {
      var st = cs['border' + side + 'Style'];
      if (parseFloat(cs['border' + side + 'Width']) > 0 && st !== 'none' && st !== 'hidden') seen('border', cs['border' + side + 'Color'], el);
    });
    if (hasText(el)) {
      seen('text', cs.color, el);
      seen('font-family', cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase(), el);
    }
  });
  var fidelity = [];
  drain(fg2, fidelity);
  return { measures: measures, fidelity: fidelity };
}`;

const FLOOR_KEYS = ['contrast', 'target'];

/** Parse a colour token or computed colour to 'rgba(r, g, b, a)', or null when it is another syntax. */
function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  let r; let g; let b; let a = 1;
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else {
    const m = /^rgba?\(([^)]+)\)$/i.exec(v);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const nums = parts.map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : Number(p)));
    if (nums.some(Number.isNaN)) return null;
    [r, g, b] = parts.slice(0, 3).map((p, i) => (p.endsWith('%') ? Math.round(nums[i] * 255) : nums[i]));
    if (parts.length === 4) a = nums[3];
  }
  return `rgba(${r}, ${g}, ${b}, ${+Number(a).toFixed(2)})`;
}

const firstFamily = (v) => String(v).split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();

/**
 * Read every `<root>/ds/<folder>/tokens.json`. Both shapes are accepted: the list `{tokens:[{name,value}]}`
 * `design-system.md` documents, and the grouped `{color:{tokens:[...]}, type:{families:{...}}}` that
 * `/design-system` has written. A colour in another syntax (hsl, oklch, an alias, var()) is listed in
 * `unmeasurable` by token name, never guessed at.
 */
function readTokens(root) {
  const out = { found: false, colors: new Set(), families: new Set(), unmeasurable: [] };
  const dsRoot = path.join(root, 'ds');
  if (!fs.existsSync(dsRoot)) return out;
  const colorToken = (t, strict) => {
    if (!t || typeof t !== 'object') return;
    const n = normalizeColor(t.value);
    if (n) out.colors.add(n);
    else if (strict || (typeof t.value === 'string' && /^(#|hsla?\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|color\(|var\()/i.test(t.value.trim()))) {
      out.unmeasurable.push(String(t.name || t.value));
    }
  };
  for (const e of fs.readdirSync(dsRoot, { withFileTypes: true })) {
    const file = path.join(dsRoot, e.name, 'tokens.json');
    if (!e.isDirectory() || !fs.existsSync(file)) continue;
    let json;
    try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
    if (!json || typeof json !== 'object') continue;
    out.found = true;
    if (Array.isArray(json.tokens)) {
      for (const t of json.tokens) {
        // A family token, not every font token: `font-size` / `font-weight` values ("16px", "600") are not
        // families, and adding them would flag every rendered family off-token.
        if (t && /famil|^fonts?$|typeface/i.test(String(t.type || t.category || ''))) out.families.add(firstFamily(t.value));
        else if (t && /^font/i.test(String(t.type || t.category || ''))) continue;
        else colorToken(t, false);
      }
    }
    if (json.color && Array.isArray(json.color.tokens)) for (const t of json.color.tokens) colorToken(t, true);
    const fam = json.type && json.type.families;
    if (fam && typeof fam === 'object') for (const v of Object.values(fam)) out.families.add(firstFamily(v));
  }
  return out;
}

/** Turn the page's distinct computed values into fidelity measures, against `tokens`. */
function fidelityMeasures(seen, tokens) {
  if (!tokens.found) return [{ check: 'fidelity', verdict: 'not-measured', value: 'no tokens.json in the render root', count: 1, element: null }];
  const out = [];
  const colourBlocked = tokens.unmeasurable.length > 0;
  if (colourBlocked) out.push({ check: 'fidelity', verdict: 'not-measured', detail: 'color', value: tokens.unmeasurable.join(', '), count: tokens.unmeasurable.length, element: null });
  const merged = new Map();
  for (const s of seen) {
    let value = s.value;
    if (s.detail === 'font-family') {
      if (!tokens.families.size || tokens.families.has(value)) continue;
    } else {
      if (colourBlocked || !tokens.colors.size) continue;
      value = normalizeColor(s.value) || s.value;
      if (tokens.colors.has(value)) continue;
    }
    const key = `${s.detail}|${value}`;
    if (merged.has(key)) merged.get(key).count += s.count;
    else merged.set(key, { check: 'fidelity', verdict: 'off-token', detail: s.detail, value, count: s.count, element: s.element });
  }
  return [...merged.values(), ...out];
}

/** Run the measurement in the board's iframe; a failure becomes one not-measured measure, never a throw (D3). */
async function measure(page, { floor, tokens, importFailures }) {
  try {
    const frame = page.frames().find((f) => f !== page.mainFrame());
    if (!frame) throw new Error('the board iframe was not found');
    const args = { floor: {} };
    for (const k of FLOOR_KEYS) if (floor && typeof floor[k] === 'number') args.floor[k] = floor[k];
    const r = await frame.evaluate(`(${MEASURE_SCRIPT})(${JSON.stringify(args)})`);
    const failed = new Map();
    for (const text of importFailures) {
      const value = text.slice(text.indexOf('FAILED to load') + 'FAILED to load'.length).trim().split(/\s+/)[0] || 'unknown';
      failed.set(value, (failed.get(value) || 0) + 1);
    }
    const imports = [...failed].map(([value, count]) => ({ check: 'fidelity', verdict: 'import-failed', value, count, element: null }));
    return [...r.measures, ...fidelityMeasures(r.fidelity, tokens), ...imports];
  } catch (e) {
    return [{ check: 'measurement', verdict: 'not-measured', value: `measurement failed: ${e.message}`, count: 1, element: null }];
  }
}

/** Screenshot one file of the render root; returns the runtime's render errors and the page's measures. */
async function capture(browser, { port, file, viewport, png, offline, floor, tokens }) {
  const page = await browser.newPage({ viewport: { width: viewport[0], height: viewport[1] } });
  const errors = [];
  const importFailures = [];
  let measures = [];
  try {
    if (offline) await routeOffline(page, port);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    // An import that fails to load is logged, not thrown, so it is not a render error (D3).
    page.on('console', (m) => { if (m.text().includes('x-import: FAILED to load')) importFailures.push(m.text()); });
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
    measures = await measure(page, { floor, tokens, importFailures });
    await page.screenshot({ path: png });
  } finally {
    await page.close();
  }
  return { errors, measures };
}

async function launch(projectRoot) {
  const { mod: pw, folder, workspace } = locateTool('playwright', projectRoot, 'run `npm install --save-dev playwright` (or `npm install -g playwright`), then `npx playwright install chromium`', { workspace: true, alias: TOOL_ALIASES.playwright });
  try {
    return await pw.chromium.launch({ timeout: LAUNCH_TIMEOUT_MS });
  } catch (e) {
    if (/Executable doesn't exist|playwright install/i.test(e.message)) {
      // Browsers are per Playwright version. Found in a workspace package, `npx` at the root would
      // fetch some other version, so name the folder whose copy must install them.
      const where = workspace ? ` in ${folder}` : '';
      throw new ToolError(`Playwright's Chromium is not installed: run \`npx playwright install chromium\`${where}`);
    }
    throw e;
  }
}

/**
 * Render a design's boards.
 * @param {object} o
 * @param {string} o.dir      docs/ui/<slug>, holding design-map.json
 * @param {string} [o.runtime]  path to dc-runtime.js (default PINNED_RUNTIME; written into the render root as support.js)
 * @param {string} o.out      directory the PNGs are written to
 * @param {string[]} [o.boards] board ids to render (default: every board not superseded)
 * @param {string} [o.at]     commit to render from instead of the working tree
 * @param {boolean} [o.approved] render each approved/building/shipped board at its approved_commit
 * @param {boolean} [o.offline] see the header (D14)
 * @param {{contrast?: number, target?: number}} [o.floor] contrast ratio and target px that give a measure a verdict
 * @param {string} [o.repo]   repository the git calls run in (default: the working directory)
 * @param {string} [o.projectRoot] where Playwright is resolved from first (default: the working directory)
 * @returns {Promise<{frames: {board, state, viewport, png}[], errors: Object<string, string[]>, measures: {board, state, viewport, check, verdict, value, count, element}[]}>}
 */
async function render(o) {
  const map = o.map ? readMapFile(o.map) : designMap.read(o.dir);
  const repo = path.resolve(o.repo || '.');
  const ids = o.boards && o.boards.length ? o.boards : null;
  const boards = map.boards.filter((b) => (ids ? ids.includes(b.id) : b.status !== 'superseded'));
  if (ids) for (const id of ids) if (!boards.some((b) => b.id === id)) throw new Error(`no board ${id}`);

  const commitOf = (b) => {
    if (o.at) return o.at;
    if (o.approved) return BUILT_STATUSES.includes(b.status) && b.approved_commit ? b.approved_commit : 'HEAD';
    return null; // working tree
  };
  // A board's mirror folder is its own canvas's `dir` (D8), not the first canvas's.
  const canvases = Array.isArray(map.canvases) ? map.canvases : [];
  const canvasDirOf = (b) => ((canvases.find((c) => c.url === b.canvas) || canvases[0] || {}).dir) || 'canvas/project';
  const groups = new Map();
  for (const b of boards) {
    const commit = commitOf(b);
    const canvasDir = canvasDirOf(b);
    const key = `${commit}\0${canvasDir}`;
    if (!groups.has(key)) groups.set(key, { commit, canvasDir, group: [] });
    groups.get(key).group.push(b);
  }

  const dirAbs = path.resolve(o.dir);
  const runtime = path.resolve(o.runtime || PINNED_RUNTIME);
  if (!fs.existsSync(runtime)) throw new Error(`runtime not found: ${runtime}`);
  fs.mkdirSync(o.out, { recursive: true });

  const browser = await launch(o.projectRoot || '.');
  const result = { frames: [], errors: {}, measures: [] };
  const cleanup = [];
  try {
    for (const { commit, canvasDir, group } of groups.values()) {
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
      const tokens = readTokens(root);
      const server = await serve(root);
      try {
        for (const b of group) {
          const targets = [{ state: null, file: b.file, png: `${b.id}.png` }];
          const slugs = stateSlugs(Object.keys(b.states || {}));
          for (const [name, st] of Object.entries(b.states || {})) {
            if (!st || !st.props) continue; // a state without props has nothing to override
            const slug = slugs.get(name); // a file name only; the frame's state stays the real name
            const copy = path.join(path.dirname(b.file), `${b.id}--${slug}.dc.html`);
            fs.writeFileSync(path.join(root, copy), withProps(fs.readFileSync(path.join(root, b.file), 'utf8'), st.props, b.id));
            targets.push({ state: name, file: copy, png: `${b.id}--${slug}.png` });
          }
          for (const t of targets) {
            const png = path.join(o.out, t.png);
            const { errors: errs, measures } = await capture(browser, { port: server.port, file: t.file, viewport: b.viewport, png, offline: o.offline, floor: o.floor, tokens });
            // A frame is a board in one state at one viewport, so each measure names all three (AC-F5.4).
            const viewport = Array.isArray(b.viewport) ? `${b.viewport[0]}x${b.viewport[1]}` : null;
            result.frames.push({ board: b.id, state: t.state, viewport, png });
            // The state comes from the target, never the temp copy's filename.
            for (const m of measures) result.measures.push({ board: b.id, state: t.state, viewport, ...m });
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

/** A scratch map given with `--map`: only `boards` (and optionally `canvases`) are read. */
function readMapFile(file) {
  let map;
  try {
    map = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file} is not a readable JSON map: ${e.message}`);
  }
  if (!map || !Array.isArray(map.boards)) throw new Error(`${file} has no boards array`);
  return map;
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
  if (verb === 'runtime-check') {
    if (!opts.live) throw new Error('--live is required');
    return runtimeCheck(opts.live);
  }
  if (verb !== 'render') throw new Error('usage: design-render.js render --dir D --out O [--runtime R] [--boards a,b] [--at SHA | --approved] [--map F] [--floor-contrast RATIO] [--floor-target PX] | runtime-check --live F');
  for (const f of ['dir', 'out']) if (!opts[f]) throw new Error(`--${f} is required`);
  if (opts.at && opts.approved) throw new Error('--at and --approved are exclusive');
  const floor = {};
  for (const [flag, key] of [['floor-contrast', 'contrast'], ['floor-target', 'target']]) {
    if (opts[flag] === undefined) continue;
    const n = Number(opts[flag]);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--${flag} must be a positive number`);
    floor[key] = n;
    delete opts[flag];
  }
  return render({ ...opts, floor: Object.keys(floor).length ? floor : undefined, boards: opts.boards ? opts.boards.split(',') : null });
}

module.exports = { stateSlug, stateSlugs, copyTree, render, runtimeCheck, readTokens, normalizeColor, PINNED_RUNTIME, PINNED_RUNTIME_SHA256, serve, resolveTool, withProps, parseArgs, ToolError };

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (r) => process.stdout.write(JSON.stringify(r) + '\n'),
    (e) => {
      process.stderr.write('design-render.js: ' + e.message + '\n');
      process.exit(e.exitCode || 1);
    },
  );
}
