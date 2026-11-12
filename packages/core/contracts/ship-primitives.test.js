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
  merge: { results: ['merged', 'red'], outward: 'yes', needs: ['pr'], provides: ['merged'], section: 'ship' },
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

const gateText = fs.readFileSync(path.join(DIR, 'ship-custody-gate.md'), 'utf8');
const gateFlat = gateText.replace(/\s+/g, ' ');

describe('the custody gate (ship-custody-gate.md)', () => {
  test('is not a primitive: no primitive front matter, and the sequencer does not load it', () => {
    expect(gateText).not.toMatch(/^primitive:/m);
    expect(contracts.has('custody-gate')).toBe(false);
    expect(names).not.toContain('custody-gate');
  });
  test('fetches the base and polls headRefOid before it reconciles', () => {
    const iFetch = gateFlat.indexOf('git fetch origin <base>');
    const iPoll = gateFlat.indexOf('headRefOid');
    const iRec = gateFlat.indexOf('custody.js reconcile');
    expect(iFetch).toBeGreaterThan(-1);
    expect(iPoll).toBeGreaterThan(iFetch);
    expect(iRec).toBeGreaterThan(iPoll);
    expect(gateFlat).toMatch(/up to 8 times, 15s apart/);
    expect(gateFlat).toMatch(/--base origin\/<base>/);
  });
  test('re-verifies after the head is on the PR, then repeats the reconcile with --reverified', () => {
    const iVerify = gateFlat.indexOf('/verify-build <work.trd> --criteria <ids> --no-fix --chained');
    const iRec = gateFlat.indexOf('custody.js reconcile');
    expect(iVerify).toBeGreaterThan(iRec);
    expect(gateFlat.indexOf('--reverified', iVerify)).toBeGreaterThan(iVerify);
    expect(gateFlat).toMatch(/reverify\/verification-state\.json/);
  });
  test('records the re-proof with reproof between the verify call and the --reverified reconcile', () => {
    const iVerify = gateFlat.indexOf('/verify-build <work.trd> --criteria <ids> --no-fix --chained');
    const iReproof = gateFlat.indexOf('ship-sequencer.js reproof');
    const iRecon = gateFlat.indexOf('repeat the reconcile above with `--reverified');
    expect(iReproof).toBeGreaterThan(iVerify);
    expect(iRecon).toBeGreaterThan(iReproof);
    for (const f of ['--custody', '--reverified', '--started-at', '--outcome']) {
      expect(gateFlat.slice(iReproof, iRecon)).toContain(f);
    }
    expect(gateFlat).toMatch(/refused call \(`ok:false`\) is one readout line, never a stop/);
  });
  test('names the merged re-proof file and the retried flag', () => {
    expect(gateFlat).toMatch(/holds the merged result after the re-proof's one retry/);
    expect(gateFlat).toMatch(/`retried: true` marks a criterion re-judged on the second try/);
  });
  test('refused returns stop, and reused and excused are reported in data.custody', () => {
    expect(gateFlat).toMatch(/refused[^.]*stop/);
    // tie both id lists to data.custody; bare /reused/ and /excused/ match any prose that mentions them
    expect(gateFlat).toMatch(/`reused` ids[^.]*`excused` paths[^.]*`data\.custody`/);
  });
  test('forbids a commit or push between the gate and the act it guards', () => {
    expect(gateFlat).toMatch(/Do not commit or push anything between the gate and the act it guards/);
  });
});

describe('push', () => {
  const t = flat('push');
  test('only sets the anchor (--set-only) before pushing, and proves no link', () => {
    const iSet = t.indexOf('custody.js reconcile --set-only');
    const iPush = t.indexOf('git push -u origin');
    expect(iSet).toBeGreaterThan(-1);
    expect(iPush).toBeGreaterThan(iSet);
    expect(t).not.toMatch(/--link push/);
    expect(t).not.toMatch(/custody\.js check/);
    expect(t).not.toMatch(/--reverified/);
  });
  test('carries the sweep branch and pathspec rules', () => {
    expect(t).toMatch(/ship\/<work\.id>/);
    expect(t).toMatch(/laterNeeds/);
    expect(t).toMatch(/never `git add -A`/);
  });
});

describe('open-pr', () => {
  const t = flat('open-pr');
  test('calls ensure with --base and --listed, and has no push-link check', () => {
    expect(t).toMatch(/pull-request\.js ensure --base <base> --listed/);
    expect(t).not.toMatch(/--link push/);
  });
});

describe('merge', () => {
  const t = flat('merge');
  test('runs the custody gate before it reads the PR state', () => {
    expect(t).toMatch(/ship-custody-gate\.md/);
    expect(t.indexOf('ship-custody-gate.md')).toBeLessThan(t.indexOf('Read `gh pr view <pr> --json state`'));
  });
  test('orders gate, pr-head check, gh pr merge, merge link; a gate stop leaves the PR unmerged', () => {
    const iGate = t.indexOf('ship-custody-gate.md');
    const iHead = t.indexOf('--link pr-head');
    const iMerge = t.indexOf('gh pr merge <pr> --<method>');
    const iLink = t.indexOf('--link merge');
    // indexOf is -1 when a marker is missing, which would satisfy the < comparisons below
    for (const i of [iGate, iHead, iMerge, iLink]) expect(i).toBeGreaterThan(-1);
    expect(iGate).toBeLessThan(iHead);
    expect(iHead).toBeLessThan(iMerge);
    expect(iMerge).toBeLessThan(iLink);
    expect(t).toMatch(/A gate stop returns `stop` before `gh pr merge`, so the PR stays unmerged/);
  });
  test('matches on the observed id', () => {
    expect(t).toMatch(/--match-head-commit <observed>/);
    expect(t).not.toMatch(/--match-head-commit <head>/);
  });
  test('commits and pushes nothing between the gate and gh pr merge', () => {
    expect(t).toMatch(/Commit and push nothing between the gate and `gh pr merge`/);
  });
  test('passes --head with the PR headRefOid to the gate', () => {
    expect(t).toMatch(/`--head` set to the PR's `headRefOid`/);
  });
  test('an already MERGED PR still skips to the merge proof', () => {
    expect(t).toMatch(/Already `MERGED`[^]*skip to step 4/);
  });
  test('step 1 brings the base in before the gate: merge-up.js decide, MERGED skip, UNKNOWN poll, merge-in on CONFLICTING or BEHIND, base fetch, merge-base-in, push, head wait, CI wait', () => {
    const marks = [
      'merge-up.js decide',
      '`skip`',
      '`poll`',
      '`merge-in`',
      'git fetch origin <base>',
      'record-files.js merge-base-in',
      'git push',
      'until it equals the pushed commit',
      'ship-primitive-wait-ci.md',
      'return `red`',
    ].map((m) => t.indexOf(m));
    for (const i of marks) expect(i).toBeGreaterThan(-1);
    const iGate = t.indexOf('ship-custody-gate.md');
    for (let k = 1; k < marks.length; k += 1) expect(marks[k - 1]).toBeLessThan(marks[k]);
    expect(marks[marks.length - 1]).toBeLessThan(iGate);
    // a merged PR reads UNKNOWN forever, so decide checks MERGED first; poll is 8 times, 15s apart
    expect(t).toMatch(/`skip`[^]*`poll`[^]*8 times, 15s apart/);
    expect(t).toMatch(/`merge-in`[^]*`CONFLICTING`[^]*`BEHIND`/);
  });
  test('a skip goes straight to the gate, and the inline mergeable read is gone', () => {
    expect(t).toMatch(/`skip`[^]*go straight to step 2/);
    expect(t).not.toMatch(/--json mergeable,state/);
    expect(t).not.toMatch(/`MERGEABLE`/);
  });
  test('a decide failure is a stop, and is listed under "One rule for every stop"', () => {
    expect(t).toMatch(/merge-up\.js decide[^]*`ok: false` because it could not read the PR[^]*up to 8 times, 15s apart; still unreadable returns\s*`stop`/);
    expect(t).toMatch(/closed without being merged returns\s*`stop` at once/);
    expect(t).toMatch(/One rule for every stop[^]*`decide` failure/);
  });
  test('the ok: false stop of merge-base-in names the paths', () => {
    expect(t).toMatch(/`ok: false` returns `stop` naming `notRecord` or `invalidJson`/);
  });
  test('the new stops are listed under "One rule for every stop"', () => {
    expect(t).toMatch(/One rule for every stop[^]*merge-base-in[^]*push[^]*(head wait|headRefOid)[^]*CI/);
  });
  test('declares the red loop: rounds defaults to 2, loop keys load, loop order is fixed', () => {
    const c = contracts.get('merge');
    expect(c.params.rounds.default).toBe('2');
    expect(c.stopsOn).toEqual(['red']);
    expect(c.loopOn).toBe('red');
    expect(c.loopVia).toEqual(['collect-findings', 'fix-findings', 'push', 'wait-ci']);
    expect(c.loopRounds).toBe('rounds');
  });
  test('the head wait is 40 polls; the 8-poll head wait is gone', () => {
    expect(t).toMatch(/up to 40 times, 15s apart \(10 minutes\), until it equals the pushed commit/);
    expect(t).not.toMatch(/up to 8 times, 15s apart, until it equals/);
  });
  test('CI is awaited only on an unjudged head, and red comes before the custody gate', () => {
    const iWait = t.indexOf('wait for CI only on a head no recorded step judged');
    const iLatest = t.indexOf('the latest pushed commit');
    const iReread = t.indexOf('read `gh pr view <pr> --json state` again (see "One rule for every stop")');
    const iRed = t.indexOf('Otherwise return `red`, before the custody gate');
    const iGate = t.indexOf('ship-custody-gate.md');
    for (const i of [iWait, iLatest, iReread, iRed, iGate]) expect(i).toBeGreaterThan(-1);
    expect(iWait).toBeLessThan(iLatest);
    expect(iReread).toBeLessThan(iRed);
    expect(iRed).toBeLessThan(iGate);
    expect(t).not.toMatch(/A CI failure on the new head is a `stop`/);
    expect(t).toMatch(/One rule for every stop[^]*`stop` or `red`[^]*MERGED/);
  });
  test('red carries wait-ci\'s failures for the loop, and a hand merge during the wait is proven, not stopped', () => {
    expect(t).toMatch(/return `red`, before the custody gate[^]*`data: \{ failed, flaky, head \}`[^]*`head`, the full id of the PR head that was waited on/);
    expect(text('merge')).toMatch(/^`red`, with `data`: `\{ failed, flaky, head \}`/m);
    expect(t).toMatch(/`MERGED` \(merged by hand during the wait\) goes on to step 2/);
    expect(t).toMatch(/a `red` is not\s+returned at all: go on to step 2/);
  });
  test('declares detach-on: merged, and says the record leaves the tracked tree after merged', () => {
    expect(text('merge')).toMatch(/^detach-on:\s*merged$/m);
    expect(contracts.get('merge').detachOn).toEqual(['merged']);
    expect(t).toMatch(/outside the tracked tree/);
  });
  test('detach-on-data: merged loads, and one rule ties every stop to the MERGED re-read', () => {
    expect(contracts.get('merge').detachOnData).toEqual(['merged']);
    expect(t).toMatch(/One rule for every stop/);
    expect(t).toMatch(/Before returning any `stop`[^]*`gh pr view <pr> --json state`[^]*`MERGED`[^]*`data: \{ merged: true, base \}`/);
    expect(t).toMatch(/sequencer keeps the run\s+record outside the tracked tree/);
  });
});

describe('custody gate report', () => {
  test('step 4 names mergeBases', () => {
    const g = fs.readFileSync(path.join(__dirname, 'ship-custody-gate.md'), 'utf8').replace(/\s+/g, ' ');
    expect(g).toMatch(/Report\.[^]*`mergeBases`/);
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
  test('runs the custody gate before its command, with the local HEAD', () => {
    expect(t).toMatch(/ship-custody-gate\.md/);
    expect(t.indexOf('ship-custody-gate.md')).toBeLessThan(t.indexOf('Run the command as written'));
    expect(t).toMatch(/local `?HEAD`?/);
    expect(t).not.toMatch(/A `check` with no anchor fails; do not set one/);
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
  test('wait-ci records each rerun-pass through flaky-ci.js, caps at 3 and names the job from --json jobs', () => {
    const t = flat('wait-ci');
    expect(t).toMatch(/gh run view <run-id> --json jobs/);
    expect(t).toMatch(/flaky-ci\.js record --state-dir <work\.stateDir> --job <name> --run-id <id>/);
    expect(t).toMatch(/3 or more times/);
    expect(t).toMatch(/`capped: true`/);
    expect(t).toMatch(/never files anything/);
    expect(t).not.toMatch(/was flaky: list it in `data\.flaky`\. Still failing/);
  });
  test('wait-ci applies the cap to a rerun-pass it did not make, so a resume cannot bypass it', () => {
    const t = flat('wait-ci');
    expect(t).toMatch(/--json attempt,jobs/);
    expect(t).toMatch(/resuming after a capped stop cannot turn the stop into a pass/);
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
    expect(t).toMatch(/ship-review\.js match --login/);
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
  test('collect-findings treats a capped failure as a known flake: no log, no judge, [flaky-capped], stop', () => {
    const t = flat('collect-findings');
    expect(t).toMatch(/`capped: true`/);
    expect(t).toMatch(/\[flaky-capped\] <job>/);
    expect(t).toMatch(/flaky-capped:<job>/);
    expect(t).toMatch(/return `stop`/);
    expect(t).toMatch(/once step 4\s+has recorded everything else, return `stop`/);
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
    expect(t).toMatch(/custody gate before the merge re-verifies/);
  });
  test('collect-findings records the files a CI failure points at, for fix-findings to size the fix by', () => {
    const t = flat('collect-findings');
    expect(t).toMatch(/`files`/);
    expect(t).toMatch(/what `fix-findings` sizes the fix by/);
  });
  test('routeRow sends test-only and CI-config rows to the direct path and product code to reconcile', () => {
    const { routeRow } = require('../lib/ci-fix-route');
    expect(routeRow({ summary: 'ci: unit', files: ['packages/x/foo.test.js'] }).route).toBe('direct');
    expect(routeRow({ summary: 'ci: lint workflow', file: '.github/workflows/ci.yml' }).route).toBe('direct');
    expect(routeRow({ summary: 'ci: unit', files: ['packages/core/lib/custody.js'] }).route).toBe('reconcile');
  });
  test('fix-findings contract: direct path avoids implement-trd and /code-review, with its guards', () => {
    const t = flat('fix-findings');
    const iRoute = t.indexOf('ci-fix-route.js route');
    const iDirect = t.indexOf('**Direct path.**');
    const iReconcile = t.indexOf('**Reconcile path.**');
    expect(iRoute).toBeGreaterThan(-1);
    expect(iRoute).toBeLessThan(iDirect);
    expect(iDirect).toBeLessThan(iReconcile);
    const direct = t.slice(iDirect, iReconcile);
    for (const w of ['ci-fix-route.js check-diff', 'needs-product', 'actionlint', 'fixed directly at <sha>', 'git add --']) {
      expect(direct).toContain(w);
    }
    expect(direct).not.toMatch(/implement-trd/);
    expect(direct).not.toMatch(/\/code-review/);
  });
  test('fix-findings contract: product-code rows take the reconcile path, sweep step unchanged', () => {
    const t = flat('fix-findings');
    const reconcile = t.slice(t.indexOf('**Reconcile path.**'));
    expect(reconcile).toContain('--reconcile --chained --shipping');
    expect(t).toMatch(/\/plan <the findings>/);
  });
  test('fix-findings contract: sweep work goes to step 4 before any routing', () => {
    const t = flat('fix-findings');
    const sentence = 'Sweep work (`work.kind` is `sweep`) goes to step 4 first, before any routing';
    expect(t).toContain(sentence);
    expect(t.indexOf(sentence)).toBeLessThan(t.indexOf('ci-fix-route.js route'));
  });
  test('fix-findings contract: direct path names the clean-tree rule and the diff-only judge', () => {
    const t = flat('fix-findings');
    const direct = t.slice(t.indexOf('**Direct path.**'), t.indexOf('**Reconcile path.**'));
    expect(direct).toContain('git status --porcelain');
    expect(direct).toMatch(/otherwise every row takes the reconcile path/);
    expect(direct).toMatch(/subagent_type: "code-reviewer"/);
    expect(direct).toMatch(/reads only that diff/);
    expect(direct).toMatch(/subagent_type: "app-debugger"/);
  });
  test('fix-findings contract: Result names a direct fix', () => {
    const t = flat('fix-findings');
    const iResult = t.indexOf('## Result');
    const iWaiting = t.indexOf('## Waiting');
    expect(iResult).toBeGreaterThan(-1);
    expect(iWaiting).toBeGreaterThan(iResult);
    expect(t.slice(iResult, iWaiting)).toContain('a direct fix');
  });
  test('fix-findings contract: reconcile path runs only when reconcile rows remain, and step 4 keeps its sweep sentence', () => {
    const t = flat('fix-findings');
    const reconcile = t.slice(t.indexOf('**Reconcile path.**'), t.indexOf('4. **Sweep work has no TRD**'));
    expect(reconcile).toMatch(/Run only when reconcile rows remain/);
    const step4 = t.slice(t.indexOf('4. **Sweep work has no TRD**'), t.indexOf('## Result'));
    expect(step4).toMatch(/return `stop` naming `\/plan <the findings>`/);
    expect(step4).toMatch(/handed to \/plan/);
  });
  test('run leaves a command\'s commit to the custody gate', () => {
    expect(flat('run')).toMatch(/reconciled by the custody gate before the next merge or release/);
  });
});

describe('the after-shipping primitives', () => {
  test('close-issue carries the one-reference rule', () => {
    const t = flat('close-issue');
    expect(t).toMatch(/Exactly one distinct reference: close it/);
    expect(t).toMatch(/None: close nothing/);
    expect(t).toMatch(/More than one: close nothing/);
  });
  test('file-followups imports flaked jobs through flaky-ci.js as [flaky-ci] rows keyed flaky:<job>', () => {
    const t = flat('file-followups');
    expect(t).toMatch(/flaky-ci\.js import --state-dir <work\.stateDir>/);
    expect(t).toMatch(/flaky:<job>/);
    expect(t).toMatch(/\[flaky-ci\]/);
  });
  test('file-followups reports a [flaky-capped] row and never files it', () => {
    const t = flat('file-followups');
    expect(t).toMatch(/A `\[flaky-capped\]` row is\s+reported, never filed/);
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
  test('file-followups reads rows through followup-rank.js in rank order and files in that order', () => {
    const t = flat('file-followups');
    expect(t).toMatch(/node \.claude\/lib\/followup-rank\.js open --state-dir <dir>/);
    expect(t).toMatch(/repeated `--state-dir`/);
    expect(t).toMatch(/product, host, tooling, paperwork, not-verifiable/);
    expect(t).toMatch(/each carrying `class` and `dir`/);
    expect(t).not.toMatch(/discovered\.readAll\(dir, \{ open: true \}\)/);
    expect(t).toMatch(/in that order/);
    expect(t).toMatch(/against its own `dir`/);
    expect(t).toMatch(/\{ summary, url, class \}/);
  });
  test('file-followups writes class-led data.issues lines in rank order, the no-row line last', () => {
    const t = flat('file-followups');
    expect(t).toMatch(/starting with the row's class/);
    expect(t).toMatch(/product · <summary> — <ledger path> — <why>/);
    expect(t).toMatch(/the line naming the record of unfixed review findings[^.]*goes last/);
    expect(t).toMatch(/\{ filed: \[\{ summary, url, class \}\], unfiled: \[row summaries, in rank order\], issues \}/);
  });
  test('ship-build.md Step 6 orders filed and unfiled follow-ups by class and shows the class', () => {
    const t = fs.readFileSync(path.join(DIR, '..', 'commands', 'ship-build.md'), 'utf8').replace(/\s+/g, ' ');
    expect(t).toMatch(/in the order product, host, tooling, paperwork, not-verifiable/);
    expect(t).toMatch(/the row's class, its summary/);
    expect(t).toMatch(/Recorded, not yet filed[^]*each line shows its class[^]*all `product`/);
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
  test('owner-governed rule files are read through owner-rules.js path, not the branch path', () => {
    const rel = flat('release');
    expect(rel).toMatch(/owner-rules\.js path verification\.md/);
    expect(rel).not.toMatch(/readFileSync\("\.claude\/rules\/verification\.md"/);
    const close = flat('close-issue');
    expect(close).toMatch(/owner-rules\.js path stack\.md/);
    expect(close).not.toMatch(/in `\.claude\/rules\/stack\.md`/);
  });
  test('ship-build.md resolves rules before starting and passes the path form to --policy', () => {
    const t = fs.readFileSync(path.join(DIR, '..', 'commands', 'ship-build.md'), 'utf8');
    expect(t).toMatch(/owner-rules\.js resolve/);
    expect(t).toMatch(/--policy "\$\(node \.claude\/lib\/owner-rules\.js path ship\.md\)"/);
    expect(t).not.toMatch(/--policy \.claude\/rules\/ship\.md/);
  });
});

describe('verify-build --criteria reads the plan\'s rulings (FIX-004)', () => {
  const vb = fs.readFileSync(path.join(DIR, '..', 'commands', 'verify-build.md'), 'utf8');
  const section = vb.slice(vb.indexOf('## `--criteria <ids>`'), vb.indexOf('## `--fix [plan-path]`'));
  const t = section.replace(/\s+/g, ' ');
  test('folds both ruling tables into notes, whatever the plan timestamp', () => {
    expect(section.length).toBeGreaterThan(0);
    expect(t).toMatch(/`## Owner rulings`/);
    expect(t).toMatch(/`## Accepted as not verifiable`/);
    expect(t).toMatch(/into `notes`/);
    expect(t).toMatch(/whatever (its|the plan's) `?\*{0,2}Written/i);
  });
  test('still builds nothing', () => {
    expect(t).toMatch(/builds nothing/);
  });
});

describe('ship-build Step 5 after a merge (FIX-004)', () => {
  const sb = fs.readFileSync(path.join(DIR, '..', 'commands', 'ship-build.md'), 'utf8');
  const t = sb.replace(/\s+/g, ' ');
  test('no longer tells the owner to commit the state directory on the default branch', () => {
    expect(t).not.toMatch(/commit (it|the state directory) on the default branch/i);
    expect(t).not.toMatch(/Merged with the state directory uncommitted/);
  });
  test('names the record under the git directory via recordPath', () => {
    expect(t).toMatch(/recordPath/);
    expect(t).toMatch(/records ref/);
    expect(t).toMatch(/<ref>:shipped\.json/);
    expect(t).toMatch(/git show/);
    expect(t).not.toMatch(/untracked file under the git common directory/);
    expect(t).toMatch(/data\.custody/);
  });
});
