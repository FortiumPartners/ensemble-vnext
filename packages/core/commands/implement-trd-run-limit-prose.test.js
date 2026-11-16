'use strict';

// cap-verification-runs-per-feature VRL-D001: pins the /implement-trd prose that wires the
// per-feature verification run limit (docs/TRD/cap-verification-runs-per-feature.md D3, D5, D7,
// D8, D10, D13). Same standing as the other *-prose tests: the command is a prompt, so the
// wording is the behaviour.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const raw = fs.readFileSync(path.join(REPO, 'packages/core/commands/implement-trd.md'), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const text = flat(raw);

/** Text between two literal markers of the raw file (first occurrence of each). */
function between(start, end) {
  const a = raw.indexOf(start);
  const b = raw.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${start} .. ${end}`);
  return raw.slice(a, b);
}

const section36 = between('### 3.6 Dispatch the background', '### 3.6a');
const section23 = between('### 2.3 State Validation', '### 2.4 State Repair');
const step8 = between('## Step 8: Functional Verification', '### 8.1 Resolve the definition');
const section83 = between('### 8.3 Assemble the remaining args', '### 8.4 Render the outcome');
const section84 = between('### 8.4 Render the outcome', '### 8.5 While the loop');
const next = between('\nNEXT\n', '**Rules this template enforces');
const section90a = between('### 9.0a Artifact link', '### 9.1 The banner');
const CLI = 'node .claude/lib/verification-runs.js';

describe('implement-trd run limit (cap-verification-runs-per-feature)', () => {
  test('both §3.6 assignments spread the existing functional_verification (D3)', () => {
    expect(raw).not.toContain('state.functional_verification = { prd_resolved');
    const spreads = section36.match(/\{ \.\.\.state\.functional_verification, prd_resolved/g) || [];
    expect(spreads).toHaveLength(2);
  });

  test('§3.6 runs the check before the derive dispatch, skipped under --no-verify and --chained, with no resume skip (D7)', () => {
    const s = flat(section36);
    const check = s.indexOf(`${CLI} check --state-dir`);
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(s.indexOf('Dispatch the derive pass in the background'));
    expect(s).toMatch(/--chained/);
    expect(s).toMatch(/a refused run spends no derive agent/i);
  });

  test('§2.3 treats a functional_verification-only implement.json as the stub, not corruption', () => {
    const s = flat(section23);
    expect(s).toMatch(/`functional_verification`/);
    expect(s).toMatch(/no `tasks`/);
    expect(s).toMatch(/stub/);
    expect(s).toMatch(/not (as )?corrupt/i);
  });

  test('Step 8 re-derives the refusal with a check before §8.1 reads prd_resolved (D7)', () => {
    const s = flat(step8);
    expect(s).toContain(`${CLI} check --state-dir`);
    expect(s).toContain('not run: verification run limit reached');
    expect(s).toMatch(/before (§8\.1|reading) .{0,40}prd_resolved/);
    expect(s).toMatch(/not-run-run-limit/);
  });

  test('no --verify --resume skip of the check is written (D4/D7)', () => {
    const checks = [section36, step8].map(flat).join(' ');
    expect(checks).not.toMatch(/skip[^.]{0,80}check[^.]{0,80}--verify --resume/i);
    expect(checks).not.toMatch(/--verify --resume[^.]{0,80}skip[^.]{0,40}the check/i);
  });

  test('§8.3 starts the run immediately before the Workflow call, after off-host-proofs', () => {
    const start = raw.indexOf(`${CLI} start --state-dir`, raw.indexOf('### 8.3 Assemble'));
    expect(start).toBeGreaterThan(-1);
    expect(flat(section83)).toMatch(/--command \/implement-trd --scope full/);
    expect(start).toBeGreaterThan(raw.indexOf('off-host-proofs', raw.indexOf('### 8.3 Assemble')));
    expect(start).toBeLessThan(raw.indexOf('Workflow({ name: "verify-functional"'));
  });

  test('§8.4 finishes the run and branches on rulingDue with the request (D13, D10)', () => {
    const s = flat(section84);
    expect(s).toContain(`${CLI} finish --state-dir`);
    expect(s).toMatch(/--outcome <outcome>/);
    expect(s).toContain('rulingDue');
    expect(s).toContain(`${CLI} request --state-dir`);
    expect(s).toMatch(/copy .{0,40}`runs`/i);
  });

  test('Step 9 carries the refused outcome, its ISSUES line and a NEXT naming the ruling request (D8)', () => {
    const step9 = flat(between('## Step 9', '### 9.0a'));
    expect(step9).toContain('not run: verification run limit reached');
    expect(flat(next)).toMatch(/rulingDue/);
    expect(flat(next)).toMatch(/ruling-request\.md/);
    expect(flat(next)).toMatch(/replaces .{0,80}\/refine-verification/);
    expect(flat(next)).toMatch(/ruling request wins over the setup-failure/i);
    expect(next).toContain('passing `/audit-build` opens the PR when `ensemble.openPullRequest` is `auto`');
  });

  test('§9.0a records and publishes the ruling-request (D10)', () => {
    const s = flat(section90a);
    expect(s).toContain('--kind ruling-request');
    expect(s).toContain('.trd-state/<feature>/ruling-request.md');
    expect(s).toMatch(/artifacts\.js get .{0,60}--kind ruling-request/);
  });

  test('the state schema and prose name runs and ruling', () => {
    const schema = between('"functional_verification": {', '```');
    expect(schema).toContain('"runs"');
    expect(schema).toContain('"ruling"');
    for (const k of ['"need":', '"default":', '"target":']) expect(schema).toContain(k);
    expect(text).toMatch(/On `functional_verification\.runs`/);
  });

  test('the .claude mirror is byte-identical', () => {
    const mirror = path.join(REPO, '.claude/commands/implement-trd.md');
    if (fs.existsSync(mirror)) expect(fs.readFileSync(mirror, 'utf8')).toBe(raw);
  });
});
