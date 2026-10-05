/**
 * audit-docs seam test (docs-as-built DABS-T001).
 *
 * Wiring test in the house style of audit-trd.test.js: does a thing one stage produces reach the
 * stage that consumes it? Here the stages are three modules:
 *
 *   workflows/audit-docs.js  (run through test-harness.js, agents stubbed)
 *     -> its return value, written to a file UNADAPTED
 *   lib/docs-audit-apply.js  (`apply --result`)
 *     -> its applied.json
 *   lib/docs-audit-deliver.js (`prepare`, `commit-batch`, `finalize`)
 *     -> real commits on a review branch in a fixture git repo
 *
 * Only the model is faked. A stubbed "apply" agent edits the doc on disk exactly as a real one
 * would; everything after that is the real libraries against real git.
 *
 * Run with: npx jest packages/core/workflows/audit-docs.seam.test.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readScript, runWorkflow, makeAgentStub, makeParallelStub } = require('./test-harness');

const LIB = path.join(__dirname, '..', 'lib');
const APPLY = path.join(LIB, 'docs-audit-apply.js');
const DELIVER = path.join(LIB, 'docs-audit-deliver.js');
const SOURCE = readScript('audit-docs.js');
const RUN_ID = '2026-10-04-abc1234';

const PRD_BEFORE = '# PRD A\n\n## Feature Requirements\n\n- old claim about `src/gone.js`\n';
const PRD_AFTER =
  '# PRD A\n\n## Feature Requirements\n\n- corrected claim about `src/code.js`\n\n' +
  '## Where this lives in the code\n\n- `src/code.js` — the thing\n';

let repo;
let work;

function git(args) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function put(rel, text) {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
}
function node(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${path.basename(script)} ${args[0]} exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dabs-seam-'));
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 'T']);
  git(['config', 'commit.gpgsign', 'false']);
  put('docs/PRD/a.md', PRD_BEFORE);
  put('docs/obsolete.md', 'Describes a subsystem that no longer exists.\n');
  put('src/code.js', 'module.exports = 1;\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'init']);
  work = path.join(repo, '.trd-state/_docs-audit/work', RUN_ID);
  fs.mkdirSync(work, { recursive: true });
});
afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

/** The assembly shape docs-audit-assemble.js documents (TRD 3.1): files[] plus batches[]. */
function writeAssembly() {
  const files = [
    { path: 'docs/PRD/a.md', class: 'prd', git: 'tracked', disagreement: false, generated: false },
    { path: 'docs/obsolete.md', class: 'loose', git: 'tracked', disagreement: false, generated: false },
  ];
  const batches = [
    { key: 'prd', chunk: 0, docs: ['docs/PRD/a.md'] },
    { key: 'loose:docs', chunk: 0, docs: ['docs/obsolete.md'] },
  ];
  fs.writeFileSync(
    path.join(work, 'assembly.json'),
    JSON.stringify({ runId: RUN_ID, head: git(['rev-parse', 'HEAD']), branch: 'main', mode: 'comprehensive', modeReason: 'flag', files, batches })
  );
  return batches;
}

/** Runs audit-docs.js for one batch; `onWrite` is what the stubbed writing agent does to disk. */
async function runBatch(batch, plan) {
  const agent = makeAgentStub(plan);
  const { result } = await runWorkflow(SOURCE, {
    agent,
    parallel: makeParallelStub(),
    args: {
      runId: RUN_ID, mode: 'comprehensive', repo,
      assemblyPath: path.join(work, 'assembly.json'),
      thresholds: { high: 70, medium: 40 },
      batch: { key: batch.key, chunk: batch.chunk, docs: batch.docs.map((p) => ({ path: p, class: p.includes('/PRD/') ? 'prd' : 'loose', text: true })) },
    },
  });
  return { result, agent };
}

/** The workflow result is written verbatim: no field is renamed, added or dropped. */
function applyBatch(name, result) {
  const resultFile = path.join(work, `batch-${name}.json`);
  const appliedFile = path.join(work, `applied-${name}.json`);
  fs.writeFileSync(resultFile, JSON.stringify(result));
  const applied = node(APPLY, ['apply', '--repo', repo, '--assembly', path.join(work, 'assembly.json'), '--result', resultFile, '--out', appliedFile]);
  return { applied, appliedFile };
}

describe('audit-docs workflow -> docs-audit-apply -> docs-audit-deliver', () => {
  it('carries an edit to a batch commit and a removal proposal to a recovery record, unadapted', async () => {
    const [prdBatch, looseBatch] = writeAssembly();
    node(DELIVER, ['prepare', '--repo', repo, '--run-id', RUN_ID, '--work', work]);
    expect(git(['branch', '--show-current'])).toBe(`docs-audit/${RUN_ID}`);

    // Batch 1: Opus route. The scorer says 90; the writing agent really edits the file.
    const prd = await runBatch(prdBatch, (prompt, opts) => {
      const label = String(opts.label);
      if (label.startsWith('score:')) return { score: 90, reason: 'big window' };
      if (label.startsWith('verify:')) return { findings: [] };
      put('docs/PRD/a.md', PRD_AFTER);
      return { outcome: 'edited', corrections: [{ section: '2', what: 'path fixed' }], cuts: [], mapWritten: true };
    });
    expect(prd.result.records[0]).toMatchObject({ path: 'docs/PRD/a.md', depth: 'opus', outcome: 'edited' });

    const first = applyBatch('prd', prd.result);
    expect(first.applied.edited).toEqual(['docs/PRD/a.md']);
    expect(first.applied.reverted).toEqual([]);
    expect(first.applied.rejected).toEqual([]);
    expect(first.applied.mapDefects).toEqual([]);

    const commit1 = node(DELIVER, ['commit-batch', '--repo', repo, '--applied', first.appliedFile, '--batch', 'prd']);
    expect(commit1).toEqual({ committed: true, message: 'docs-audit(prd): 1 corrected, 0 cut, 0 removed' });

    // Batch 2: a loose doc the Sonnet reviewer proposes for removal. Nothing else names it.
    const loose = await runBatch(looseBatch, () => ({ outcome: 'remove-proposed', removeReason: 'describes a deleted subsystem' }));
    expect(loose.result.records[0]).toMatchObject({ path: 'docs/obsolete.md', outcome: 'remove-proposed', removeReason: 'describes a deleted subsystem' });

    const second = applyBatch('loose-docs', loose.result);
    expect(second.applied.blocked).toEqual([]);
    expect(second.applied.removed).toHaveLength(1);
    expect(second.applied.removed[0]).toMatchObject({ path: 'docs/obsolete.md', reason: 'describes a deleted subsystem' });
    expect(second.applied.removed[0].lastCommit).toBe(git(['rev-list', '--max-parents=0', 'HEAD']));
    expect(fs.existsSync(path.join(repo, 'docs/obsolete.md'))).toBe(false);

    const commit2 = node(DELIVER, ['commit-batch', '--repo', repo, '--applied', second.appliedFile, '--batch', 'loose:docs']);
    expect(commit2.message).toBe('docs-audit(loose:docs): 0 corrected, 0 cut, 1 removed');

    const done = node(DELIVER, ['finalize', '--repo', repo, '--work', work]);
    expect(done.branch).toBe(`docs-audit/${RUN_ID}`);
    expect(git(['branch', '--show-current'])).toBe('main');

    // One commit per batch, then the final one.
    const subjects = git(['log', '--format=%s', `main..${done.branch}`]).split('\n');
    expect(subjects).toEqual([
      `docs-audit: indexes, marker and change set for ${RUN_ID}`,
      'docs-audit(loose:docs): 0 corrected, 0 cut, 1 removed',
      'docs-audit(prd): 1 corrected, 0 cut, 0 removed',
    ]);

    // The change set carries the recovery record the removal produced.
    const changeSet = git(['show', `${done.branch}:${done.changeSet}`]);
    const sha = second.applied.removed[0].lastCommit;
    expect(changeSet).toContain(`- \`docs/obsolete.md\` — describes a deleted subsystem (recover from \`${sha}\`: \`git show ${sha}:docs/obsolete.md\`)`);
    expect(changeSet).toContain('| `docs/PRD/a.md` | prd | 90 | opus | edited |');
    expect(changeSet).toContain('- Corrected — 2: path fixed');

    // The original branch is untouched by the run.
    expect(git(['show', 'main:docs/PRD/a.md'])).toBe(PRD_BEFORE.trim());
    expect(git(['show', `${done.branch}:docs/PRD/a.md`])).toBe(PRD_AFTER.trim());
  });
});
