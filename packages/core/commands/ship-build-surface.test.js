'use strict';

// SHIP-B013: pins the prose of /ship-build (TRD ship-build 3.7). The command is a prompt read
// by a model, so these are documentation-level assertions (the standing of
// verify-command-surface.test.js): they prove the command TELLS the model what to do, not
// that a given run obeyed. The behaviour that is code -- the sequencer, custody -- has its own
// tests, and ship-build.seam.test.js proves the two compose.
//
// Run with: npx jest packages/core/commands/ship-build-surface.test.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const CORE = path.join(REPO, 'packages/core/commands/ship-build.md');
const MIRROR = path.join(REPO, '.claude/commands/ship-build.md');
const LINT = path.join(REPO, 'packages/core/scripts/lint-command-structure.js');

const raw = fs.readFileSync(CORE, 'utf8');
// Prose wraps at ~90 columns; flatten so a rewrap never fails this suite.
const text = raw.replace(/\s+/g, ' ');
const section = (from, to) => {
  const a = raw.indexOf(from);
  const b = to ? raw.indexOf(to, a + from.length) : raw.length;
  expect(a).toBeGreaterThanOrEqual(0);
  return raw.slice(a, b).replace(/\s+/g, ' ');
};

describe('mirror and structure', () => {
  test('the .claude/ copy is byte-identical', () => {
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(raw);
  });

  test('frontmatter is at byte 0 and carries the argument hint', () => {
    expect(raw.startsWith('---\nname: ship-build\n')).toBe(true);
    expect(raw).toMatch(/^argument-hint: "\[trd-path\] \[--resume\]"$/m);
  });

  test('passes lint-command-structure', () => {
    expect(fs.existsSync(LINT)).toBe(true);
    const r = spawnSync(process.execPath, [LINT, CORE], { encoding: 'utf8' });
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
    // The linter reports its summary on stderr ("structure ok: 1 file(s)"); stdout stays empty.
    // Pinning the exact success line means a crash or a silent no-op cannot pass.
    expect(r.stdout).toBe('');
    expect(r.stderr.trim()).toBe('structure ok: 1 file(s)');
    expect(r.stdout + r.stderr).not.toMatch(/ship-build\S*:\d+\s+\[/);
  });

  test('code fences are balanced', () => {
    expect((raw.match(/^\s*```/gm) || []).length % 2).toBe(0);
  });
});

describe('Step 1: resolution (D7)', () => {
  const s = section('## Step 1', '## Step 2');

  test('runs in the documented order', () => {
    const order = ['An explicit TRD path', 'The branch-derived slug', 'Exactly one state directory', 'Sweep work', 'Nothing resolves'];
    const at = order.map((o) => s.indexOf(o));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test('step 3 says exactly one, skips _ dirs and task dirs, and keeps closed features', () => {
    expect(s).toContain('implement.json` `branch`, or whose `shipped.json` `work.branch`');
    expect(s).toContain('Skip any directory whose name starts with `_`');
    expect(s).toContain('"kind": "task"');
    expect(s).toContain('more than one match is not a hit');
    expect(s).toContain('does **not** skip a feature that has a `closed.json`');
  });

  test('sweep work gets an id, a state dir and no TRD', () => {
    expect(s).toContain('sweep-<YYYYMMDD-HHMMSS>');
    expect(s).toContain('.trd-state/ship-<id>/');
  });

  test('an unresolved run is STUCK and lists candidates', () => {
    expect(s).toContain('COMMAND STUCK: /ship-build');
    expect(s).toContain('candidates');
  });
});

describe('Step 2: the gate (D8, D37)', () => {
  const s = section('## Step 2', '## Step 3');

  test('reads the Source PRD line; no such line is a full feature', () => {
    expect(s).toContain('`**Source PRD**:`');
    expect(s).toContain('no such line means a full feature');
  });

  test('a full feature with no closed.json is STUCK naming /audit-build', () => {
    expect(s).toContain('no `.trd-state/<feature>/closed.json`');
    expect(s).toContain('COMMAND STUCK: /ship-build');
    expect(s).toContain('/audit-build docs/TRD/<feature>.md');
  });
});

describe('Steps 3 and 4: the sequencer', () => {
  test('start passes the push-only fallback and every work flag', () => {
    expect(text).toContain('ship-sequencer.js start --state-dir <state-dir>');
    expect(text).toContain('--fallback "1. push"');
    // ship.md is owner-governed: the policy is the copy owner-rules.js resolves (issue #90).
    expect(text).toContain('--policy "$(node .claude/lib/owner-rules.js path ship.md)"');
    expect(text).not.toContain('--policy .claude/rules/ship.md');
    expect(text).toContain('--kind');
    expect(text).toContain('--branch');
  });

  test('start errors are STUCK naming the lines and /ship-setup; done completes with nothing run', () => {
    expect(text).toContain('name the lines of `ship.md` that do not parse');
    expect(text).toContain('Next `/ship-setup`');
    expect(text).toContain('`status: "done"`');
    expect(text).toContain('nothing run');
  });

  test('the loop uses next, reads the contract path next names, and records', () => {
    const s = section('## Step 4', '## Step 5');
    expect(s).toContain('ship-sequencer.js next --state-dir <state-dir>');
    expect(s).toContain('step.contract');
    expect(s).toContain('ship-sequencer.js record --state-dir <state-dir> --step <step.id>');
    expect(s).toContain('{action: "wait"}');
    expect(s).toContain('{action: "stop", reason}');
    expect(s).toContain('{action: "done", shipped}');
  });

  test('status is read for the readout', () => {
    expect(text).toContain('ship-sequencer.js status --state-dir <state-dir>');
  });

  test('never writes shipped.json or custody.json, never edits code, never asks', () => {
    const s = section('**Never** write', '## Step 5');
    expect(s).toContain('write `shipped.json` or `custody.json`');
    expect(s).toContain('never edit code yourself');
    expect(s).toContain('never call `AskUserQuestion`');
  });
});

describe('Step 5: the record', () => {
  const s = section('## Step 5', '## Step 6');

  test('writes the records ref and commits no state directory', () => {
    expect(s).toContain('record-ref.js write --state-dir <state-dir>');
    expect(s).not.toMatch(/git\s+(add|commit)\b.*<state-dir>/);
  });

  test('Step 4 writes the ref with --no-fallback after each step result', () => {
    const l = section('## Step 4', '## Step 5');
    expect(l).toContain('record-ref.js write --state-dir <state-dir>');
    expect(l).toContain('--no-fallback');
  });

  test('"merged" is read from the PR list, not from a merge step', () => {
    expect(s).toContain('gh pr list --head <branch> --state merged');
    expect(s).toContain('not from whether a step called `merge` ran');
    expect(s).toContain('no records write');
  });

  test('Step 3 takes the resume branch from implement.json; Step 6 reads custodyPath', () => {
    expect(text).toContain('--branch <work branch>');
    expect(text).toMatch(/`branch` in `\.trd-state\/<feature>\/implement\.json`[^]*falling back to\s+the current branch/);
    expect(text).toMatch(/kind, id and branch all match/);
    expect(text).toContain("`status`'s `custodyPath`");
  });

  test('the record is pushed at a wait whose data says remoteResume', () => {
    expect(s).toContain('At a `wait` whose recorded `data` carries `remoteResume: true`');
    expect(s).toContain('remoteResume: true');
    expect(s).toContain('claims no trigger');
  });
});

describe('Step 6: readout and banner', () => {
  const s = section('## Step 6', '## Completion signal');

  test('four sections in order', () => {
    const at = ['**STATE**', '**DECISIONS**', '**ISSUES**', '**NEXT**'].map((x) => s.indexOf(x));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test('ISSUES comes from data.issues, unauthorized steps and git status', () => {
    expect(s).toContain('`data.issues`');
    expect(s).toContain('not authorized');
    expect(s).toContain('git status --porcelain');
  });

  test('no policy: NEXT names /ship-setup and an open PR or says the branch is ready for one', () => {
    expect(s).toContain('Policy `none`');
    expect(s).toContain('/ship-setup');
    expect(s).toContain('gh pr list --head <branch> --state open');
    expect(s).toContain('ready for one');
  });

  test('a wait ends COMPLETE with --resume in NEXT', () => {
    expect(s).toContain('parked at a `wait`');
    expect(s).toContain('both end `COMMAND COMPLETE`');
    expect(s).toContain('/ship-build --resume');
  });

  test('the banner is the last line of the turn', () => {
    expect(s).toContain('last line of the turn');
    expect(s).toContain('═══ COMMAND COMPLETE: /ship-build ═══');
    expect(s).toContain('═══ COMMAND STUCK: /ship-build ═══');
  });
});

describe('completion signal and rules', () => {
  test('calls notify-complete.sh with the work named, then PushNotification', () => {
    expect(text).toContain('.claude/hooks/notify-complete.sh "ship-build"');
    expect(text).toContain('names the work itself');
    expect(text).toContain('`current.json`');
    expect(text).toContain('PushNotification');
  });

  test('never names the external orchestrator', () => {
    expect(raw.toLowerCase()).not.toContain('forge');
  });

  test('AskUserQuestion appears only as a prohibition', () => {
    const uses = raw.match(/[^.]*AskUserQuestion[^.]*\./g) || [];
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/never|not/i);
  });

  test('does not chain: nothing runs /audit-build or any later command', () => {
    expect(text).toContain('nothing here chains after it');
    expect(text).toContain('Names the next command; never runs it');
  });
});
