'use strict';

/**
 * core-boards seam test (TRD core-boards-in-designs CBD-T001).
 *
 * Nothing owns the join from the comparison-row generator to the verify loop's decision: the
 * generator (design-criteria.js) writes `DC-` rows with a `Board class`, `must-pass-coverage` reads
 * that column into `criteria` / `evidenceOnly` / `coreCriteria`, and `decideNext` turns those lists
 * plus the judged verdicts into an exit. This test drives the three in a row: the generator CLI on
 * the 12-board fixture, its rows written into a temp success definition beside a minimal TRD, the
 * real `must-pass-coverage` CLI over both files, and the real `decideNext` over the CLI output.
 *
 * What is real: all three. What is stubbed: the judged verdicts, which the test states as `gaps`,
 * `met` and `unverifiable` the way the loop would after a Judge pass.
 *
 * Run with: npx jest packages/core/lib/core-boards-seam.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { decideNext } = require('./functional-verification');

const FV = path.join(__dirname, 'functional-verification.js');
const GENERATOR = path.join(__dirname, 'design-criteria.js');
const FIXTURE = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'design', 'core-boards');

const TRD_TEXT = [
  '# F', '', '## Objectives', '',
  '| ID | Objective | Must pass |', '|----|-----------|-----------|', '| O1 | the design is built | no |', '',
  '## 4. Master Task List', '',
  '| Task ID | Description | Dependencies |', '|---------|-------------|--------------|', '| F-001 | build it | None |', '',
].join('\n');

const cleanEnv = () => {
  const e = { ...process.env };
  delete e.GIT_DIR;
  delete e.GIT_WORK_TREE;
  delete e.GIT_INDEX_FILE;
  return e;
};

const run = (script, args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: cleanEnv() });
  if (r.status !== 0) throw new Error(`${path.basename(script)} ${args.join(' ')}: ${r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
};

// Pipes inside a cell would split the table row.
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');

let dir;
let coverage;
let generated;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-boards-seam-'));
  generated = run(GENERATOR, ['comparison-rows', '--dir', FIXTURE]);
  // Column order is deliberately not the generator's: columns are read by header name.
  const header = ['ID', 'Functional statement', 'Cites', 'Evidence', 'Derivation', 'Tier 1', 'Parts', 'Board class'];
  const lines = [
    '# D', '',
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '----').join('|')}|`,
    ...generated.rows.map((r) =>
      `| ${[r.id, r.statement, r.cites, r.evidence, r.derivation, r.tier1, r.parts, r.boardClass].map(cell).join(' | ')} |`),
    '',
  ];
  fs.writeFileSync(path.join(dir, 'trd.md'), TRD_TEXT);
  fs.writeFileSync(path.join(dir, 'definition.md'), lines.join('\n'));
  coverage = run(FV, ['must-pass-coverage', '--trd', path.join(dir, 'trd.md'), '--definition', path.join(dir, 'definition.md')]);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** decideNext input for a judged state: `notMet` / `notVerifiable` are criterion ids. */
const decide = ({ notMet = [], notVerifiable = [], blocking }) => {
  const all = generated.rows.map((r) => r.id);
  const unproven = new Set([...notMet, ...notVerifiable]);
  return decideNext({
    iteration: 3,
    cap: 3,
    gaps: notMet,
    unbuilt: [],
    previousGaps: null,
    met: all.filter((id) => !unproven.has(id)),
    total: all.length,
    mustPass: coverage.criteria,
    mustPassUncovered: coverage.uncovered || [],
    refreshFailed: false,
    settledEvidenceGaps: [],
    causes: [],
    previousCauses: null,
    awaitingRegression: [],
    evidenceOnly: coverage.evidenceOnly,
    coreMustPass: coverage.coreCriteria,
    blocking,
  });
};

describe('core boards: generator to definition to must-pass-coverage to decideNext', () => {
  const evidenceIds = () => coverage.evidenceOnly;
  const coreIds = () => coverage.criteria;

  it('reads exactly 8 core ids as must-pass and 4 as evidence-only', () => {
    expect(coverage.criteria).toHaveLength(8);
    expect(coverage.evidenceOnly).toHaveLength(4);
    expect(coverage.coreCriteria.slice().sort()).toEqual(coverage.criteria.slice().sort());
    expect(coverage.classIssues || []).toEqual([]);
    expect(generated.counts).toEqual({ core: 8, evidenceOnly: 4 });
  });

  it.each(['all', 'must-pass'])('ends exit-satisfied under %s when only evidence-only frames fail', (blocking) => {
    expect(decide({ notMet: evidenceIds(), blocking }).action).toBe('exit-satisfied');
  });

  it.each(['all', 'must-pass'])('ends exit-stuck under %s when one core frame is not met at the cap', (blocking) => {
    expect(decide({ notMet: [coreIds()[0]], blocking }).action).toBe('exit-stuck');
  });

  it.each(['all', 'must-pass'])('ends exit-must-pass-unproven under %s when that core frame is not verifiable', (blocking) => {
    expect(decide({ notVerifiable: [coreIds()[0]], blocking }).action).toBe('exit-must-pass-unproven');
  });
});
