'use strict';

/**
 * followup-rank.js -- which class a follow-up row belongs to, and the order rows are filed in.
 *
 * WHY: file-followups used to file rows in ledger (append) order, which buried product items
 * among tooling and paperwork rows (issue #113). This library is the one owner of the classes,
 * their order and the prefix map; contracts and readouts call it rather than restating them.
 *
 * ORDER: product, host, tooling, paperwork, not-verifiable.
 * PRECEDENCE in classOf: a recorded valid `rankClass`, then `status: "not_verifiable"`, then the
 * summary prefix, then `kind: "stale-grounding"` (paperwork), then product. An unknown row ranks
 * product on purpose: it must err toward being read, not buried.
 *
 * CLI: node followup-rank.js open --state-dir <dir> [--state-dir <dir> ...]
 *   prints a JSON array of open rows, merged and ranked, each carrying `class` and `dir`.
 *   Bad usage: usage on stderr, exit 2. A missing ledger yields no rows.
 */

const path = require('path');
const discovered = require('./discovered');

const RANK_CLASSES = discovered.RANK_CLASSES;

const PREFIX_CLASS = [
  [/^\[(flaky-ci|flaky-capped)\]/, 'tooling'],
  [/^\[not-verifiable\]/, 'not-verifiable'],
  [/^\[(review:[^\]]*|below-critical|not-this-feature|below-bar|review-pending|out-of-scope|task-followup)\]/, 'product'],
];

/** Class of one row. Example: classOf({summary:'[flaky-ci] x'}) === 'tooling'. */
function classOf(row) {
  const r = row || {};
  if (RANK_CLASSES.includes(r.rankClass)) return r.rankClass;
  if (r.status === 'not_verifiable') return 'not-verifiable';
  const summary = String(r.summary || '').trim();
  for (const [re, cls] of PREFIX_CLASS) if (re.test(summary)) return cls;
  if (r.kind === 'stale-grounding') return 'paperwork';
  return 'product';
}

/** New array of rows (copies, each with `class`), stably sorted into class order. */
function rank(rows) {
  return (rows || [])
    .map((row, i) => ({ row: { ...row, class: classOf(row) }, i }))
    .sort((a, b) => RANK_CLASSES.indexOf(a.row.class) - RANK_CLASSES.indexOf(b.row.class) || a.i - b.i)
    .map((x) => x.row);
}

/**
 * Open rows of every ledger in `dirs`, each tagged with its `dir`, merged and ranked. A ledger
 * named twice (the same directory, however spelled) is read once, so no row is filed twice.
 */
function openRanked(dirs) {
  const all = [];
  const seen = new Set();
  for (const dir of dirs) {
    const key = path.resolve(dir);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const row of discovered.readAll(dir, { open: true })) all.push({ ...row, dir });
  }
  return rank(all);
}

function main(argv) {
  const usage = 'usage: followup-rank.js open --state-dir <dir> [--state-dir <dir> ...]\n';
  const dirs = [];
  if (argv[0] !== 'open') { process.stderr.write(usage); return 2; }
  for (let i = 1; i < argv.length; i += 2) {
    if (argv[i] !== '--state-dir' || !argv[i + 1]) { process.stderr.write(usage); return 2; }
    dirs.push(argv[i + 1]);
  }
  if (!dirs.length) { process.stderr.write(usage); return 2; }
  process.stdout.write(JSON.stringify(openRanked(dirs)) + '\n');
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { RANK_CLASSES, classOf, rank, openRanked };
