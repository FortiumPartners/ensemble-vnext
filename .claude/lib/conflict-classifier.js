'use strict';

/**
 * conflict-classifier.js -- grades a set of conflicted paths (each with its conflict hunks) as
 * record, mechanical, behavioural or forbidden, and owns the stop rules and the STUCK text.
 *
 * WHY A MODULE: the step that resolves a merge conflict in place must stop on anything that is
 * not plainly mechanical. Keeping the grading pure (no git, no model) makes every rule
 * unit-testable; the caller gathers paths and hunks, the model only ever sees mechanical ones.
 *
 * CLASSES (set precedence: forbidden, behavioural, mechanical, record):
 *   forbidden    a path under .claude/rules, or any docs/TRD file other than the feature's own
 *                TRD, or one outside the repository. Stops at once, however its hunks look.
 *   record       a file isRecordFile (record-files.js, the single definition) names. Checked
 *                after forbidden and called with the path exactly as given.
 *   mechanical   every hunk is a shared edit, list additions by both sides, or disjoint edits.
 *   behavioural  anything else (overlap, same key, no hunks, deleted, binary, non-regular, too large).
 * A hunk is { base, ours, theirs } (arrays of lines of one region; ours is the PR head, theirs
 * the base branch). A file may carry oldPath, mode, deletedBy, binary and testBrokenByBase (the
 * caller's measurement that a test fails only because of the base's changes).
 *
 * STOP RULES: forbidden stops at once; behavioural stops; a mechanical conflict whose checks
 * still fail after two failed fix attempts following the resolution becomes behavioural.
 *
 * CLI (prints ONE JSON line and exits 0, even on bad usage):
 *   node conflict-classifier.js classify|decide|stuck (--file <path> | --stdin)
 *
 * Example: classify({ files: [{ path: 'src/index.ts', hunks: [{ base: [], ours: ['export * from "./a"'],
 *   theirs: ['export * from "./b"'] }] }] }) -> class 'mechanical'.
 */

const fs = require('fs');
const path = require('path');
const { isRecordFile } = require('./record-files');

const MAX_LINES = 500; // per side; bounds the line diff so a large file cannot hang the merge step
const REGULAR_MODES = ['100644', '100755'];
const USAGE = 'usage: conflict-classifier.js classify|decide|stuck (--file <path> | --stdin)';

// ---------------------------------------------------------------- paths

/** Repo-relative, forward-slash form; null when the path is outside the repository. */
function normalisePath(p) {
  if (typeof p !== 'string' || p === '') return null;
  const s = p.replace(/\\/g, '/');
  if (s.startsWith('/') || /^[a-zA-Z]:/.test(s)) return null;
  let n = path.posix.normalize(s);
  while (n.startsWith('./')) n = n.slice(2);
  if (n === '..' || n.startsWith('../')) return null;
  return n.replace(/\/+$/, '');
}

/**
 * Why a path is forbidden, or null. Prefixes match case-insensitively; featureTrd is compared
 * exactly (case included) after the same normalising.
 * @returns {null|'outside-repo'|'rules-file'|'other-trd'}
 */
function forbiddenReason(p, featureTrd) {
  const n = normalisePath(p);
  if (n === null) return 'outside-repo';
  const low = n.toLowerCase();
  if (low === '.claude/rules' || low.startsWith('.claude/rules/')) return 'rules-file';
  if (low.startsWith('docs/trd/')) {
    const own = typeof featureTrd === 'string' ? normalisePath(featureTrd) : null;
    return own !== null && n === own ? null : 'other-trd';
  }
  return null;
}

/** True when the path may not be written or merged by the model. */
function isForbidden(p, featureTrd) {
  return forbiddenReason(p, featureTrd) !== null;
}

const TEST_PATH = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]*\.py$|_test\.(go|py)$/i;
const LIST_PATH = /(^|\/)(index\.[a-z]+|[^/]*schema[^/]*|[^/]*manifest[^/]*|[^/]*barrel[^/]*|package\.json|requirements[^/]*|[^/]*\.(prisma|txt|lst|list|gitignore))$/i;
const ENTRY_LINE = /^\s*(import\b|export\b|from\b|#include\b|require\(|[-*+]\s|["'\x60][^"'\x60]*["'\x60],?\s*$|[\w."'$@/-]+\s*[:=]\s*\S)/;
const KEY_LINE = /^\s*["']?([\w.@$/-]+)["']?\s*[:=]\s*(.*?),?\s*$/;
const DECL_LINE = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|model|enum|type|interface|def)\s+([A-Za-z_$][\w$]*)/;

// ---------------------------------------------------------------- line diff

/** Edits turning base into side: [{ s, e, lines }] over base indexes [s, e); s === e is an insertion. */
function diffEdits(base, side) {
  const n = base.length;
  const m = side.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = base[i] === side[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const edits = [];
  let cur = null;
  const close = () => {
    if (cur) edits.push(cur);
    cur = null;
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && base[i] === side[j]) {
      close();
      i++;
      j++;
    } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) {
      cur = cur || { s: i, e: i, lines: [] };
      i++;
      cur.e = i;
    } else {
      cur = cur || { s: i, e: i, lines: [] };
      cur.lines.push(side[j++]);
    }
  }
  close();
  return edits;
}

// ---------------------------------------------------------------- hunk grading

const isLines = (a) => Array.isArray(a) && a.every((l) => typeof l === 'string');
const listish = (file, lines) => LIST_PATH.test(file) || lines.filter((l) => l.trim() !== '').every((l) => ENTRY_LINE.test(l));
const snip = (lines) => {
  const t = lines.join(' / ').replace(/\s+/g, ' ').trim();
  return t.length > 80 ? t.slice(0, 77) + '...' : t || '(nothing)';
};

/** Pairs same-range replacements with a shared leading run into a shared edit plus insertions. */
function normaliseEdits(ours, theirs) {
  const o = [];
  const t = [];
  const used = new Set();
  let id = 0;
  for (const a of ours) {
    const b = theirs.find((x) => !used.has(x) && x.s === a.s && x.e === a.e && a.s < a.e);
    let k = 0;
    if (b) while (k < a.lines.length && k < b.lines.length && a.lines[k] === b.lines[k]) k++;
    if (!b || k === 0) {
      o.push({ ...a });
      continue;
    }
    used.add(b);
    const tag = ++id;
    o.push({ s: a.s, e: a.e, lines: a.lines.slice(0, k), shared: tag });
    t.push({ s: b.s, e: b.e, lines: b.lines.slice(0, k), shared: tag });
    if (a.lines.length > k) o.push({ s: a.e, e: a.e, lines: a.lines.slice(k), rem: tag });
    if (b.lines.length > k) t.push({ s: b.e, e: b.e, lines: b.lines.slice(k), rem: tag });
  }
  for (const b of theirs) if (!used.has(b)) t.push({ ...b });
  return { ours: o, theirs: t };
}

const skipPair = (a, b) =>
  (a.shared != null && a.shared === b.shared) || (a.rem != null && a.rem === b.shared) || (a.shared != null && a.shared === b.rem);

/** @returns {{ok: true, how: string} | {ok: false, reason: string, clash: string}} */
function gradeHunk(file, h) {
  const base = h.base;
  const { ours, theirs } = normaliseEdits(diffEdits(base, h.ours), diffEdits(base, h.theirs));
  let how = ours.length || theirs.length ? 'disjoint' : 'identical';
  if (ours.some((e) => e.shared)) how = 'shared-edit';
  const bad = (reason, clash) => ({ ok: false, reason, clash });
  for (const o of ours) {
    for (const t of theirs) {
      if (skipPair(o, t)) continue;
      const oIns = o.s === o.e;
      const tIns = t.s === t.e;
      if (oIns && tIns) {
        if (o.s !== t.s || o.lines.join('\n') === t.lines.join('\n')) continue;
        if (!listish(file, o.lines) || !listish(file, t.lines)) {
          return bad('same-place', 'both sides inserted at one place: ours "' + snip(o.lines) + '" vs theirs "' + snip(t.lines) + '"');
        }
        how = 'list-additions';
      } else if (oIns || tIns) {
        const ins = oIns ? o : t;
        const rep = oIns ? t : o;
        if (rep.s <= ins.s && ins.s <= rep.e) {
          return bad('overlap', 'one side inserted beside lines the other changed: ours "' + snip(o.lines) + '" vs theirs "' + snip(t.lines) + '"');
        }
      } else if (o.s < t.e && t.s < o.e) {
        return bad('overlap', 'both sides changed the same lines: ours "' + snip(o.lines) + '" vs theirs "' + snip(t.lines) + '"');
      }
      // Insertions at different places can still carry one key with two values, or one name twice.
      if (oIns && tIns) {
        const clash = entryClash(o.lines, t.lines);
        if (clash) return clash;
      }
    }
  }
  // Same key / same declaration among every pair of insertions, wherever they sit.
  for (const o of ours.filter((e) => e.s === e.e)) {
    for (const t of theirs.filter((e) => e.s === e.e)) {
      const clash = entryClash(o.lines, t.lines);
      if (clash) return clash;
    }
  }
  return { ok: true, how };
}

/** A key given two values, or a same-named declaration added with different bodies. */
function entryClash(a, b) {
  const keys = (ls) => new Map(ls.map((l) => KEY_LINE.exec(l)).filter(Boolean).map((m) => [m[1], m[2]]));
  const kb = keys(b);
  for (const [k, v] of keys(a)) {
    if (kb.has(k) && kb.get(k) !== v) return { ok: false, reason: 'same-key', clash: 'key "' + k + '" given two values: ours "' + v + '" vs theirs "' + kb.get(k) + '"' };
  }
  const decls = (ls) => ls.map((l) => DECL_LINE.exec(l)).filter(Boolean).map((m) => m[1]);
  const db = decls(b);
  const same = decls(a).find((n) => db.includes(n));
  if (same && a.join('\n') !== b.join('\n')) return { ok: false, reason: 'same-decl', clash: 'both sides added "' + same + '" with different bodies' };
  return null;
}

/** True when both sides replaced overlapping base lines with different text. */
function realClash(h) {
  const o = diffEdits(h.base, h.ours);
  const t = diffEdits(h.base, h.theirs);
  return o.some((a) => a.s < a.e && t.some((b) => b.s < b.e && a.s < b.e && b.s < a.e && a.lines.join('\n') !== b.lines.join('\n')));
}

// ---------------------------------------------------------------- classify

function classifyFile(f, featureTrd) {
  const out = (cls, reason, clash) => ({ path: f.path, class: cls, reason, ...(clash ? { clash } : {}) });
  const fb = forbiddenReason(f.path, featureTrd) || (f.oldPath != null ? forbiddenReason(f.oldPath, featureTrd) : null);
  if (fb) return out('forbidden', fb, fb === 'rules-file' ? 'a rules file may never be merged by the model' : fb === 'other-trd' ? "another feature's TRD may never be merged by the model" : 'path is outside the repository');
  if (isRecordFile(f.path)) return out('record', 'record-file');
  if (f.deletedBy) return out('behavioural', 'deleted', 'deleted by ' + f.deletedBy);
  if (f.binary) return out('behavioural', 'binary', 'binary file');
  if (f.mode != null && !REGULAR_MODES.includes(String(f.mode))) return out('behavioural', 'non-regular', 'file mode ' + f.mode + ' is not a regular file');
  const hunks = f.hunks;
  const flagged = f.testBrokenByBase === true && TEST_PATH.test(f.path);
  if (hunks == null || (Array.isArray(hunks) && hunks.length === 0)) {
    return flagged ? out('mechanical', 'test-broken-by-base') : out('behavioural', 'no-hunks', 'no conflict hunks to grade');
  }
  if (!Array.isArray(hunks) || !hunks.every((h) => h && isLines(h.base) && isLines(h.ours) && isLines(h.theirs))) {
    return out('behavioural', 'malformed', 'hunks are malformed');
  }
  if (hunks.some((h) => h.base.length > MAX_LINES || h.ours.length > MAX_LINES || h.theirs.length > MAX_LINES)) {
    return out('behavioural', 'too-large', 'a hunk is larger than ' + MAX_LINES + ' lines per side');
  }
  if (flagged) {
    const bad = hunks.find(realClash);
    return bad ? out('behavioural', 'overlap', 'both sides changed the same lines differently: ours "' + snip(bad.ours) + '" vs theirs "' + snip(bad.theirs) + '"') : out('mechanical', 'test-broken-by-base');
  }
  let how = 'identical';
  for (const h of hunks) {
    const g = gradeHunk(f.path, h);
    if (!g.ok) return out('behavioural', g.reason, g.clash);
    if (g.how === 'list-additions' || (g.how === 'shared-edit' && how !== 'list-additions') || (g.how === 'disjoint' && how === 'identical')) how = g.how;
  }
  return out('mechanical', how);
}

/**
 * @param {{files: object[], featureTrd?: string}} input
 * @returns {{ok: true, class: string, stop: boolean, stopNow: boolean, files: object[]} | {ok: false, reason: string}}
 */
function classify(input) {
  const files = input && input.files;
  if (!Array.isArray(files) || files.length === 0) return { ok: false, reason: 'files must be a non-empty array' };
  if (!files.every((f) => f && typeof f.path === 'string' && f.path !== '')) return { ok: false, reason: 'every file needs a path' };
  const graded = files.map((f) => classifyFile(f, input.featureTrd));
  const has = (c) => graded.some((g) => g.class === c);
  const cls = has('forbidden') ? 'forbidden' : has('behavioural') ? 'behavioural' : has('mechanical') ? 'mechanical' : 'record';
  return { ok: true, class: cls, stop: cls === 'forbidden' || cls === 'behavioural', stopNow: cls === 'forbidden', files: graded };
}

// ---------------------------------------------------------------- stop rules

/**
 * What to do next. failedAttempts counts failed FIX attempts after the resolution.
 * @returns {{action: string, effectiveClass: string, stop: boolean, escalated: boolean, reason: string}}
 */
function decide({ classification, resolved, checksFailed, failedAttempts } = {}) {
  const cls = classification && classification.ok ? classification.class : null;
  const r = (action, effectiveClass, stop, reason, escalated = false) => ({ action, effectiveClass, stop, escalated, reason });
  if (cls === 'forbidden') return r('stop', 'forbidden', true, 'a forbidden path is in the conflict: stop at once');
  if (cls === 'behavioural') return r('stop', 'behavioural', true, 'a behavioural conflict needs a person');
  if (cls === 'record') return r('record-merge', 'record', false, 'only record files clash: settle them with the record-file path');
  if (cls !== 'mechanical') return r('stop', 'behavioural', true, 'no valid classification to act on');
  if (!resolved) return r('resolve', 'mechanical', false, 'mechanical conflict: resolve it');
  if (!checksFailed) return r('commit', 'mechanical', false, 'resolved and the checks pass: commit');
  if (Number(failedAttempts) >= 2) return r('stop', 'behavioural', true, 'checks still fail after two failed fix attempts: treated as behavioural', true);
  return r('fix', 'mechanical', false, 'checks failed: attempt a fix (' + (Number(failedAttempts) || 0) + ' failed so far)');
}

// ---------------------------------------------------------------- STUCK text

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

/** @returns {{reason: string, next: string, text: string}} */
function stuckText({ classification, command, failedAttempts, lastFailure } = {}) {
  const cmd = command || '/ship-build';
  const files = (classification && classification.files) || [];
  const cls = classification && classification.class;
  let reason;
  let next;
  if (cls === 'mechanical') {
    const names = files.filter((f) => f.class === 'mechanical').map((f) => f.path).join(', ');
    reason = 'checks still fail after ' + (Number(failedAttempts) || 2) + ' failed fix attempts on the resolved conflict in ' + names + ': ' + oneLine(lastFailure || 'check output not given');
    next = 'Fix the failing check by hand on the branch, then re-run ' + cmd + ' --resume.';
  } else {
    const want = cls === 'forbidden' ? ['forbidden'] : ['behavioural'];
    const stopping = files.filter((f) => want.includes(f.class));
    reason = stopping.map((f) => f.path + ' (' + f.reason + ': ' + oneLine(f.clash || f.reason) + ')').join('; ') || 'conflict could not be graded';
    next = cls === 'forbidden'
      ? 'Merge the base into the branch yourself, settling these files by hand (the model never merges them), then re-run ' + cmd + ' --resume.'
      : 'Resolve these conflicts by hand, then re-run ' + cmd + ' --resume.';
  }
  reason = oneLine(reason);
  return { reason, next, text: '═══ COMMAND STUCK: ' + cmd + ' ═══\nReason: ' + reason + '\nNext:   ' + next };
}

// ---------------------------------------------------------------- CLI

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(argv, readStdin = () => fs.readFileSync(0, 'utf8')) {
  const emit = (o) => {
    process.stdout.write(JSON.stringify(o) + '\n');
    return 0;
  };
  const cmd = argv[0];
  if (!['classify', 'decide', 'stuck'].includes(cmd)) return emit({ ok: false, reason: USAGE });
  let input;
  try {
    const file = flag(argv, '--file');
    if (file) input = JSON.parse(fs.readFileSync(file, 'utf8'));
    else if (argv.includes('--stdin')) input = JSON.parse(readStdin());
    else return emit({ ok: false, reason: USAGE });
  } catch (e) {
    return emit({ ok: false, reason: 'cannot read input: ' + e.message });
  }
  if (!input || typeof input !== 'object') return emit({ ok: false, reason: 'input must be a JSON object' });
  if (cmd === 'classify') return emit(classify(input));
  if (cmd === 'decide') return emit({ ok: true, ...decide(input) });
  return emit({ ok: true, ...stuckText(input) });
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { classify, decide, stuckText, isForbidden, main };
