'use strict';

/**
 * record-ref.js -- writes a feature's run records to a git ref instead of the product branch.
 *
 * WHY: run records (`.trd-state/<slug>/...`) used to be committed on the feature branch, which put
 * them in every PR and made them clash on every merge. A ref `refs/ensemble/records/<slug>` keeps
 * them in the repository (so a push carries them to the remote) without touching the checked-out
 * branch, `HEAD` or the real index. The shared logs live on `refs/ensemble/records/_shared`.
 * The tree layout and the `record.json` field names are a contract with Forge's deployed reader.
 *
 * HOW A WRITE WORKS: hash the selected files into the object store, load them into a throwaway
 * index (`GIT_INDEX_FILE`, in the OS temp dir, removed in a `finally`), `write-tree`, `commit-tree`
 * on the ref's current tip, then move the ref by compare-and-swap (`update-ref --stdin`). A lost
 * swap re-reads the tip and rebuilds, up to 5 attempts. Then push, then either fold the branch-
 * tracked copies out of the index (`rm --cached`, staged, never committed) or, if the ref cannot
 * be written or pushed, commit the records on the branch by pathspec as before.
 * Full design: `docs/TRD/records-ref-library.md` (## Decision).
 *
 * CLI (run from the project root; prints ONE JSON line and exits 0 always, even on refusal):
 *   node record-ref.js write   --state-dir <dir> --command <name> --step <text> [--no-push]
 *   node record-ref.js write   --shared --command <name> --step <text> [--no-push]
 *   node record-ref.js read    --slug <slug> --file <path-in-tree>
 *   node record-ref.js list    [--remote]
 *   node record-ref.js restore --state-dir <dir>
 *
 * `write` outcomes: "ref" (on the ref; `push` is "pushed" | "no-remote" | "skipped"),
 * "fallback" (committed on the branch; `fallbackReason` "push-failed" | "ref-write-failed";
 * `commit` is the branch commit, null when nothing needed committing; `refCommit` is the
 * unpushed ref commit on "push-failed"),
 * "failed" (neither worked), "refused" (nothing attempted).
 *
 * Every git call is `spawnSync` with an argument array (no shell). Nothing here throws to a caller.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REF_PREFIX = 'refs/ensemble/records/';
const TMP_REF_PREFIX = 'refs/ensemble/records-tmp/';
const SHARED_SLUG = '_shared';
const SHARED_FILES = ['_session-log.md', '_sweep/discovered.jsonl']; // relative to .trd-state/
const STATE_ROOT = '.trd-state';
// Forge's own slug rule (forge-vnext records-ref.ts): a ref it would never read is a ref not to write.
const SAFE_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_ATTEMPTS = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 1000;
const NET_TIMEOUT_MS = 60 * 1000;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
const TMP_FILE_RE = /\.tmp\.\d+\.\d+$/; // implement-state.js atomic-save temp files
const CHUNK = 200;
const LCS_MAX_CELLS = 4 * 1024 * 1024; // above this the shared-log base falls back to prefix + suffix

// ---------------------------------------------------------------------------------------------
// git plumbing
// ---------------------------------------------------------------------------------------------

/**
 * Runs git with an argument array. The caller's GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE are
 * scrubbed so the environment cannot redirect the call; `o.env` is applied after the scrub.
 * @returns {{ok: boolean, status: number|null, out: string, raw: string|Buffer, err: string}}
 */
function git(args, o = {}) {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  Object.assign(env, o.env);
  const r = spawnSync('git', args, {
    cwd: o.cwd,
    env,
    encoding: o.buffer ? null : 'utf8',
    input: o.input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: o.timeout,
  });
  const raw = r.stdout || (o.buffer ? Buffer.alloc(0) : '');
  const text = o.buffer ? raw.toString('utf8') : raw;
  const errText = (r.stderr ? r.stderr.toString('utf8') : '') || (r.error && r.error.message) || '';
  return {
    ok: !r.error && r.status === 0,
    status: r.status,
    out: text.trim(),
    raw,
    err: (errText || (r.status ? text : '')).trim(),
  };
}

/** True when `s` is a slug Forge's reader accepts. */
function isSafeSlug(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= 200 && SAFE_SLUG_RE.test(s) && !s.includes('..');
}

const refFor = (slug) => REF_PREFIX + slug;
const refused = (reason, extra) => ({ ok: false, outcome: 'refused', reason, ...extra });
const toPosix = (p) => p.split(path.sep).join('/');
const nonEmpty = (v) => (typeof v === 'string' && v !== '' ? v : null);

function realOr(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function topLevel(cwd) {
  const r = git(['rev-parse', '--show-toplevel'], { cwd });
  return r.ok && r.out ? realOr(r.out) : null;
}

/** The commit a ref points at, or null. */
function resolveRef(top, ref) {
  const r = git(['rev-parse', '--verify', '-q', `${ref}^{commit}`], { cwd: top });
  return r.ok && r.out ? r.out : null;
}

function currentBranch(top) {
  const r = git(['symbolic-ref', '-q', '--short', 'HEAD'], { cwd: top });
  return r.ok && r.out ? r.out : null;
}

/** A blob from a commit's tree as a Buffer, or null when absent. */
function blobAt(top, commit, p) {
  const r = git(['cat-file', 'blob', `${commit}:${p}`], { cwd: top, buffer: true });
  return r.ok ? r.raw : null;
}

/** The `{forge_feature_id, branch}` a commit's record.json carries, or null. */
function identityAt(top, commit) {
  const buf = blobAt(top, commit, 'record.json');
  if (!buf) return null;
  try {
    const j = JSON.parse(buf.toString('utf8'));
    if (!j || typeof j !== 'object') return null;
    return { forge_feature_id: nonEmpty(j.forge_feature_id), branch: nonEmpty(j.branch), slug: nonEmpty(j.slug) };
  } catch {
    return null;
  }
}

/**
 * Forge's match rule (reader D5): the same non-null forge_feature_id, or -- when either id is
 * null -- the same non-null branch. A tip with no readable identity matches nothing.
 */
function sameFeature(tip, mine) {
  if (!tip || !mine) return false;
  const ti = nonEmpty(tip.forge_feature_id);
  const mi = nonEmpty(mine.forge_feature_id);
  if (ti && mi) return ti === mi;
  const tb = nonEmpty(tip.branch);
  const mb = nonEmpty(mine.branch);
  return Boolean(tb && mb && tb === mb);
}

// ---------------------------------------------------------------------------------------------
// record selection
// ---------------------------------------------------------------------------------------------

/**
 * The evidence images a verification report references, as `evidence/...` paths, by the rule
 * Forge's artifact reader uses: a Markdown image (target optionally in `<...>`, percent-decoded
 * once, resolved against the report's folder) plus a bare `evidence/<path>` mention. A path must
 * stay under `evidence/` (no `..`) and end in an image extension.
 * @param {string|null} text the report
 * @param {string} slug the state folder name (allows a `.trd-state/<slug>/` prefix on a mention)
 * @returns {string[]}
 */
function referencedImages(text, slug) {
  const out = new Set();
  if (typeof text !== 'string' || !text) return [];
  const add = (raw) => {
    let t = String(raw).trim();
    if (t.startsWith('<') && t.endsWith('>')) t = t.slice(1, -1).trim();
    try {
      t = decodeURIComponent(t);
    } catch {
      /* keep the undecoded target */
    }
    t = t.replace(/[.,;:]+$/, '');
    if (!t || /[\0\n\r]/.test(t) || t.startsWith('/') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(t)) return;
    if (t.split('/').includes('..')) return;
    const n = path.posix.normalize(t);
    if (!n.startsWith('evidence/') || n.split('/').includes('..') || !IMAGE_EXT_RE.test(n)) return;
    out.add(n);
  };
  for (const m of text.matchAll(/!\[[^\]]*\]\(\s*(<[^>\n]*>|[^)\s]+)/g)) add(m[1]);
  const slugRe = String(slug || '').replace(/[.[\]\\^$*+?(){}|-]/g, '\\$&');
  // The optional `./` or `.trd-state/<slug>/` prefix must itself start at a boundary, so
  // `../evidence/x.png` (outside this folder) is not read as `evidence/x.png`.
  const bare = new RegExp('(?:^|[\\s"\'`(\\[<])(?:\\./|\\.trd-state/' + slugRe + '/)?(evidence/[^\\s"\'`<>()\\[\\]]+)', 'gm');
  for (const m of text.matchAll(bare)) add(m[1]);
  return [...out];
}

function walkFiles(dir, base, out, skipEvidence) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of ents) {
    if (e.isSymbolicLink()) continue; // never followed out of the folder
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      // evidence/ can hold whole fixture repos; only referenced images are looked up (evidenceLookup).
      if (skipEvidence && rel === 'evidence') continue;
      walkFiles(path.join(dir, e.name), rel, out, false);
    }
    else if (e.isFile()) out.push(rel);
  }
}

/**
 * Resolves an `evidence/...` path to a regular file inside the folder (no symlink on the way,
 * at most MAX_FILE_BYTES), or null. A too-large image is listed in `skipped` once.
 */
function evidenceLookup(folderAbs, skipped) {
  const seen = new Map();
  return (rel) => {
    if (!seen.has(rel)) {
      let abs = null;
      const p = path.join(folderAbs, ...rel.split('/'));
      try {
        const st = fs.lstatSync(p);
        if (st.isFile() && fs.realpathSync(p) === p) {
          if (st.size > MAX_FILE_BYTES) skipped.push({ path: rel, reason: 'too-large' });
          else abs = p;
        }
      } catch {
        /* absent */
      }
      seen.set(rel, abs);
    }
    return seen.get(rel);
  };
}

/** Everything in a state folder except what must not ride a ref (see ## Decision). */
function selectFolder(folderAbs) {
  const all = [];
  walkFiles(folderAbs, '', all, true);
  const files = [];
  const skipped = [];
  const evidence = evidenceLookup(folderAbs, skipped); // evidence/<rel> -> abs | null
  for (const rel of all) {
    const name = rel.split('/').pop();
    const abs = path.join(folderAbs, ...rel.split('/'));
    if (rel === 'record.json') continue; // the writer's own is authoritative
    if (name === 'dispatch.jsonl' || name === 'implement.lock' || name === '.DS_Store') continue;
    if (rel.startsWith('findings/') || TMP_FILE_RE.test(name)) continue;
    if (/[\n\r]/.test(rel)) {
      skipped.push({ path: rel, reason: 'unsupported-name' });
      continue;
    }
    let size;
    try {
      size = fs.statSync(abs).size;
    } catch {
      continue;
    }
    if (size > MAX_FILE_BYTES) skipped.push({ path: rel, reason: 'too-large' });
    else if (files.length >= MAX_FILES) skipped.push({ path: rel, reason: 'file-count-cap' });
    else files.push({ rel, abs });
  }
  return { files, evidence, skipped };
}

/** The shared-log files that exist under `.trd-state/`. */
function selectShared(stateRootAbs) {
  const files = [];
  for (const rel of SHARED_FILES) {
    const abs = path.join(stateRootAbs, ...rel.split('/'));
    try {
      const st = fs.lstatSync(abs);
      if (st.isFile() && st.size <= MAX_FILE_BYTES) files.push({ rel, abs });
    } catch {
      /* absent */
    }
  }
  return { files, evidence: () => null, skipped: [] };
}

// ---------------------------------------------------------------------------------------------
// building a commit
// ---------------------------------------------------------------------------------------------

/** Longest common subsequence of two line arrays (classic DP; callers bound the size). */
function lcsLines(a, b) {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const t = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(a[i]);
      i++;
      j++;
    } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
    else j++;
  }
  return out;
}

/**
 * The merge base for two copies of an append-only log: the lines both copies hold, in order
 * (common prefix + LCS of the differing middle + common suffix). A prefix-only base re-adds,
 * on every write, the lines one copy holds that the other gained through an earlier union
 * (two worktrees writing `_shared` would duplicate them each time). Above LCS_MAX_CELLS the
 * middle is left out, which can duplicate but never drops a line.
 */
function logBase(a, b) {
  const la = a.split(/(?<=\n)/);
  const lb = b.split(/(?<=\n)/);
  let pre = 0;
  while (pre < la.length && pre < lb.length && la[pre] === lb[pre]) pre++;
  let suf = 0;
  while (suf < la.length - pre && suf < lb.length - pre && la[la.length - 1 - suf] === lb[lb.length - 1 - suf]) suf++;
  const ma = la.slice(pre, la.length - suf);
  const mb = lb.slice(pre, lb.length - suf);
  const mid = ma.length && mb.length && ma.length * mb.length <= LCS_MAX_CELLS ? lcsLines(ma, mb) : [];
  return [...la.slice(0, pre), ...mid, ...la.slice(la.length - suf)].join('');
}

/** Three-way union of the tip's copy and the writer's copy of an append-only log, or null on error. */
function unionLog(ctx, tipBuf, mineBuf) {
  const dir = fs.mkdtempSync(path.join(ctx.tmp, 'merge-'));
  const f = (n, buf) => {
    const p = path.join(dir, n);
    fs.writeFileSync(p, buf);
    return p;
  };
  const base = logBase(tipBuf.toString('utf8'), mineBuf.toString('utf8'));
  const r = git(['merge-file', '--union', '-p', f('ours', tipBuf), f('base', base), f('theirs', mineBuf)], { cwd: ctx.top, buffer: true });
  return r.ok ? r.raw : null;
}

/** Hashes absolute paths into the object store (one call), filling ctx.hashes. */
function hashFiles(ctx, absPaths) {
  const need = absPaths.filter((p) => !ctx.hashes.has(p));
  if (!need.length) return null;
  // --no-filters: a clean or LFS filter must never turn an image into a pointer file.
  const r = git(['hash-object', '-w', '--no-filters', '--stdin-paths'], { cwd: ctx.top, input: need.join('\n') + '\n' });
  if (!r.ok) return r.err || 'git hash-object failed';
  const shas = r.out.split('\n').filter(Boolean);
  if (shas.length !== need.length) return 'git hash-object returned an unexpected count';
  need.forEach((p, i) => ctx.hashes.set(p, shas[i]));
  return null;
}

function hashBuffer(ctx, buf) {
  const r = git(['hash-object', '-w', '--no-filters', '--stdin'], { cwd: ctx.top, input: buf });
  return r.ok ? r.out : null;
}

/**
 * Builds one commit: the tree, then the commit object. Does not move any ref.
 * @param {object} ctx write context
 * @param {string|null} overlayTip the commit whose tree may be overlaid (and compared for identity)
 * @param {string[]} parents commit parents
 * @returns {{commit, tree, written: {rel, repo}[], missingImages: string[], unchanged: boolean}|{error: string}}
 */
function commitOn(ctx, overlayTip, parents) {
  const idx = path.join(ctx.tmp, `index-${ctx.counter++}`);
  const env = { GIT_INDEX_FILE: idx };
  const run = (args, o = {}) => git(args, { cwd: ctx.top, env, ...o });
  const overlay = Boolean(overlayTip) && (ctx.shared || sameFeature(identityAt(ctx.top, overlayTip), ctx.identity));
  if (overlay) {
    const rt = run(['read-tree', overlayTip]);
    if (!rt.ok) return { error: `git read-tree failed: ${rt.err}` };
  }

  const toWrite = [...ctx.files];
  let keep = [];
  if (!ctx.shared) {
    let reportText = ctx.reportText;
    if (reportText == null && overlay) {
      const b = blobAt(ctx.top, overlayTip, 'verification-report.md');
      reportText = b ? b.toString('utf8') : null;
    }
    keep = referencedImages(reportText, ctx.slug);
    for (const k of keep) {
      const abs = ctx.evidence(k);
      if (abs) toWrite.push({ rel: k, abs });
    }
  }
  const herr = hashFiles(ctx, toWrite.map((f) => f.abs));
  if (herr) return { error: herr };

  const entries = [];
  for (const f of toWrite) {
    let sha = ctx.hashes.get(f.abs);
    if (ctx.shared && overlay) {
      const tipBuf = blobAt(ctx.top, overlayTip, f.rel);
      if (tipBuf) {
        const mine = fs.readFileSync(f.abs);
        if (!tipBuf.equals(mine)) {
          const merged = unionLog(ctx, tipBuf, mine);
          sha = merged && hashBuffer(ctx, merged);
          if (!sha) return { error: `could not merge ${f.rel} with the ref's copy` };
        }
      }
    }
    entries.push(`100644 ${sha}\t${f.rel}\0`);
  }
  if (!ctx.shared) {
    const sha = hashBuffer(ctx, JSON.stringify(ctx.identity, null, 2) + '\n');
    if (!sha) return { error: 'could not store record.json' };
    entries.push(`100644 ${sha}\trecord.json\0`);
  }
  const ui = run(['update-index', '--add', '-z', '--index-info'], { input: entries.join('') });
  if (!ui.ok) return { error: `git update-index failed: ${ui.err}` };

  let missingImages = [];
  if (!ctx.shared) {
    // evidence/ in the tree is exactly the images the report references.
    const keepSet = new Set(keep);
    const have = run(['ls-files', '-z', '--', 'evidence/']).raw.split('\0').filter(Boolean);
    const drop = have.filter((p) => !keepSet.has(p));
    if (drop.length) {
      const rm = run(['update-index', '--force-remove', '-z', '--stdin'], { input: drop.join('\0') + '\0' });
      if (!rm.ok) return { error: `git update-index failed: ${rm.err}` };
    }
    const haveSet = new Set(have);
    missingImages = keep.filter((k) => !haveSet.has(k) && !ctx.evidence(k));
  }

  const wt = run(['write-tree']);
  if (!wt.ok || !wt.out) return { error: `git write-tree failed: ${wt.err}` };
  const tree = wt.out;
  const written = toWrite.map((f) => ({ rel: f.rel, repo: ctx.repoPrefix + f.rel }));

  if (overlayTip && parents.length === 1 && parents[0] === overlayTip) {
    const tt = git(['rev-parse', `${overlayTip}^{tree}`], { cwd: ctx.top });
    if (tt.ok && tt.out === tree) return { commit: overlayTip, tree, written, missingImages, unchanged: true };
  }
  const args = ['commit-tree', tree];
  for (const p of parents) args.push('-p', p);
  args.push('-m', ctx.message);
  const ct = git(args, { cwd: ctx.top });
  if (!ct.ok || !ct.out) return { error: `git commit-tree failed: ${ct.err}` };
  return { commit: ct.out, tree, written, missingImages, unchanged: false };
}

/** Compare-and-swap: creating is itself a swap (no all-zeros value to size to the hash). */
function swapRef(top, ref, next, old) {
  const input = old ? `update ${ref} ${next} ${old}\n` : `create ${ref} ${next}\n`;
  return git(['update-ref', '--stdin'], { cwd: top, input });
}

// ---------------------------------------------------------------------------------------------
// push, fold, fallback
// ---------------------------------------------------------------------------------------------

function pushOnce(top, ref) {
  if (!git(['remote', 'get-url', 'origin'], { cwd: top }).ok) return { state: 'no-remote' };
  const r = git(['push', '--porcelain', 'origin', `${ref}:${ref}`], {
    cwd: top,
    env: { GIT_TERMINAL_PROMPT: '0' },
    timeout: NET_TIMEOUT_MS,
  });
  if (r.ok) return { state: 'pushed' };
  // "[rejected]" is a non-fast-forward; "[remote rejected]" (a hook) is not.
  const nff = /\[rejected\]/.test(r.raw + '\n' + r.err);
  return { state: nff ? 'non-fast-forward' : 'failed', err: r.err };
}

/** One reconcile: rebuild this write on the remote tip, swap the local ref, push once more. */
function reconcile(ctx, ref, localTip) {
  const tmpRef = TMP_REF_PREFIX + ctx.slug;
  try {
    const f = git(['fetch', '--no-tags', '--no-write-fetch-head', 'origin', `+${ref}:${tmpRef}`], {
      cwd: ctx.top,
      env: { GIT_TERMINAL_PROMPT: '0' },
      timeout: NET_TIMEOUT_MS,
    });
    if (!f.ok) return { state: 'failed', err: f.err };
    const remoteTip = resolveRef(ctx.top, tmpRef);
    if (!remoteTip) return { state: 'failed', err: 'remote ref did not arrive' };
    const parents = remoteTip === localTip ? [remoteTip] : [remoteTip, localTip];
    const b = commitOn(ctx, remoteTip, parents);
    if (b.error) return { state: 'failed', err: b.error };
    if (!swapRef(ctx.top, ref, b.commit, localTip).ok) return { state: 'failed', err: 'local ref moved during reconcile' };
    const p = pushOnce(ctx.top, ref);
    return { ...p, commit: b.commit, written: b.written, missingImages: b.missingImages };
  } finally {
    git(['update-ref', '-d', tmpRef], { cwd: ctx.top });
  }
}

const LITERAL = { GIT_LITERAL_PATHSPECS: '1' };
const pathList = (paths) => paths.join('\0') + '\0';

/** Untracks (staged only, never committed) exactly those of `repoPaths` that are tracked. */
function fold(top, repoPaths) {
  const tracked = new Set();
  for (let i = 0; i < repoPaths.length; i += CHUNK) {
    const r = git(['ls-files', '-z', '--', ...repoPaths.slice(i, i + CHUNK)], { cwd: top, env: LITERAL });
    if (r.ok) r.raw.split('\0').filter(Boolean).forEach((p) => tracked.add(p));
  }
  const list = repoPaths.filter((p) => tracked.has(p));
  if (!list.length) return { folded: [] };
  // -f: a staged change that differs from HEAD is exactly what the ref now holds; do not refuse.
  const rm = git(['rm', '--cached', '-q', '-f', '--pathspec-from-file=-', '--pathspec-file-nul'], {
    cwd: top,
    env: LITERAL,
    input: pathList(list),
  });
  return rm.ok ? { folded: list } : { folded: [], foldError: rm.err };
}

/** Commits the records on the branch by pathspec; the user's other staged changes are untouched. */
function branchCommit(top, repoPaths, message) {
  if (!repoPaths.length) return { ok: true, committed: false };
  const add = git(['add', '-f', '--pathspec-from-file=-', '--pathspec-file-nul'], { cwd: top, env: LITERAL, input: pathList(repoPaths) });
  if (!add.ok) return { ok: false, err: add.err };
  const staged = new Set(git(['diff', '--cached', '--name-only', '-z'], { cwd: top }).raw.split('\0').filter(Boolean));
  const mine = repoPaths.filter((p) => staged.has(p));
  if (!mine.length) return { ok: true, committed: false };
  // -o (--only) with a pathspec commits just these paths.
  const c = git(['commit', '-q', '-o', '-m', message, '--pathspec-from-file=-', '--pathspec-file-nul'], {
    cwd: top,
    env: LITERAL,
    input: pathList(mine),
  });
  if (!c.ok) return { ok: false, err: c.err };
  const head = git(['rev-parse', 'HEAD'], { cwd: top });
  return { ok: true, committed: true, paths: mine, commit: head.ok && head.out ? head.out : null };
}

// ---------------------------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------------------------

const cleanText = (s) => String(s == null ? '' : s).replace(/[\0-\x1f\x7f]+/g, ' ').trim().slice(0, 200);

/**
 * Writes a state folder (or the shared logs) to its ref. Never throws.
 * @param {{stateDir?: string, shared?: boolean, command: string, step: string, push?: boolean, cwd?: string}} opts
 */
function write(opts = {}) {
  try {
    return writeInner(opts);
  } catch (e) {
    return { ok: false, outcome: 'failed', reason: `unexpected error: ${e && e.message}` };
  }
}

function writeInner(opts) {
  const cwd = opts.cwd || process.cwd();
  const top = topLevel(cwd);
  if (!top) return refused('not a git work tree');
  const command = cleanText(opts.command);
  const step = cleanText(opts.step);
  if (!command || !step) return refused('write needs --command and --step');

  const shared = Boolean(opts.shared);
  let slug;
  let folderAbs;
  if (shared) {
    slug = SHARED_SLUG;
    folderAbs = path.join(top, STATE_ROOT);
  } else {
    if (!opts.stateDir) return refused('write needs --state-dir or --shared');
    try {
      folderAbs = fs.realpathSync(path.resolve(cwd, opts.stateDir));
    } catch {
      return refused(`state folder not found: ${opts.stateDir}`);
    }
    const rel = path.relative(top, folderAbs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return refused('state folder is outside the repository');
    // Only `.trd-state/<slug>`: anything else would put product files on a ref, and the fold
    // would then untrack them from the branch.
    if (path.posix.dirname(toPosix(rel)) !== STATE_ROOT) return refused(`state folder must be ${STATE_ROOT}/<slug>`);
    slug = path.basename(folderAbs);
    if (!isSafeSlug(slug)) return refused(`"${slug}" is not a slug Forge reads (letters, digits, . _ -; starts alphanumeric; no "..")`);
  }
  const ref = refFor(slug);
  if (!git(['check-ref-format', ref], { cwd: top }).ok) return refused(`"${ref}" is not a valid ref name`);
  if (!fs.existsSync(folderAbs) || !fs.statSync(folderAbs).isDirectory()) return refused('state folder is not a directory');

  const sel = shared ? selectShared(folderAbs) : selectFolder(folderAbs);
  if (shared && !sel.files.length) return refused('no shared log files to write');

  let reportText = null;
  if (!shared) {
    try {
      reportText = fs.readFileSync(path.join(folderAbs, 'verification-report.md'), 'utf8');
    } catch {
      reportText = null;
    }
  }
  const repoPrefix = toPosix(path.relative(top, folderAbs)) + '/';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'record-ref-'));
  const ctx = {
    top,
    tmp,
    slug,
    shared,
    repoPrefix,
    files: sel.files,
    evidence: sel.evidence,
    reportText,
    hashes: new Map(),
    counter: 0,
    identity: shared ? null : { forge_feature_id: nonEmpty(process.env.FORGE_FEATURE_ID), branch: currentBranch(top), slug },
    message: `records(${slug}): ${command} - ${step}`,
  };
  // Paths the fallback commits: every selected file plus the report's images that exist here.
  const fallbackPaths = [
    ...sel.files.map((f) => repoPrefix + f.rel),
    ...referencedImages(reportText, slug).filter((k) => sel.evidence(k)).map((k) => repoPrefix + k),
  ];

  try {
    let built = null;
    let refError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const tip = resolveRef(top, ref);
      const b = commitOn(ctx, tip, tip ? [tip] : []);
      if (b.error) {
        refError = b.error;
        break; // not a lost swap: retrying cannot help
      }
      if (b.unchanged) {
        built = b;
        break;
      }
      const s = swapRef(top, ref, b.commit, tip);
      if (s.ok) {
        built = b;
        break;
      }
      refError = `ref moved under the writer (${attempt} of ${MAX_ATTEMPTS}): ${s.err}`;
    }

    const base = { slug, ref, skipped: sel.skipped };
    // On a fallback, `commit` is the BRANCH commit that now holds the records (null when nothing
    // was staged for them); a ref commit that moved but could not be pushed is `refCommit`.
    const fallback = (reason, detail, extra = {}) => {
      const fb = branchCommit(top, fallbackPaths, ctx.message);
      if (fb.ok) {
        return { ok: true, outcome: 'fallback', fallbackReason: reason, detail, committed: fb.committed, commit: fb.commit || null, ...base, ...extra };
      }
      return { ok: false, outcome: 'failed', fallbackReason: reason, refError: detail, fallbackError: fb.err, ...base, ...extra };
    };

    if (!built) return fallback('ref-write-failed', refError);

    let commit = built.commit;
    let written = built.written;
    let missingImages = built.missingImages;
    const common = () => ({ commit, files: written.length, missingImages, ...base });
    if (opts.push === false) return { ok: true, outcome: 'ref', push: 'skipped', folded: [], ...common() };

    let p = pushOnce(top, ref);
    if (p.state === 'non-fast-forward') {
      const rc = reconcile(ctx, ref, built.commit);
      if (rc.commit) {
        commit = rc.commit;
        written = rc.written;
        missingImages = rc.missingImages;
      }
      p = rc;
    }
    if (p.state === 'pushed' || p.state === 'no-remote') {
      const f = fold(top, written.map((w) => w.repo));
      return { ok: true, outcome: 'ref', push: p.state, folded: f.folded, ...(f.foldError ? { foldError: f.foldError } : {}), ...common() };
    }
    return fallback('push-failed', p.err || 'push refused', { refCommit: commit, push: 'failed' });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// read, list, restore
// ---------------------------------------------------------------------------------------------

/** Makes the local ref exist, fetching it from origin only when it is missing. */
function ensureLocal(top, ref) {
  if (resolveRef(top, ref)) return true;
  const f = git(['fetch', '--no-tags', '--no-write-fetch-head', 'origin', `+${ref}:${ref}`], {
    cwd: top,
    env: { GIT_TERMINAL_PROMPT: '0' },
    timeout: NET_TIMEOUT_MS,
  });
  return f.ok && Boolean(resolveRef(top, ref));
}

function safeTreePath(p) {
  return typeof p === 'string' && p !== '' && !p.startsWith('/') && !/[\0\n\r]/.test(p) && !p.split('/').some((s) => s === '..' || s === '.git' || s === '');
}

/**
 * One file at a ref (local, else fetched). Returns the ref's record.json identity beside it so a
 * caller can apply the same-feature rule before trusting the content.
 */
function read({ slug, file, cwd } = {}) {
  try {
    const top = topLevel(cwd || process.cwd());
    if (!top) return refused('not a git work tree');
    if (!isSafeSlug(slug) && slug !== SHARED_SLUG) return refused('read needs a valid --slug');
    if (!safeTreePath(file)) return refused('read needs a --file path inside the tree');
    const ref = refFor(slug);
    if (!ensureLocal(top, ref)) return { ok: false, outcome: 'no-record', ref };
    const commit = resolveRef(top, ref);
    const buf = blobAt(top, commit, file);
    if (!buf) return { ok: false, outcome: 'no-file', ref, commit, identity: identityAt(top, commit) };
    const binary = buf.includes(0);
    return {
      ok: true,
      outcome: 'read',
      ref,
      commit,
      identity: identityAt(top, commit),
      encoding: binary ? 'base64' : 'utf8',
      content: buf.toString(binary ? 'base64' : 'utf8'),
    };
  } catch (e) {
    return { ok: false, outcome: 'failed', reason: e && e.message };
  }
}

/** Record refs, local and (with `remote`) on origin. */
function list({ remote, cwd } = {}) {
  try {
    const top = topLevel(cwd || process.cwd());
    if (!top) return refused('not a git work tree');
    const by = new Map();
    const note = (ref, commit, where) => {
      if (!ref.startsWith(REF_PREFIX)) return;
      const slug = ref.slice(REF_PREFIX.length);
      const e = by.get(slug) || { slug, ref };
      e[where] = commit;
      by.set(slug, e);
    };
    const l = git(['for-each-ref', '--format=%(objectname) %(refname)', REF_PREFIX], { cwd: top });
    for (const line of l.out.split('\n').filter(Boolean)) {
      const [sha, name] = line.split(' ');
      note(name, sha, 'local');
    }
    let remoteError;
    if (remote) {
      const r = git(['ls-remote', 'origin', `${REF_PREFIX}*`], { cwd: top, env: { GIT_TERMINAL_PROMPT: '0' }, timeout: NET_TIMEOUT_MS });
      if (r.ok) {
        for (const line of r.out.split('\n').filter(Boolean)) {
          const [sha, name] = line.split('\t');
          note(name, sha, 'remote');
        }
      } else remoteError = r.err || 'ls-remote failed';
    }
    return { ok: true, outcome: 'list', refs: [...by.values()].sort((a, b) => (a.slug < b.slug ? -1 : 1)), ...(remoteError ? { remoteError } : {}) };
  } catch (e) {
    return { ok: false, outcome: 'failed', reason: e && e.message };
  }
}

/**
 * Materialises a missing state folder from its ref (every file except record.json). Refuses a
 * folder that already holds files; never overwrites.
 */
function restore({ stateDir, cwd } = {}) {
  try {
    const wd = cwd || process.cwd();
    const top = topLevel(wd);
    if (!top) return refused('not a git work tree');
    if (!stateDir) return refused('restore needs --state-dir');
    // `top` is a realpath, so resolve `dest` the same way (a symlinked cwd such as macOS /tmp
    // must not read as "outside the repository"); the folder itself may not exist yet.
    let dest = path.resolve(realOr(wd), stateDir);
    dest = path.join(realOr(path.dirname(dest)), path.basename(dest));
    const rel = path.relative(top, dest);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return refused('state folder is outside the repository');
    if (path.posix.dirname(toPosix(rel)) !== STATE_ROOT) return refused(`state folder must be ${STATE_ROOT}/<slug>`);
    if (isSymlink(dest)) return refused('state folder is a symlink; restore never writes through one');
    const slug = path.basename(dest);
    if (!isSafeSlug(slug)) return refused(`"${slug}" is not a slug Forge reads`);
    if (fs.existsSync(dest) && fs.readdirSync(dest).length) return refused('state folder already holds files; restore never overwrites');
    const ref = refFor(slug);
    if (!ensureLocal(top, ref)) return { ok: false, outcome: 'no-record', ref };
    const commit = resolveRef(top, ref);
    const ls = git(['ls-tree', '-r', '-z', '--full-tree', commit], { cwd: top });
    if (!ls.ok) return { ok: false, outcome: 'failed', reason: ls.err };
    let count = 0;
    for (const ent of ls.raw.split('\0').filter(Boolean)) {
      const tab = ent.indexOf('\t');
      const [mode, type, sha] = ent.slice(0, tab).split(' ');
      const p = ent.slice(tab + 1);
      if (type !== 'blob' || mode === '120000' || p === 'record.json' || !safeTreePath(p)) continue;
      const target = path.join(dest, ...p.split('/'));
      if (path.relative(dest, target).startsWith('..')) continue;
      const blob = git(['cat-file', 'blob', sha], { cwd: top, buffer: true });
      if (!blob.ok) return { ok: false, outcome: 'failed', reason: `could not read ${p}: ${blob.err}`, files: count };
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, blob.raw);
      count++;
    }
    return { ok: true, outcome: 'restored', ref, commit, identity: identityAt(top, commit), files: count };
  } catch (e) {
    return { ok: false, outcome: 'failed', reason: e && e.message };
  }
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'shared' || key === 'no-push' || key === 'remote') o[key] = true;
    else o[key] = argv[++i];
  }
  return o;
}

function main(argv) {
  const cmd = argv[0];
  const a = parseArgs(argv.slice(1));
  let result;
  if (cmd === 'write') result = write({ stateDir: a['state-dir'], shared: a.shared, command: a.command, step: a.step, push: !a['no-push'] });
  else if (cmd === 'read') result = read({ slug: a.slug, file: a.file });
  else if (cmd === 'list') result = list({ remote: a.remote });
  else if (cmd === 'restore') result = restore({ stateDir: a['state-dir'] });
  else result = refused('usage: record-ref.js write|read|list|restore ...');
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = 0;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { write, read, list, restore, isSafeSlug, referencedImages, sameFeature, refFor, SHARED_SLUG, REF_PREFIX };
