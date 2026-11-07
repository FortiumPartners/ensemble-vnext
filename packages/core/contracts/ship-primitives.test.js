'use strict';

/**
 * ship-primitives.test.js -- shape and content checks for the /ship-build primitive contracts
 * (TRD ship-build SHIP-B016, D41).
 *
 * The directory is read, not a fixed list: a new `ship-primitive-<name>.md` is checked for its
 * front matter, its four sections and the order rules with no edit here. Behaviour assertions
 * for a particular primitive are added beside its own describe block.
 *
 * Run with: npx jest packages/core/contracts/ship-primitives.test.js
 */

const fs = require('fs');
const path = require('path');
const seq = require('../lib/ship-sequencer');

const DIR = __dirname;
const MIRROR = path.join(DIR, '..', '..', '..', '.claude', 'contracts');
const TEMPLATE = path.join(DIR, '..', 'templates', 'claude-directory', 'rules', 'ship.md');

const files = fs.readdirSync(DIR).filter((f) => /^ship-primitive-.+\.md$/.test(f)).sort();
const names = files.map((f) => f.replace(/^ship-primitive-/, '').replace(/\.md$/, ''));
const text = (name) => fs.readFileSync(path.join(DIR, `ship-primitive-${name}.md`), 'utf8');
const flat = (name) => text(name).replace(/\s+/g, ' ');

const { contracts, errors } = seq.loadPrimitives(DIR);

/** §3.2 of the TRD: front matter each shipped primitive must carry. */
const EXPECTED = {
  push: { results: ['pushed'], outward: 'no', needs: [], provides: ['head'], section: 'ship' },
  'open-pr': { results: ['opened', 'reused'], outward: { unless: 'ensemble.openPullRequest', equals: 'auto' }, needs: ['head'], provides: ['pr'], section: 'ship' },
  'request-review': { results: ['reviewed'], outward: 'yes', needs: ['pr'], provides: [], section: 'ship' },
  'wait-ci': { results: ['passed', 'failed', 'no-checks'], outward: 'no', needs: ['head'], provides: [], section: 'ship' },
  'await-approval': { results: ['approved'], outward: 'no', needs: ['pr'], provides: [], section: 'ship' },
  'collect-findings': { results: ['clean', 'found'], outward: 'no', needs: ['head'], provides: ['findings'], section: 'ship' },
  'fix-findings': { results: ['fixed', 'nothing'], outward: 'no', needs: ['findings'], provides: [], section: 'ship' },
  merge: { results: ['merged'], outward: 'yes', needs: ['pr'], provides: ['merged'], section: 'ship' },
  release: { results: ['released'], outward: 'yes', needs: ['head'], provides: [], section: 'ship' },
  run: { results: ['ran'], outward: 'yes', needs: [], provides: [], section: 'any' },
  'close-issue': { results: ['closed', 'none'], outward: 'yes', needs: [], provides: [], section: 'after' },
  'file-followups': { results: ['filed'], outward: 'yes', needs: [], provides: [], section: 'after' },
  'sync-design': { results: ['synced', 'nothing', 'skipped'], outward: 'yes', needs: ['merged'], provides: [], section: 'after' },
};

describe('every contract in the directory', () => {
  test('the sequencer loads them all with no error', () => {
    expect(errors).toEqual([]);
    expect([...contracts.keys()].sort()).toEqual(names);
  });

  test.each(names)('%s has Input, Do, Result and Waiting sections', (name) => {
    const body = text(name);
    for (const h of ['## Input', '## Do', '## Result', '## Waiting']) {
      expect(body).toMatch(new RegExp(`^${h}$`, 'm'));
    }
  });

  test.each(names)('%s: every needs key is provided by some contract', (name) => {
    const provided = new Set([...contracts.values()].flatMap((c) => c.provides));
    for (const key of contracts.get(name).needs) expect(provided.has(key)).toBe(true);
  });

  test.each(names)('%s names neither AskUserQuestion nor Forge', (name) => {
    expect(text(name)).not.toMatch(/AskUserQuestion/);
    expect(text(name)).not.toMatch(/forge/i);
  });

  test.each(names)('%s is byte-identical to its .claude/contracts copy', (name) => {
    const f = `ship-primitive-${name}.md`;
    expect(fs.readFileSync(path.join(MIRROR, f), 'utf8')).toBe(fs.readFileSync(path.join(DIR, f), 'utf8'));
  });
});

describe('the thirteen shipped primitives (TRD 3.2)', () => {
  test('the set is the thirteen', () => {
    expect(names).toEqual(Object.keys(EXPECTED).sort());
  });

  test.each(Object.entries(EXPECTED))('%s front matter matches the table', (name, want) => {
    const c = contracts.get(name);
    // Read the declared line itself: the sequencer's list reader drops the word `none` (recorded
    // as a discovery), and close-issue's `none` result must stay declared.
    const raw = /^results:\s*(.*)$/m.exec(text(name))[1].split(',').map((x) => x.trim());
    expect(raw).toEqual(want.results);
    expect(c.outward).toEqual(want.outward);
    expect(c.needs).toEqual(want.needs);
    expect(c.provides).toEqual(want.provides);
    expect(c.section).toBe(want.section);
  });

  test('collect-findings declares repeat-until clean; release needs head; no other declares repeat-until', () => {
    expect(contracts.get('collect-findings').repeatUntil).toBe('clean');
    expect(contracts.get('release').needs).toContain('head');
    const others = [...contracts.values()].filter((c) => c.primitive !== 'collect-findings' && c.repeatUntil);
    expect(others).toEqual([]);
  });

  test('parameters: required, defaulted and rest', () => {
    expect(contracts.get('request-review').params.tool).toEqual({ default: null, required: true });
    expect(contracts.get('collect-findings').params.bar.default).toBe('significant');
    expect(contracts.get('merge').params.method.default).toBe('merge');
    expect(contracts.get('file-followups').params['below-bar'].default).toBe('no');
    expect(Object.keys(contracts.get('release').params).sort()).toEqual(['command', 'env', 'identity']);
    expect(contracts.get('run').rest).toBe('command');
  });

  test('required parameters are marked required, and optional ones are not (AC-F14.3)', () => {
    // A names-only check would pass if identity were quietly made optional again.
    expect(contracts.get('release').params.identity).toEqual({ default: null, required: true });
    expect(contracts.get('release').params.env.required).toBe(false);
    expect(contracts.get('release').params.command.required).toBe(false);
    expect(contracts.get('run').params.command.required).toBe(true);
    expect(contracts.get('request-review').params.tool.required).toBe(true);
  });
});

describe('the template examples parse against the contracts', () => {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const blocks = [...tpl.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
  // Each block is a ship.md fragment; those without headings are `## Ship` lines.
  const asPolicy = (b) => (/^## /m.test(b) ? b : `## Ship\n\n${b}`);
  const policyBlocks = blocks.filter((b) => /^\d+\.\s+(push|run)\b/m.test(b));

  test('there are examples to check', () => {
    expect(policyBlocks.length).toBeGreaterThanOrEqual(6);
  });

  test.each(policyBlocks.map((b, i) => [i, b]))('example %i parses with no error', (_i, block) => {
    const r = seq.parse(asPolicy(block), contracts);
    expect(r.errors).toEqual([]);
    expect(r.steps.length).toBeGreaterThan(0);
  });
});

describe('push', () => {
  const t = flat('push');
  test('reconciles custody before it pushes and checks the push link after', () => {
    const iReconcile = t.indexOf('custody.js reconcile');
    const iPush = t.indexOf('git push -u origin');
    const iCheck = t.indexOf('custody.js check');
    expect(iReconcile).toBeGreaterThan(-1);
    expect(iPush).toBeGreaterThan(iReconcile);
    expect(iCheck).toBeGreaterThan(iPush);
    expect(t).toMatch(/--link push/);
  });
  test('handles reverify with a no-fix chained verify-build', () => {
    expect(t).toMatch(/reverify/);
    expect(t).toMatch(/\/verify-build <work\.trd> --criteria <ids> --no-fix --chained/);
    expect(t).toMatch(/--reverified/);
  });
  test('carries the sweep branch and pathspec rules', () => {
    expect(t).toMatch(/ship\/<work\.id>/);
    expect(t).toMatch(/laterNeeds/);
    expect(t).toMatch(/never `git add -A`/);
  });
});

describe('open-pr', () => {
  const t = flat('open-pr');
  test('calls ensure with --base and --listed, then checks the push link', () => {
    expect(t).toMatch(/pull-request\.js ensure --base <base> --listed/);
    expect(t.indexOf('--link push')).toBeGreaterThan(t.indexOf('pull-request.js ensure'));
  });
});

describe('merge', () => {
  const t = flat('merge');
  test('runs gh pr merge then checks the merge link', () => {
    expect(t).toMatch(/gh pr merge <pr> --<method>/);
    expect(t.indexOf('--link merge')).toBeGreaterThan(t.indexOf('gh pr merge'));
  });
  test('checks the open PR head before merging and matches on the observed id', () => {
    expect(t.indexOf('--link pr-head')).toBeGreaterThan(-1);
    expect(t.indexOf('--link pr-head')).toBeLessThan(t.indexOf('gh pr merge'));
    expect(t).toMatch(/--match-head-commit <observed>/);
    expect(t).not.toMatch(/--match-head-commit <head>/);
  });
  test('an already MERGED PR still skips to the merge proof', () => {
    expect(t).toMatch(/Already `MERGED`[^]*skip to step 2/);
  });
});

describe('release', () => {
  const t = flat('release');
  // push first: release needs the head that push provides.
  const parseShip = (line) => seq.parse(`## Ship\n\n1. push\n2. ${line}\n`, contracts);
  test('a release line without identity= fails to parse, naming identity (AC-F14.3)', () => {
    const r = parseShip('release env=production');
    expect(r.errors.join('\n')).toMatch(/release needs identity/);
  });
  test('an empty identity= is rejected too', () => {
    expect(parseShip('release env=production identity=').errors.join('\n')).toMatch(/release needs identity/);
  });
  test('a release line with identity= parses', () => {
    const r = parseShip('release env=production identity="echo abc"');
    expect(r.errors).toEqual([]);
    expect(r.steps).toHaveLength(2);
  });
  test('resolves its command with readFullDeploy and never guesses', () => {
    expect(t).toMatch(/readFullDeploy/);
    expect(t).toMatch(/no command is guessed/);
  });
  test('stops on a failure without fixing, and checks the deploy link', () => {
    expect(t).toMatch(/non-zero exit returns `stop`/);
    expect(t).toMatch(/do not fix it/);
    expect(t).toMatch(/--link deploy/);
  });
});

describe('the waiting primitives', () => {
  test('wait-ci reads the merge commit after a merge and polls 120s before no-checks', () => {
    const t = flat('wait-ci');
    expect(t).toMatch(/context\.merged/);
    expect(t).toMatch(/--json mergeCommit/);
    expect(t).toMatch(/up to 120s before returning `no-checks`/);
    const waiting = t.slice(t.indexOf('## Waiting'));
    expect(waiting).toMatch(/gh run list --commit <merge-sha>/);
  });
  test.each(['request-review', 'wait-ci', 'await-approval', 'collect-findings'])('%s defines the current head as the head last published', (name) => {
    const t = flat(name);
    expect(t).toMatch(/headRefOid/);
    expect(t).toMatch(/latest `pushed` result/);
    expect(t).toMatch(/never local `HEAD`/);
  });
  test.each(['request-review', 'wait-ci'])('%s uses Monitor with timeout_ms 1800000', (name) => {
    expect(flat(name)).toMatch(/Monitor/);
    expect(flat(name)).toMatch(/timeout_ms: 1800000/);
  });
  test('wait-ci re-arms only while a check is pending, and re-runs failed jobs once', () => {
    const t = flat('wait-ci');
    expect(t).toMatch(/Re-arm only while a check reports pending/);
    expect(t).toMatch(/gh run rerun <run-id> --failed/);
    expect(t).toMatch(/once/);
  });
  test('request-review arms once and returns wait; claude uses a background Bash', () => {
    const t = flat('request-review');
    expect(t).toMatch(/One arm, no re-arm/);
    expect(t).toMatch(/return(s)? `wait`/);
    expect(t).toMatch(/@coderabbitai review/);
    expect(t).toMatch(/@codex review/);
    expect(t).toMatch(/run_in_background: true/);
  });
  test('request-review tool=claude narrows its permissions and defines how its review is recognised', () => {
    const t = flat('request-review');
    expect(t).toMatch(/--allowedTools/);
    expect(t).toMatch(/Bash\(gh pr comment:\*\)/);
    expect(t).not.toMatch(/Bash\(gh:\*\)/);
    expect(t).toMatch(/gh api user --jq \.login/);
    expect(t).toMatch(/requestedAt/);
    expect(t).toMatch(/review-<head>\.log/);
    expect(t).toMatch(/exit with nothing posted[^.]*return(s)? `wait`/);
  });
  test('await-approval returns wait, with remoteResume only when the workflow file is on the remote default branch', () => {
    const t = flat('await-approval');
    expect(t).toMatch(/return `wait`/);
    expect(t).toMatch(/remoteResume: true/);
    expect(t).toMatch(/exists on the remote default branch/);
  });
  test('await-approval names a self-authored PR and ties remoteResume to the workflow file and the ANTHROPIC_API_KEY secret', () => {
    const t = flat('await-approval');
    expect(t).toMatch(/gh pr view <pr> --json author/);
    expect(t).toMatch(/gh api user --jq \.login/);
    expect(t).toMatch(/does not let an author approve their own PR/);
    expect(t).toMatch(/selfAuthored/);
    expect(t).toMatch(/gh secret list --json name/);
    expect(t).toMatch(/ANTHROPIC_API_KEY/);
    expect(t).toMatch(/Only if the file exists and the secret is listed, put `remoteResume: true`/);
    expect(t).toMatch(/organization-level secret is not visible/);
  });
});

describe('collect-findings and fix-findings', () => {
  test('collect-findings carries the label table, the one-judge fail-closed rule and the final-pass sort', () => {
    const t = flat('collect-findings');
    for (const w of ['critical', 'blocker', 'major', 'high', 'minor', 'low', 'nit', 'nitpick', 'trivial', 'info']) {
      expect(t).toContain(`\`${w}\``);
    }
    expect(t).toMatch(/One judge per pass/);
    expect(t).toMatch(/Fail closed/);
    expect(t).toMatch(/Final pass/);
    expect(t).toMatch(/\[below-critical\]/);
    expect(t).toMatch(/\[lint\]/);
  });
  test('fix-findings chains the shipping reconcile, stops for sweep work naming /plan, and resolves rows in order', () => {
    const t = flat('fix-findings');
    expect(t).toMatch(/--reconcile --chained --shipping/);
    expect(t).toMatch(/sweep/);
    expect(t).toMatch(/\/plan <the findings>/);
    expect(t).toMatch(/--reason format/);
    const iFormat = t.indexOf('formatted <sha>');
    const iChain = t.indexOf('--reconcile --chained --shipping');
    expect(iFormat).toBeGreaterThan(-1);
    expect(iFormat).toBeLessThan(iChain);
    expect(t).toMatch(/fixed by reconcile at <sha>/);
    expect(t).toMatch(/not built/);
  });
});

describe('the after-shipping primitives', () => {
  test('close-issue carries the one-reference rule', () => {
    const t = flat('close-issue');
    expect(t).toMatch(/Exactly one distinct reference: close it/);
    expect(t).toMatch(/None: close nothing/);
    expect(t).toMatch(/More than one: close nothing/);
  });
  test('file-followups imports then resolves, reads no sweep-ledger row, reports unfiled rows', () => {
    const t = flat('file-followups');
    expect(t).toMatch(/Import what has no row yet/);
    expect(t).toMatch(/discovered\.resolve\(dir, row, "filed <url>"\)/);
    expect(t).toMatch(/criterion:<id>/);
    expect(t).toMatch(/followup:<index>/);
    expect(t).toMatch(/reads no row of the sweep ledger/);
    expect(t).not.toMatch(/readAll\([^)]*_sweep/);
    expect(t).toMatch(/\[review-pending\]/);
    expect(t).toMatch(/`data\.issues`/);
    expect(t).toMatch(/below-bar=yes/);
  });
  test('sync-design sets the tree aside with a tagged stash, restores with apply, and never stops', () => {
    const t = flat('sync-design');
    expect(t).toMatch(/git stash push -u -m "ship-build sync-design/);
    expect(t).toMatch(/git stash apply <sha>/);
    expect(t).toMatch(/--merged-into origin\/<base>/);
    expect(t).toMatch(/--merged-head <context\.mergedHead>/);
    expect(t).toMatch(/never returns `stop`/);
    expect(t).toMatch(/Never a bare `git stash`/);
  });
});
