'use strict';

// VCON-B009: both command surfaces (implement-trd.md, verify-build.md, each with its
// .claude/ mirror) learn lanes/refresh/full-run derivation and insufficient-coverage, AND
// the --verify default flip. This suite asserts on the PROSE those two files carry, because
// the derivation itself is executed by a model reading these files, not by code (D5, D15;
// see docs/TRD/verification-convergence.md's "Could Not Verify": "Lane resolution is done by
// a model reading two tables (§8.1a)").
//
// Split (post-review, VCON-B009 ordering fix): §3.6a runs BEFORE any success-definition
// criteria exist (the derive agent it depends on is dispatched in the background at §3.6 and
// is not read until Step 8), so it resolves ENVIRONMENTS only. The per-criterion three-way
// bucket and the lane/refresh/full-run derivation that reads §1a/§2 both need `criteria` to
// exist, so they moved to §8.1a — the first point after §8.1 where criteria are actually
// resolved, and one both the fresh-run path and the `--resume` path (§8.2) reach.
//
// These are documentation-level assertions, same standing as
// test/integration/tests/runtime-integrity.test.sh's — they prove the command TELLS the
// model what to do, not that a given run obeyed.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');

const CORE_IMPLEMENT = path.join(REPO, 'packages/core/commands/implement-trd.md');
const CLAUDE_IMPLEMENT = path.join(REPO, '.claude/commands/implement-trd.md');
const CORE_VERIFY_BUILD = path.join(REPO, 'packages/core/commands/verify-build.md');
const CLAUDE_VERIFY_BUILD = path.join(REPO, '.claude/commands/verify-build.md');
const CORE_PROCESS_TEMPLATE = path.join(REPO, 'packages/core/templates/process.md.template');
const CLAUDE_PROCESS = path.join(REPO, '.claude/rules/process.md');
const CORE_AMEND = path.join(REPO, 'packages/core/commands/amend.md');
const CLAUDE_AMEND = path.join(REPO, '.claude/commands/amend.md');
const CORE_PLAN = path.join(REPO, 'packages/core/commands/plan.md');
const CLAUDE_PLAN = path.join(REPO, '.claude/commands/plan.md');

const read = (p) => fs.readFileSync(p, 'utf8');
// Prose wraps at ~80 columns, so a phrase that reads as one sentence to a human can straddle
// a line break in the source. Flatten before matching a multi-word phrase so a cosmetic
// rewrap never fails this suite for a reason that has nothing to do with content.
const flat = (s) => s.replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// Mirror parity — catches forgetting to `cp` the .claude/ copy (repo_rules).
// ---------------------------------------------------------------------------

describe('packages/core <-> .claude mirror parity', () => {
  test('implement-trd.md is byte-identical to its mirror', () => {
    expect(read(CLAUDE_IMPLEMENT)).toBe(read(CORE_IMPLEMENT));
  });

  test('verify-build.md is byte-identical to its mirror', () => {
    expect(read(CLAUDE_VERIFY_BUILD)).toBe(read(CORE_VERIFY_BUILD));
  });

  test('amend.md is byte-identical to its mirror', () => {
    expect(read(CLAUDE_AMEND)).toBe(read(CORE_AMEND));
  });

  test('plan.md is byte-identical to its mirror', () => {
    expect(read(CLAUDE_PLAN)).toBe(read(CORE_PLAN));
  });
});

// ---------------------------------------------------------------------------
// FIX-003 (never-unattended-paths TRD): plan.md Step 7 calls the checker instead of having
// the model gather touches and read the never-unattended list from verification.md by hand.
// ---------------------------------------------------------------------------

describe('plan.md Step 7 uses check-never-unattended instead of gathering touches by hand', () => {
  const step7 = () =>
    read(CORE_PLAN).split('## Step 7: Implement, or stop')[1].split('---')[0];

  test('calls the check-never-unattended subcommand', () => {
    expect(step7()).toMatch(/check-never-unattended docs\/TRD\/<slug>\.md \.claude\/rules\/verification\.md/);
  });

  test('passes hits as neverUnattendedHit, not a hand-rolled matchNeverUnattended call', () => {
    expect(step7()).toMatch(/hits.*as `neverUnattendedHit`|Pass `hits` as `neverUnattendedHit`/i);
  });

  test("status: 'invalid' stops the chain and names the unreadable raw line", () => {
    expect(step7()).toMatch(/status: 'invalid'/);
    expect(flat(step7())).toMatch(/stop here; do not chain into `\/implement-trd`/);
    expect(step7()).toMatch(/`raw`/);
  });

  test("status: 'absent' adds one readout line pointing at /verification-setup", () => {
    expect(step7()).toMatch(/status: 'absent'/);
    expect(step7()).toMatch(/\/verification-setup/);
  });

  test('with no core TRD it reads §5b alone and passes an empty neverUnattendedHit', () => {
    expect(flat(step7())).toMatch(/Read §5b on its own instead, so an unreadable list still stops the run/);
    expect(flat(step7())).toMatch(/Pass its `status` as `neverUnattendedStatus` and `"neverUnattendedHit": \[\]`/);
    expect(flat(step7())).toMatch(/`invalid` stops here exactly as described below/);
  });

  test('plan() refuses to chain on invalid, so the stop does not rest on prose alone', () => {
    expect(flat(step7())).toMatch(/`plan\(\)` itself refuses to chain on `'invalid'`/);
  });

  test('describes the list as living in verification.md §5b', () => {
    expect(read(CORE_PLAN)).toMatch(/verification\.md`?\s*§5b|§5b/);
  });
});

// ---------------------------------------------------------------------------
// CLOSE-B003 (docs/TRD/feature-close-out.md D13, §3.5): /implement-trd and /amend refuse a
// closed feature. Both guards sit at the point CLOSE-B003's grounding names -- before the
// pointer write / branch switch / --reset-state deletion for /implement-trd, before Step 1
// for /amend -- and both spell out how to reopen.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The lane / refresh / full-run derivation (§8.1a) -- moved out of §3.6a because no
// criterion exists at §3.6a's point in the run.
// ---------------------------------------------------------------------------

describe('implement-trd.md §8.1a derives exerciseLanes/refreshCommand/fullRunCommand', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('reads §1a for capacity and nothing else', () => {
    expect(src()).toMatch(/§1a/);
    expect(src()).toMatch(/capacity comes from §1a's counts and from nothing else/i);
  });

  test('a count of 0 (or a §1 "must not be touched" environment) contributes no lane', () => {
    expect(src()).toMatch(/no lane at all/i);
    expect(src()).toMatch(/must not be touched/i);
  });

  test('an environment with no §1a row resolves to a lane of concurrency 1', () => {
    expect(src()).toMatch(/no row in §1a.*count.*`1`|implied count of `1`/is);
  });

  test('a blank create\\/destroy cell yields createCommand: ""', () => {
    expect(src()).toMatch(/createCommand: ""/);
  });

  test('the remainder lane (resource: null) is sized by its own criterion count and omitted when empty', () => {
    expect(src()).toMatch(/resource: null/);
    expect(src()).toMatch(/own criterion count/i);
    expect(flat(src())).toMatch(/[Oo]mit(ted)? the remainder lane entirely when no criterion falls into it/i);
  });

  test('records, per criterion, which environment and which lane it resolved to', () => {
    expect(src()).toMatch(/per criterion.*(which environment|environment.*lane)/is);
  });

  test('reads matchedTemplate and missingSections, the fields check-verification-unfilled emits (VSET-B003, D10)', () => {
    const text = src();
    expect(text).toMatch(/matchedTemplate/);
    expect(text).toMatch(/missingSections/);
  });
});

// ---------------------------------------------------------------------------
// Coverage floor (VSET-B003, D7/D9): §8.1a reads it through a real CLI subcommand and
// branches on a status value that subcommand actually returns.
// ---------------------------------------------------------------------------

describe('implement-trd.md §8.1a reads the coverage floor through read-coverage-floor', () => {
  const section81a = () => read(CORE_IMPLEMENT)
    .split('### 8.1a Resolve criteria to environments and lanes')[1]
    .split('### 8.3 Assemble the remaining args and dispatch')[0];

  test('§8.1a runs read-coverage-floor and derives coverageFloor', () => {
    expect(section81a()).toMatch(/read-coverage-floor/);
    expect(section81a()).toMatch(/coverageFloor/);
  });

  test("§8.1a branches on status: 'invalid', a value readCoverageFloor returns", () => {
    expect(section81a()).toMatch(/status: 'invalid'/);
  });
});

describe('verify-build.md points at §3.6a for environments and §8.1a for lanes, not one pointer for both', () => {
  const src = () => read(CORE_VERIFY_BUILD);

  test('step 2 (environment preflight) still points at §3.6a as identical', () => {
    expect(src()).toMatch(/Identical to `\/implement-trd` §3\.6a/);
  });

  test('step 2 no longer claims to also derive lanes/refresh/full-run', () => {
    const step2 = src().split('### 2. Preflight the environment')[1].split('### 3.')[0];
    expect(step2).not.toMatch(/exerciseLanes|refreshCommand|fullRunCommand/);
  });

  test('a later step points at §8.1a and names lanes/refresh/full-run and the digest line', () => {
    expect(src()).toMatch(/Identical to `\/implement-trd` §8\.1a/);
    expect(src()).toMatch(/exerciseLanes/);
    expect(src()).toMatch(/refreshCommand/);
    expect(src()).toMatch(/fullRunCommand/);
  });
});

// ---------------------------------------------------------------------------
// Ordering: §8.1a sits after criteria are resolved (§8.1) and before dispatch (§8.3);
// §3.6a no longer does per-criterion work; §8.2 (the --resume path) runs §8.1a too.
// ---------------------------------------------------------------------------

describe('§8.1a is positioned correctly and §3.6a is environment-only', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('§8.1a appears after §8.1 and before §8.3', () => {
    const text = src();
    const i81 = text.indexOf('### 8.1 Resolve the definition');
    const i81a = text.indexOf('### 8.1a Resolve criteria to environments and lanes');
    const i83 = text.indexOf('### 8.3 Assemble the remaining args and dispatch');
    expect(i81).toBeGreaterThan(-1);
    expect(i81a).toBeGreaterThan(-1);
    expect(i83).toBeGreaterThan(-1);
    expect(i81a).toBeGreaterThan(i81);
    expect(i83).toBeGreaterThan(i81a);
  });

  test('§8.2 (the --resume composition) names §8.1a', () => {
    const text = src();
    const section82 = text
      .split('### 8.2 The `--resume` composition')[1]
      .split('### 8.1a Resolve criteria to environments and lanes')[0];
    expect(section82).toMatch(/§8\.1a/);
  });

  test('§3.6a contains no per-criterion three-way bucket and no lane derivation', () => {
    const text = src();
    const section36a = text
      .split('### 3.6a Preflight the environment')[1]
      .split('## Step 4:')[0];
    // §3.6a legitimately NAMES the three field names once, pointing readers at §8.1a for the
    // derivation -- what it must not contain is the derivation itself: the remainder lane,
    // the pool/queue rule, or an assignment of any of the three.
    expect(section36a).not.toMatch(/remainder lane/i);
    expect(section36a).not.toMatch(/pool.*lane.*concurrency|queue.*lane.*concurrency/is);
    expect(section36a).not.toMatch(/no lane at all/i);
    expect(section36a).not.toMatch(/createCommand: ""/);
  });
});

// ---------------------------------------------------------------------------
// Both dispatch blocks: 22 fields, same order.
// ---------------------------------------------------------------------------

function extractDispatchFields(source) {
  const match = source.match(/Workflow\(\{ name: "verify-functional", args: \{([\s\S]*?)\} \}\)/);
  if (!match) return null;
  return match[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[,:]/))
    .filter(Boolean)
    .map((m) => m[1]);
}

describe('both dispatch blocks carry the same 23 fields in the same order (VSET-B002/B003, D8)', () => {
  test('implement-trd.md §8.3 lists 23 fields ending in checks/checkComments/pagesDir', () => {
    const fields = extractDispatchFields(read(CORE_IMPLEMENT));
    expect(fields).not.toBeNull();
    expect(fields).toHaveLength(23);
    expect(fields.slice(-3)).toEqual(['checks', 'checkComments', 'pagesDir']);
  });

  test('verify-build.md §4 lists the identical 23 fields in the identical order', () => {
    const implFields = extractDispatchFields(read(CORE_IMPLEMENT));
    const vbFields = extractDispatchFields(read(CORE_VERIFY_BUILD));
    expect(vbFields).toEqual(implFields);
  });

  test('verify-build.md §4 intro says 23 fields, not 22, 21 or 18', () => {
    expect(read(CORE_VERIFY_BUILD)).toMatch(/All 23 fields/);
    expect(read(CORE_VERIFY_BUILD)).not.toMatch(/All 22 fields/);
    expect(read(CORE_VERIFY_BUILD)).not.toMatch(/All 21 fields/);
    expect(read(CORE_VERIFY_BUILD)).not.toMatch(/All 18 fields/);
  });
});

// ---------------------------------------------------------------------------
// §8.1b (verification-artifacts TRD §3.5): the check-criteria step, its position, and
// what it must and must not touch on either side.
// ---------------------------------------------------------------------------

describe('implement-trd.md §8.1b appends check criteria in the right place, doing the right things', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('§8.1b sits after §8.1 and before §8.2 and §8.1a', () => {
    const text = src();
    const i81 = text.indexOf('### 8.1 Resolve the definition');
    const i81b = text.indexOf('### 8.1b Append the check criteria');
    const i82 = text.indexOf('### 8.2 The `--resume` composition');
    const i81a = text.indexOf('### 8.1a Resolve criteria to environments and lanes');
    expect(i81).toBeGreaterThan(-1);
    expect(i81b).toBeGreaterThan(-1);
    expect(i82).toBeGreaterThan(-1);
    expect(i81a).toBeGreaterThan(-1);
    expect(i81b).toBeGreaterThan(i81);
    expect(i82).toBeGreaterThan(i81b);
    expect(i81a).toBeGreaterThan(i81b);
  });

  test('§8.1b reads the section, selects with defaults, and honours a stated reason', () => {
    const text = src();
    const section = text
      .split('### 8.1b Append the check criteria')[1]
      .split('### 8.2 The `--resume` composition')[0];
    expect(section).toMatch(/## Verification Artifacts/);
    expect(section).toMatch(/Omitted:|None apply/);
    expect(section).toMatch(/DECISIONS/);
    expect(section).toMatch(/SKILL\.md/);
    expect(section).toMatch(/packages\/skills\//);
  });

  test('§8.1b regenerates check: rows and leaves derived rows untouched', () => {
    const text = src();
    const section = text
      .split('### 8.1b Append the check criteria')[1]
      .split('### 8.2 The `--resume` composition')[0];
    expect(section).toMatch(/verbatim/);
    expect(flat(section)).toMatch(/Tier 1.*Parts|Parts.*Tier 1/i);
  });

  test('§8.1b reads page comments via a deferred ArtifactComments tool, never STUCK on failure', () => {
    const text = src();
    const section = text
      .split('### 8.1b Append the check criteria')[1]
      .split('### 8.2 The `--resume` composition')[0];
    expect(section).toMatch(/ArtifactComments/);
    expect(section).toMatch(/deferred tool/);
    expect(section).toMatch(/checkComments: \[\]/);
    expect(flat(section)).toMatch(/never STUCK/);
  });

  test('§8.2 names §8.1b and filters resume.criteria (unknown IDs, commented criteria)', () => {
    const text = src();
    const section82 = text
      .split('### 8.2 The `--resume` composition')[1]
      .split('### 8.1a Resolve criteria to environments and lanes')[0];
    expect(section82).toMatch(/§8\.1b/);
    expect(flat(section82)).toMatch(/remove from (its|`resume\.criteria`).*(entry|criteria).*not present|not.*regenerated definition/i);
    expect(section82).toMatch(/owner comment/);
  });

  test("§8.1's two not-run exits still continue to Step 9 and do not name §8.1b", () => {
    const text = src();
    const section81 = text
      .split('### 8.1 Resolve the definition')[1]
      .split('### 8.1b Append the check criteria')[0];
    const noSourceExit = section81.split('Skip the rest of this step')[1] || '';
    expect(section81).toMatch(/continue to Step 9/);
    expect(section81).not.toMatch(/§8\.1b/);
  });

  test("Step 8's opening sentence scopes TRD reads to §8.1b (verification-artifacts TRD §3.5)", () => {
    const text = src();
    const step8 = flat(text.split('## Step 8: Functional Verification')[1].split('### 8.1 ')[0]);
    expect(step8).toMatch(/reads the TRD only at §8\.1b/);
    expect(step8).toMatch(/never mutates it/);
    expect(step8).toMatch(/never calls `Agent\(` directly/);
    expect(step8).not.toMatch(/never reads or mutates the TRD/);
  });

  test('§8.4 carries `pages` from the workflow return', () => {
    expect(src()).toMatch(/pages\s*\}/);
    expect(flat(src())).toMatch(/Carry `pages`/);
  });

  test('§9 STATE names each selected check and any TRD-omitted check with its reason', () => {
    expect(flat(src())).toMatch(/for each selected check.*verdict counts/i);
    expect(flat(src())).toMatch(/omitted an applicable check.*reason/i);
  });

  test('§9.0a publishes each check page under the same publishArtifacts switch and stores the URL under the skill name', () => {
    const section = flat(src().split('### 9.0a')[1].split('### 9.1')[0]);
    expect(section).toMatch(/publish each selected check's page/);
    expect(section).toMatch(/files:/);
    expect(section).toMatch(/Store the returned URL back under the skill's own name/);
  });
});

describe('verify-build.md 3b points at §8.1b, 3c at §8.1a', () => {
  const src = () => read(CORE_VERIFY_BUILD);

  test('step 3b is "Identical to /implement-trd §8.1b"', () => {
    expect(src()).toMatch(/### 3b\. .*\n\n\*\*Identical to `\/implement-trd` §8\.1b/);
  });

  test('the lane-resolution step is renumbered 3c and still names §8.1a', () => {
    expect(src()).toMatch(/### 3c\. Resolve criteria to environments and lanes/);
    expect(src()).not.toMatch(/### 3b\. Resolve criteria to environments and lanes/);
    const section = src().split('### 3c.')[1].split('### 4.')[0];
    expect(section).toMatch(/Identical to `\/implement-trd` §8\.1a/);
  });

  test('step 3\'s input list resolves lanes at 3c, not 3b', () => {
    const step3 = src().split('### 3. Read the inputs from disk')[1].split('### 3a.')[0];
    expect(step3).toMatch(/resolved at step 3c/);
    expect(step3).toMatch(/checks.*checkComments.*pagesDir.*step 3b/is);
  });

  test('§4 comments point exerciseLanes/refreshCommand/fullRunCommand at step 3c', () => {
    expect(src()).toMatch(/step 3c here/);
    expect(src()).not.toMatch(/step 3b here\).*verification\.md §1a/s);
  });

  test('the artifact-link section publishes pages too', () => {
    const section = flat(src().split('### Artifact link')[1]);
    expect(section).toMatch(/publish each selected check's page/);
    expect(section).toMatch(/identical to `\/implement-trd` §9\.0a/i);
  });
});

describe("command-status.md's artifacts.json keys sentence names the check-skill keys", () => {
  test('packages/core template names one key per verification-check skill', () => {
    expect(read(path.join(REPO, 'packages/core/templates/claude-directory/rules/command-status.md')))
      .toMatch(/one key per verification-check skill/);
  });

  test('.claude/rules/command-status.md matches it identically', () => {
    expect(read(path.join(REPO, '.claude/rules/command-status.md'))).toMatch(
      /one key per verification-check skill/
    );
  });
});

// ---------------------------------------------------------------------------
// §8.4 carries coverage + finalRun; ISSUES gets a failed full run.
// ---------------------------------------------------------------------------

describe('§8.4 / Step 9 readout carries coverage and finalRun', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('the Workflow return type carries coverage and finalRun', () => {
    expect(src()).toMatch(/coverage.*finalRun|finalRun.*coverage/s);
  });

  test('a failed final full run appears under ISSUES', () => {
    // "ISSUES" also names the readout section in the format legend above the template
    // itself, so take the LAST occurrence -- the actual template block -- not the first.
    const occurrences = src().split('ISSUES');
    const issuesSection = occurrences[occurrences.length - 1] || '';
    expect(flat(issuesSection)).toMatch(/final.*full.*run|full.*environment.*run/i);
  });
});

// ---------------------------------------------------------------------------
// insufficient-coverage is plumbed through every consumer named in the task.
// ---------------------------------------------------------------------------

describe('insufficient-coverage is a fifth terminal outcome everywhere it is enumerated', () => {
  test('implement-trd.md §3.6 terminality list names all five, still gated on non-null', () => {
    const src = read(CORE_IMPLEMENT);
    expect(src).toMatch(/`satisfied`,\s*\n?`?unbuilt`,\s*\n?`?stalled`,\s*\n?`?stuck`,\s*\n?`?insufficient-coverage`/);
    expect(src).toMatch(/[Rr]ead `outcome` and nothing else/);
    expect(src).toMatch(/A non-null `outcome`/);
  });

  test('implement-trd.md §9 renders insufficient-coverage as a sentence, not a glyph', () => {
    expect(read(CORE_IMPLEMENT)).toMatch(/insufficient-coverage/);
  });

  test('verify-build.md §5 outcome list names all five', () => {
    const src = read(CORE_VERIFY_BUILD);
    expect(src).toMatch(/satisfied.*unbuilt.*stalled.*stuck.*insufficient-coverage/);
  });

  test('verify-build.md --resume section says "five" outcome strings, not "four"', () => {
    const src = read(CORE_VERIFY_BUILD);
    expect(src).toMatch(/five outcome strings/);
    expect(src).not.toMatch(/four outcome strings/);
  });
});

// ---------------------------------------------------------------------------
// The flip: --verify defaults ON, --no-verify opts out.
// ---------------------------------------------------------------------------

describe('the --verify default flip', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('frontmatter argument-hint carries --no-verify', () => {
    const frontmatter = src().split('---')[1];
    expect(frontmatter).toMatch(/--no-verify/);
  });

  test('the Arguments section documents --no-verify as the opt-out', () => {
    expect(src()).toMatch(/`--no-verify`.*[Oo]pt out/s);
  });

  test('the Parse line mentions --no-verify', () => {
    // The paragraph starting "Parse:" may wrap across lines -- take it up to the next
    // blank line rather than assuming it is a single physical line.
    const paragraph = src().split('Parse: TRD path')[1].split(/\n\n/)[0];
    expect(paragraph).toMatch(/--no-verify/);
  });

  test('every "only when --verify is set" gate is gone; gates read --no-verify instead', () => {
    expect(src()).not.toMatch(/Only when `--verify` is set/);
    expect(flat(src())).toMatch(/skipped only when `--no-verify` is set/i);
  });

  test('the (--verify not set) banner literal is replaced by (--no-verify set)', () => {
    expect(src()).not.toMatch(/--verify not set/);
    expect(src()).toMatch(/--no-verify set/);
  });

  test('§9.0a publishes the report unless --no-verify was used, not "if --verify used"', () => {
    const artifactSection = src().split('### 9.0a')[1].split('### 9.1')[0];
    expect(artifactSection).toMatch(/--no-verify/);
  });

  test('no remaining prose claims the loop is opt-in', () => {
    expect(src()).not.toMatch(/Opt in to the functional-verification pass/);
  });
});

describe('§3.6 step 0 is the one gate that must NOT flip', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('step 0 requires an EXPLICIT --verify alongside --resume', () => {
    const stepZero = src().split('The `--resume` composition gate')[1].slice(0, 2000);
    expect(stepZero).toMatch(/EXPLICIT `--verify`/);
  });

  test('a bare --resume still runs the whole phase loop even with the default flip', () => {
    expect(src()).toMatch(/bare `\/implement-trd --resume`/);
  });

  test('"--resume without --verify keeps its existing meaning" still reads true', () => {
    expect(flat(src())).toMatch(/without an explicit `--verify` keeps its existing meaning/);
  });
});

describe('verify-build.md "Why this exists separately" is rewritten for a default-on loop', () => {
  const src = () => read(CORE_VERIFY_BUILD);

  test('no longer frames the ordinary case as a run made WITHOUT --verify', () => {
    expect(src()).not.toMatch(/implementation ran \*\*without\*\* `--verify`/);
    expect(src()).toMatch(/`--no-verify`/);
  });

  test('mentions the now-default verification pass', () => {
    expect(src()).toMatch(/default/i);
  });
});

describe('fix-plan.js is untouched (VCON-B009 grounding: leave this call site alone)', () => {
  test('fix-plan.js still passes an explicit --verify in chainArgs', () => {
    const fixPlan = read(path.join(REPO, 'packages/core/lib/fix-plan.js'));
    expect(fixPlan).toMatch(/--verify/);
  });
});

// ---------------------------------------------------------------------------
// process docs learn the flip too (both copies, same lines).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// VFIX-B004: `--chained` mode (verification-fix-loop TRD §3.3, D2). Only the contracts
// another file or script depends on are held here: the flag is declared where
// /verify-build --fix's chained invocation reaches it, the §3.7 section exists ahead of
// Step 4, and the RETURN lines /verify-build --fix waits for keep their shape.
// ---------------------------------------------------------------------------

describe('implement-trd.md declares --chained for its caller', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('frontmatter argument-hint carries --chained', () => {
    const frontmatter = src().split('---')[1];
    expect(frontmatter).toMatch(/--chained/);
  });

  test('the §3.7 `--chained` mode section exists, before Step 4', () => {
    const text = src();
    const i37 = text.indexOf("### 3.7 `--chained` mode");
    const i4 = text.indexOf('## Step 4: Main Execution Loop');
    expect(i37).toBeGreaterThan(-1);
    expect(i4).toBeGreaterThan(i37);
  });

  test('§3.7 states the RETURN line shapes /verify-build waits for', () => {
    const section = flat(
      src().split("### 3.7 `--chained` mode")[1].split('## Step 4: Main Execution Loop')[0]
    );
    expect(section).toMatch(
      /\[STATUS: \/implement-trd\] RETURN → chained by <caller: \/verify-build or \/audit-build>: <n> of <m> tasks built/
    );
    expect(section).toMatch(/RETURN → STUCK: <reason>/);
  });
});

// Step 9's NEXT line must read exactly as renderReport() writes it
// (functional-verification.js), so the readout and the report never disagree.
describe('Step 9 readout NEXT matches renderReport\'s wording (O4)', () => {
  test('non-satisfied branch: NEXT names /refine-verification then /verify-build', () => {
    const text = read(CORE_IMPLEMENT);
    const step9 = flat(text.split('## Step 9: Completion')[1].split('### 9.0a')[0]);
    expect(step9).toMatch(
      /refine the plan with `\/refine-verification`.*then run `\/verify-build`/
    );
  });

  test('satisfied branch: NEXT names /audit-build', () => {
    const text = read(CORE_IMPLEMENT);
    const step9 = flat(text.split('## Step 9: Completion')[1].split('### 9.0a')[0]);
    expect(step9).toMatch(/\/audit-build <trd> --prd <prd>/);
  });
});

describe('process docs describe the new default', () => {
  test('packages/core/templates/process.md.template documents --no-verify', () => {
    expect(read(CORE_PROCESS_TEMPLATE)).toMatch(/`--no-verify`/);
  });

  test('.claude/rules/process.md documents --no-verify identically', () => {
    expect(read(CLAUDE_PROCESS)).toMatch(/`--no-verify`/);
  });

  test('the Staged Execution Loop diagram no longer gates the functional loop as [--verify: ...]', () => {
    expect(read(CORE_PROCESS_TEMPLATE)).not.toMatch(/\[--verify: functional loop\]/);
    expect(read(CLAUDE_PROCESS)).not.toMatch(/\[--verify: functional loop\]/);
  });
});

// ---------------------------------------------------------------------------
// VFIX-B005: verify-build.md's `--fix [plan-path]` outer loop (verification-fix-loop
// TRD §3.6). Held: the flag is declared, the NEXT line matches renderReport(), and the
// names/shapes `--fix` shares with code or with implement-trd.md (the chained flag, the
// decide-fix-round CLI subcommand, discovered.js's record fields, verify-functional.js's
// resume snapshot fields).
// ---------------------------------------------------------------------------

describe('verify-build.md argument-hint', () => {
  test('argument-hint carries --no-fix and --fix [plan-path]', () => {
    expect(read(CORE_VERIFY_BUILD)).toMatch(
      /argument-hint: "\[trd-path\] \[--resume\] \[--cap N\] \[--no-fix\] \[--fix \[plan-path\]\] \[--chained\]"/
    );
  });
});

describe('verify-build.md readout NEXT matches renderReport\'s wording (O4)', () => {
  test('non-satisfied branch: NEXT names /refine-verification then /verify-build', () => {
    const section = flat(read(CORE_VERIFY_BUILD).split('## Readout')[1].split("## `--fix")[0]);
    expect(section).toMatch(
      /refine the plan with `\/refine-verification`.*then run `\/verify-build`/
    );
  });

  test('satisfied branch: NEXT names /audit-build', () => {
    const section = flat(read(CORE_VERIFY_BUILD).split('## Readout')[1].split("## `--fix")[0]);
    expect(section).toMatch(/outcome `satisfied` → `\/audit-build`/);
  });
});

describe('verify-build.md `--fix` uses the names code and implement-trd.md define', () => {
  const fixSection = () =>
    flat(read(CORE_VERIFY_BUILD).split("### The fix loop (default when a plan exists")[1].split('## Output discipline')[0]);

  test('chains /implement-trd with the --chained flag it declares', () => {
    expect(fixSection()).toMatch(/--reconcile --chained/);
  });

  test('invokes functional-verification.js\'s decide-fix-round subcommand', () => {
    expect(fixSection()).toMatch(/decide-fix-round --file <payload>/);
  });

  test('discovery records use discovered.js\'s field names', () => {
    const s = fixSection();
    expect(s).toMatch(/kind: 'gap', foundBy: 'verify-build --fix', blocksFeature: true, ref: 'plan:<id>'/);
    expect(s).toMatch(/kind: 'gap', blocksFeature: false, file: '\.claude\/rules\/verification\.md'/);
  });

  test('the synthesised resume uses verify-functional.js\'s snapshot fields', () => {
    expect(fixSection()).toMatch(
      /iteration: 0, criteria: <the latest state file's entries with status\s*'met'>, gapsClosed: \[\]/
    );
  });
});

// ---------------------------------------------------------------------------
// pr-at-cycle-end FIX-003: the commands that end the cycle open the PR; merging stays the owner's.
// ---------------------------------------------------------------------------
describe('the cycle-ending commands open the pull request', () => {
  const auditBuild = flat(read(path.join(REPO, 'packages/core/commands/audit-build.md')));
  const closeFeature = flat(read(path.join(REPO, 'packages/core/commands/close-feature.md')));
  const implementTrd = flat(read(CORE_IMPLEMENT));
  const autonomy = read(path.join(REPO, '.claude/rules/autonomy.md'));

  test('audit-build.md and close-feature.md call pull-request.js ensure', () => {
    expect(auditBuild).toMatch(/pull-request\.js ensure/);
    expect(closeFeature).toMatch(/pull-request\.js ensure/);
  });

  test('both commands pass --expect-branch, so a PR never opens from the wrong branch', () => {
    expect(auditBuild).toMatch(/pull-request\.js ensure[^`]*--expect-branch/);
    expect(closeFeature).toMatch(/pull-request\.js ensure[^`]*--expect-branch/);
  });

  test('audit-build.md ties the PR to --report-only being absent', () => {
    expect(auditBuild).toMatch(/Open the pull request\.\*\* Only when .*the run is not `--report-only`/);
  });

  // WHEN the PR opens: each condition below is a regex over the shipped command text, so
  // removing the wording from the command file fails the matching assertion.
  test('close-feature.md opens the PR only after a successful close commit, never on the already-closed path', () => {
    expect(closeFeature).toMatch(/\*\*Open the pull request\*\* after a successful close commit/);
    expect(closeFeature).toMatch(/The "already closed" path opens nothing\./);
  });

  test('audit-build.md opens the PR only when the audit commit succeeded', () => {
    expect(auditBuild).toMatch(/Open the pull request\.\*\* Only when [^.]*the audit commit above succeeded/);
    expect(auditBuild).toMatch(/No audit commit, no PR\./);
  });

  test('NEXT says to merge the PR in words, with no gh or git command in its paragraph', () => {
    for (const doc of [auditBuild, closeFeature]) {
      expect(doc).not.toMatch(/gh pr /);
      expect(doc).toMatch(/merge the PR once you\s+have reviewed it/);
    }
    const between = (doc, start, end) => {
      const from = doc.indexOf(start);
      expect(from).toBeGreaterThan(-1);
      const to = doc.indexOf(end, from);
      expect(to).toBeGreaterThan(from);
      return doc.slice(from, to);
    };
    expect(between(auditBuild, '**NEXT.** When `capReached`', ' --- ')).not.toMatch(/git (add|commit)/);
    expect(between(closeFeature, '- **NEXT**', 'Then the banner')).not.toMatch(/git (add|commit)/);
  });

  test('implement-trd.md says /audit-build opens the PR when openPullRequest is auto', () => {
    expect(implementTrd).toMatch(/passing `\/audit-build` opens the PR when `ensemble\.openPullRequest` is `auto`/);
  });

  test('autonomy.md names openPullRequest', () => {
    expect(autonomy).toMatch(/openPullRequest/);
  });
});

// ---------------------------------------------------------------------------
// audit-convergence FIX-003: /audit-build chains the fix run itself, and a deterministic
// decision (audit-rounds.js decide) owns whether to re-audit or close.
// ---------------------------------------------------------------------------
describe('audit-build owns the fix run and the round decision', () => {
  const auditBuild = flat(read(path.join(REPO, 'packages/core/commands/audit-build.md')));
  const implementTrd = read(CORE_IMPLEMENT);
  const section37 = implementTrd.slice(implementTrd.indexOf('### 3.7 `--chained` mode'), implementTrd.indexOf('### 3.7 `--chained` mode') + 4000);

  test('names audit-rounds.js decide, stale-wake and the chained reconcile call', () => {
    expect(auditBuild).toMatch(/audit-rounds\.js decide/);
    expect(auditBuild).toMatch(/stale-wake/);
    expect(auditBuild).toMatch(/--reconcile --chained/);
  });

  test('no longer requires "nothing is chained" to close', () => {
    expect(auditBuild).not.toMatch(/nothing is chained to `\/implement-trd --reconcile` on this run/);
  });

  test('uncovered items are never chained', () => {
    expect(auditBuild).toMatch(/Uncovered items[^.]*are never recorded for the fix run or chained/);
  });

  // audit-convergence AMEND-003: owner rulings 2026-10-01.
  test('a capped feature stays open and NEXT is /close-feature, never /audit-build', () => {
    expect(auditBuild).toMatch(/`capReached` true: \*\*the feature stays open\./);
    expect(auditBuild).toMatch(/`\/close-feature docs\/TRD\/<feature>\.md` alone in its fenced block; never `\/audit-build`/);
    expect(auditBuild).not.toMatch(/closes with a caveat\.?\s*$/m);
  });

  test('records outOfScope items as non-blocking discoveries and never chains them', () => {
    expect(auditBuild).toMatch(/`outOfScope` list/);
    expect(auditBuild).toMatch(/foundBy: "audit-build", blocksFeature: false/);
    expect(auditBuild).toMatch(/never a finding and never chained/);
  });

  test('computes trdHash over Objectives and Master Task List only', () => {
    expect(auditBuild).toMatch(/`trdHash` covers only the TRD's `## Objectives` and `## Master Task List` sections/);
    expect(auditBuild).toMatch(/node \.claude\/lib\/audit-rounds\.js trd-hash '\{"trd":"<trd-path>"\}'/);
  });

  test('test gaps are fixed but never block closing or trigger a re-audit', () => {
    expect(auditBuild).toMatch(/Test gaps are fixed in the fix pass, but they never block closing and never trigger a re-audit/);
  });

  // audit-convergence AMEND-004 (audit round 1 test gap, O3): the command half of re-audit
  // reuse, and the other ledger instructions in the same section, had no assertion.
  test('a re-audit passes previous and trdHash to the workflow', () => {
    expect(auditBuild).toMatch(/trdHash: "<the trdHash, computed as below>", previous: <on a re-audit only: \{ reportPath, auditedCommit, index, trdHash \}>/);
    expect(auditBuild).toMatch(/`\{ reportPath: "\.trd-state\/<feature>\/audit-build-report\.md", auditedCommit, index, trdHash \}`/);
    expect(auditBuild).toMatch(/taking `auditedCommit` and `trdHash` from the last ledger round and `index` from `\.trd-state\/<feature>\/audit-index\.json`/);
  });

  test('records each round to the ledger and the index to audit-index.json', () => {
    expect(auditBuild).toMatch(/audit-rounds\.js tally '\{"handoff":/);
    expect(auditBuild).toMatch(/audit-rounds\.js record '\{"stateDir":"\.trd-state\/<feature>","round":\{"round":<n>,"runId":"<run id>","auditedCommit":/);
    expect(auditBuild).toMatch(/write the workflow's returned `index` to `\.trd-state\/<feature>\/audit-index\.json` \(overwritten each round\)/);
  });

  test('every fallback wake-up carries the run id and re-entry checks stale-wake by run id', () => {
    expect(auditBuild).toMatch(/Every fallback `ScheduleWakeup` this command schedules carries the workflow run id in its prompt/);
    expect(auditBuild).toMatch(/stale-wake '\{"stateDir":"\.trd-state\/<feature>","runId":"<run id>"\}'/);
  });

  test('implement-trd.md section 3.7 names /audit-build as a caller of --chained', () => {
    expect(flat(section37)).toMatch(/`\/audit-build` runs the fix/);
    expect(flat(section37)).toMatch(/`\/verify-build`'s fix loop and `\/audit-build` pass it/);
  });

  test('the mirrors are byte-identical', () => {
    expect(read(path.join(REPO, '.claude/commands/audit-build.md'))).toBe(read(path.join(REPO, 'packages/core/commands/audit-build.md')));
    expect(read(CLAUDE_IMPLEMENT)).toBe(read(CORE_IMPLEMENT));
  });
});

describe('implement-trd section 2.1a: audit-promoted tasks fix the class', () => {
  const t = read(CORE_IMPLEMENT);
  const i = t.indexOf('### 2.1a Handle --reconcile');
  const sec = flat(t.slice(i, t.indexOf('### 2.2 ', i)));

  test('names fixing every instance across touched files and listing each', () => {
    expect(sec).toMatch(/find and fix every instance of this weakness across the feature's touched files, and list each one fixed/);
  });
});

// ---------------------------------------------------------------------------
// verification-reuses-evidence FIX-004: [LIVE] tasks record evidence for the loop, the loop is
// handed it, and the authoring rules no longer claim [LIVE] tasks are set aside by default.
// ---------------------------------------------------------------------------

describe('[LIVE] tasks feed the verification loop (verification-reuses-evidence)', () => {
  const CORE_TRD_AUTHORING = path.join(REPO, 'packages/core/contracts/trd-authoring.md');
  const CORE_CREATE_TRD = path.join(REPO, 'packages/core/commands/create-trd.md');
  const CORE_CONTRACT = path.join(REPO, 'packages/core/contracts/functional-verification.md');
  const impl = flat(read(CORE_IMPLEMENT));
  const sec35 = flat(read(CORE_IMPLEMENT).split('### 3.5 ')[1].split('\n### 3.6')[0]);

  test('§3.5 adds a [LIVE]-only element naming live-evidence.js record', () => {
    expect(sec35).toMatch(/task\.live/);
    expect(sec35).toMatch(/node \.claude\/lib\/live-evidence\.js record/);
    expect(sec35).toMatch(/evidence\/live\/\{task_id\}/);
    expect(sec35).toMatch(/--covers/);
  });

  test('§8.3 and verify-build.md pass liveEvidence, read from live-evidence.js read', () => {
    expect(impl).toMatch(/liveEvidence,\s+\/\/[^\n]*live-evidence\.js read/);
    expect(flat(read(CORE_VERIFY_BUILD))).toMatch(/liveEvidence,\s+\/\/[^\n]*live-evidence\.js read/);
  });

  test('§8.3 qualifies "produced by THIS run" and line 18 no longer calls [LIVE] deferred', () => {
    expect(impl).toMatch(/unless it qualifies for reuse/);
    expect(impl).not.toMatch(/\(`\[LIVE\]` etc\.\)/);
  });

  test('the contract names the reuse path in the freshness bullet and the evidence-stale row', () => {
    const c = flat(read(CORE_CONTRACT));
    expect(c).toMatch(/unless it qualifies for reuse/);
    expect(c).toMatch(/\| `evidence-stale` \|[^|]*reuse[^|]*\|/);
  });

  test.each([
    ['trd-authoring.md', CORE_TRD_AUTHORING],
    ['create-trd.md', CORE_CREATE_TRD],
  ])('%s says [LIVE] tasks record evidence in the live-evidence manifest', (_n, file) => {
    const t = flat(read(file));
    expect(t).toMatch(/live-manifest\.jsonl/);
    expect(t).not.toMatch(/already sets `\[LIVE\]` tasks aside by default/);
  });

  test('trd-authoring.md drops the false set-aside claim in §4.1.1', () => {
    expect(flat(read(CORE_TRD_AUTHORING))).not.toMatch(/sets `\[LIVE\]` tasks aside/);
  });

  test.each([
    ['contracts/functional-verification.md', 'contracts/functional-verification.md'],
    ['contracts/trd-authoring.md', 'contracts/trd-authoring.md'],
    ['commands/create-trd.md', 'commands/create-trd.md'],
  ])('%s mirrors byte for byte', (_n, rel) => {
    expect(read(path.join(REPO, '.claude', rel))).toBe(read(path.join(REPO, 'packages/core', rel)));
  });
});

// ---------------------------------------------------------------------------
// plan-from-spec FIX-002: the locked-scope authoring rule, conditional on `**Source spec**:`.
// ---------------------------------------------------------------------------

describe('trd-authoring.md locked-scope rule (plan-from-spec)', () => {
  const file = path.join(REPO, 'packages/core/contracts/trd-authoring.md');
  const raw = read(file);
  const afterOmission = raw.split('### Omission is a failure too')[1] || '';
  const ruleRaw = afterOmission.split('### Locked scope')[1];
  const rule = ruleRaw ? flat(ruleRaw.split('\n---')[0]) : '';
  const between = flat((afterOmission.split('### Locked scope')[0] || '').trim());

  test('sits right after "Omission is a failure too"', () => {
    expect(rule).not.toBe('');
    expect(afterOmission).toMatch(/### Locked scope/);
    expect(between).not.toMatch(/###/);
  });

  test('applies only when the TRD or its source carries Source spec:', () => {
    expect(rule).toMatch(/TRD, or the source it is authored from, carries a `\*\*Source spec\*\*:` header/);
    expect(rule).toMatch(/TRD without it, including every PRD-sourced TRD, is unchanged/);
    expect(rule).toMatch(/constitution- and domain-derived objectives/);
  });

  test('objectives are verbatim core criteria and guards with ids, no others', () => {
    expect(rule).toMatch(/verbatim with their ids/);
    expect(rule).toMatch(/guards/);
    expect(rule).toMatch(/no others/);
  });

  test('swept criteria go under Non-Goals', () => {
    expect(rule).toMatch(/Non-Goals/);
    expect(rule).toMatch(/handled by `\/sweep <file>`/);
  });

  test('a wrong-looking criterion is an owner-only open question quoting the spec line', () => {
    expect(rule).toMatch(/owner-only open question/);
    expect(rule).toMatch(/quoting the spec line/);
  });

  test('mirror is byte-identical', () => {
    expect(read(path.join(REPO, '.claude/contracts/trd-authoring.md'))).toBe(read(file));
  });
});

// ---------------------------------------------------------------------------
// next-in-order: NEXT is the few steps to take now, in order, never shell.
// ---------------------------------------------------------------------------

describe("command-status.md defines NEXT as ordered steps, one block per slash command", () => {
  const copies = [
    'packages/core/templates/claude-directory/rules/command-status.md',
    '.claude/rules/command-status.md',
  ];

  test.each(copies)('%s carries the ordered-steps, short and no-shell wording', (rel) => {
    const rule = read(path.join(REPO, rel)).replace(/\s+/g, ' ');
    expect(rule).toMatch(/few steps to take now/);
    expect(rule).toMatch(/in order/);
    expect(rule).toMatch(/one fenced block per slash command/i);
    expect(rule).toMatch(/never a shell command/);
    expect(rule).not.toMatch(/literal next command/);
  });

  test('the two copies are byte-identical', () => {
    expect(read(path.join(REPO, copies[0]))).toBe(read(path.join(REPO, copies[1])));
  });
});

// next-in-order (FIX-003): the two commands whose NEXT text caused the failure list steps in
// order, one fenced block per slash command, with no shell and no "name ONE".
describe('implement-trd.md and verify-build.md NEXT list ordered steps', () => {
  const implementNext = () => {
    const text = read(CORE_IMPLEMENT);
    const at = text.indexOf('\nNEXT\n');
    const end = text.indexOf('**Rules this template enforces', at);
    expect(at).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(at);
    return text.slice(at, end);
  };

  test('implement-trd.md carries no gh command and no single-command wording', () => {
    const text = read(CORE_IMPLEMENT);
    expect(text).not.toMatch(/gh pr /);
    expect(text).not.toMatch(/name ONE/);
    expect(text).not.toMatch(/single next command/);
  });

  test('implement-trd.md NEXT is ordered steps with the PR in words', () => {
    const next = flat(implementNext());
    expect(next).toMatch(/in order/);
    expect(next).toMatch(/passing `\/audit-build` opens the PR when `ensemble.openPullRequest` is `auto`/);
  });

  test('verify-build.md states the ordered fenced-steps rule and the first-step-as-text rule', () => {
    const section = flat(read(CORE_VERIFY_BUILD).split('## Readout')[1].split("## `--fix")[0]);
    expect(section).toMatch(/numbered steps/);
    expect(section).toMatch(/one fenced block per slash command/i);
    expect(section).toMatch(/must come first[^.]*plain text/i);
  });

  test.each([
    ['implement-trd.md', CORE_IMPLEMENT, CLAUDE_IMPLEMENT],
    ['verify-build.md', CORE_VERIFY_BUILD, CLAUDE_VERIFY_BUILD],
  ])('%s mirror is byte-identical', (_n, core, mirror) => {
    expect(read(mirror)).toBe(read(core));
  });
});

// ---------------------------------------------------------------------------
// plan-from-spec FIX-003: plan.md's spec path (locked criteria, sweep/core split, objectives
// written by the library after the last model writer, plan() told about the sweep list).
// ---------------------------------------------------------------------------

describe('plan.md spec path (plan-from-spec)', () => {
  const raw = read(CORE_PLAN);
  const specPath = flat((raw.split('### 2g.')[1] || '').split('\n---')[0]);
  const lockStep = flat((raw.split('## Step 6a')[1] || '').split('\n---')[0]);
  const step7 = flat((raw.split('## Step 7:')[1] || '').split('\n## Readout')[0]);

  test('sits at the end of Step 2, applies only when extract finds criteria', () => {
    expect(specPath).not.toBe('');
    expect(raw.indexOf('### 2g.')).toBeGreaterThan(raw.indexOf('### 2f.'));
    expect(raw.indexOf('### 2g.')).toBeLessThan(raw.indexOf('## Step 3:'));
    expect(specPath).toMatch(/spec-scope\.js extract --file <spec> --section "<section heading>"/);
    expect(specPath).toMatch(/`\[\]`[^.]*does not apply/);
  });

  test('the scope is locked: verbatim ids, nothing added, a wrong-looking one is an owner-only question', () => {
    expect(specPath).toMatch(/scope is locked/i);
    expect(specPath).toMatch(/verbatim with its id/);
    expect(specPath).toMatch(/nothing is added, reworded, merged, narrowed or widened/i);
    expect(specPath).toMatch(/owner-only open question quoting the spec line/);
  });

  test('the exit test passes prdWouldHaveContent false', () => {
    expect(specPath).toMatch(/prdWouldHaveContent: false/);
  });

  test('classifies by the owner\'s three conditions, in the owner\'s words', () => {
    expect(specPath).toContain(
      '"no file shared with the core, no dependency on it, no auth/data/shared-contract change"'
    );
    expect(specPath).toMatch(/independent low-risk finding/);
  });

  test('uncertain, guarded and open-question criteria stay in the core; guards sit outside the split', () => {
    expect(specPath).toMatch(/uncertain, guarded or open-question criteria stay in the core/i);
    expect(specPath).toMatch(/guards? (are|is) outside the split/i);
  });

  test('Step 4 weighs the core only', () => {
    expect(specPath).toMatch(/Step 4 weighs the core only/);
  });

  test('the sweep list is written by render-sweep, never typed', () => {
    expect(specPath).toMatch(/spec-scope\.js render-sweep --spec <spec> --section "<section heading>" --ids <swept ids> --core-trd docs\/TRD\/<slug>\.md --out docs\/plan\/<slug>\.sweep\.md/);
    expect(specPath).toMatch(/never types criterion text/);
  });

  test('the investigation record carries the Source spec header and lists only core criteria', () => {
    expect(specPath).toMatch(/investigation record[^.]*`\*\*Source spec\*\*: <spec path> § <section heading>`/);
    expect(specPath).toMatch(/lists only the core criteria/);
  });

  test('all swept: no TRD; all core: no sweep file', () => {
    expect(specPath).toMatch(/every criterion is swept[^.]*no TRD/i);
    expect(specPath).toMatch(/every criterion is core[^.]*no sweep file/i);
  });

  test('plan() is called with sweepList and coreTrd', () => {
    expect(specPath).toMatch(/`sweepList`/);
    expect(specPath).toMatch(/`coreTrd`/);
    expect(step7).toMatch(/"sweepList": true/);
    expect(step7).toMatch(/"coreTrd": true/);
    expect(step7).not.toMatch(/never chains/);
    expect(step7).toMatch(/With `--implement` and an empty brake it returns `chain: true` with `chainSkill: null`/);
  });

  test('Step 7 reads §5b on its own when there is no core TRD, and passes its status', () => {
    expect(step7).not.toMatch(/skip it and pass/);
    expect(step7).toMatch(/no core TRD[\s\S]{0,120}Read §5b on its own/);
    expect(step7).toMatch(/read-never-unattended \.claude\/rules\/verification\.md/);
    expect(step7).toMatch(/Pass its `status` as `neverUnattendedStatus`/);
  });

  describe('Step 7a: the sweep chain', () => {
    const chain = flat((raw.split('### Step 7a')[1] || '').split('\n## Readout')[0]);
    const idx = (re) => chain.search(re);
    // Guarded like `chain`: a reworded marker yields '' and fails the tests that read it,
    // instead of a TypeError at collection time that takes the whole suite down.
    const between = (start, end) => (chain.split(start)[1] || '').split(end)[0];
    const loop = between('**Loop.**', '**`fold-back`**');
    const fold = between('**`fold-back`**', '**`commit`.**');
    const commit = between('**`commit`.**', '**`stop`.**');

    test('switches to the feature branch before /sweep, then prints the handoff line', () => {
      expect(chain).not.toBe('');
      expect(chain).toMatch(/git switch feature\/<slug>\/impl 2>\/dev\/null \|\| git switch -c feature\/<slug>\/impl/);
      expect(idx(/\*\*Branch\.\*\*/)).toBeLessThan(idx(/\*\*Loop\.\*\*/));
      expect(chain).toMatch(/print `handoffLine`/);
    });

    test('sweepChainNext is the only sequencer and plan.md reads coreTrdExists, not fix-plan.js', () => {
      expect(chain).toMatch(/`sweepChainNext` in `fix-plan\.js` is the only sequencer/);
      expect(chain).toMatch(/Immediately before every call, check whether `docs\/TRD\/<slug>\.md` exists[^.]*`coreTrdExists`/);
      expect(chain).toMatch(/`fix-plan\.js` never looks/);
    });

    test('the call payload carries exactly the SWEEP_CHAIN_INPUTS keys', () => {
      const { SWEEP_CHAIN_INPUTS } = require('../lib/fix-plan');
      expect(chain).toMatch(/exactly the keys in `SWEEP_CHAIN_INPUTS`/);
      // Every key is named somewhere in the step, so the prose cannot drift from the list.
      for (const key of SWEEP_CHAIN_INPUTS.filter((k) => k !== 'after')) {
        expect(chain).toContain(key);
      }
      expect(chain).toContain('`after`');
    });

    test('--chained appears on the sweep and verify calls only', () => {
      expect(chain).toMatch(/those args are the only calls that carry `--chained`/);
      expect(chain).not.toMatch(/chainSteps\.implement[^.]*--chained/);
      const { plan } = require('../lib/fix-plan');
      const r = plan({ weight: 'small', route: 'plan', implement: true, kind: 'defect', slug: 's',
        sweepList: true, coreTrd: true, neverUnattendedHit: [], neverUnattendedStatus: 'none' });
      expect(r.chainSteps.sweep.args).toMatch(/--chained/);
      expect(r.chainSteps.verify.args).toMatch(/--chained/);
      expect(r.chainSteps.implement.args).not.toMatch(/--chained/);
    });

    test('state file must be newer than the step start; otherwise no outcome', () => {
      expect(chain).toMatch(/Before `\/verify-build`, record the time/);
      expect(chain).toMatch(/only if it is newer than the time recorded/);
      expect(chain).toMatch(/not newer is no outcome: pass `null`/);
      expect(chain).toMatch(/exactly `satisfied`/);
    });

    test('changed files compare status lines and content hashes with --untracked-files=all', () => {
      expect(chain).toMatch(/git status --porcelain --untracked-files=all/);
      expect(chain).toMatch(/git hash-object/);
      expect(chain).toMatch(/status line is new or different, or its `git hash-object` differs/);
      expect(chain).toMatch(/already dirty before the sweep[^.]*readout names it/);
    });

    test('fold-back runs in Step 6a order, once, and never re-runs /sweep', () => {
      expect(fold).not.toBe('');
      const order = [/render-sweep[^;]*--core-trd docs\/TRD\/<slug>\.md/, /task row and grounding block/,
        /`audit-trd` once more, at medium only/, /`render-objectives`/, /§5a\.1's checks/,
        /Step 6a's `check`/, /never-unattended check on the core TRD/];
      let at = -1;
      for (const re of order) {
        const m = fold.search(re);
        expect(m).toBeGreaterThan(at);
        at = m;
      }
      expect(fold).toMatch(/skipped when no sweep id remains/);
      expect(fold).toMatch(/at most once per run and never re-runs `\/sweep`/);
    });

    test('commit stages by pathspec, never git add -A, and skips when nothing is staged', () => {
      expect(commit).not.toBe('');
      expect(commit).toMatch(/git add -- <list>/);
      expect(commit).toMatch(/git commit -m "[^"]*" -- <list>/);
      expect(commit).toMatch(/never\s+`git add -A`/);
      expect(commit).not.toMatch(/git add -A`?\s+then/);
      expect(commit).toMatch(/git diff --cached --quiet -- <list>/);
      expect(commit).toMatch(/skip the commit/);
    });

    describe('the never-unattended brake in the chain', () => {
      test('commit runs the brake over the whole list, quoted, with the sweep file and sweep directory', () => {
        expect(commit).toMatch(/check-never-unattended --files "<changed,paths>,<sweep file>,\.trd-state\/<slug>-sweep\/" \.claude\/rules\/verification\.md/);
        expect(commit).toMatch(/run the brake over that whole list\*\*, not just the changed paths/);
      });

      test('commit runs the brake before git add and git commit', () => {
        const brake = commit.search(/check-never-unattended --files/);
        expect(brake).toBeGreaterThanOrEqual(0);
        expect(brake).toBeLessThan(commit.search(/git add --/));
        expect(brake).toBeLessThan(commit.search(/git commit -m/));
        expect(commit).toMatch(/\*\*Before `git add`, run the brake/);
      });

      test('a hit or an invalid status stages and commits nothing and ends COMMAND STUCK: /plan', () => {
        expect(commit).toMatch(/When `hits` is non-empty or `status` is `invalid`, do not stage or commit/);
        expect(commit).toMatch(/leave the fixes uncommitted/);
        expect(commit).toMatch(/print the readout naming the matched paths \(or the invalid list\)/);
        expect(commit).toMatch(/end with `COMMAND STUCK: \/plan`/);
        expect(commit).toMatch(/notify-complete\.sh "plan" "stuck"/);
        // the stop clause precedes the staging clause, so a hit never reaches git add
        expect(commit.search(/do not stage or commit/)).toBeLessThan(commit.search(/git add --/));
      });

      test('the changed-paths brake is scoped to the loop, quoted, and feeds sweepNeverUnattended*', () => {
        expect(loop).toMatch(/\*\*The brake over the changed paths\*\*/);
        expect(loop).toMatch(/check-never-unattended --files "<changed,paths>" \.claude\/rules\/verification\.md/);
        expect(loop).toMatch(/pass `hits` as `sweepNeverUnattendedHit` and `status` as `sweepNeverUnattendedStatus`/);
        expect(loop).toMatch(/Always quote the list: when the sweep changed nothing it is `--files ""`/);
        expect(loop).toMatch(/before `verify`'s and `fold-back`'s next call/);
      });

      test('fold-back runs the core-TRD brake and passes coreNeverUnattendedHit and Status', () => {
        expect(fold).toMatch(/check-never-unattended docs\/TRD\/<slug>\.md \.claude\/rules\/verification\.md/);
        expect(fold).toMatch(/passed as `coreNeverUnattendedHit` and `coreNeverUnattendedStatus`/);
      });
    });

    test('stop prints readout and banner and notifies; implement hands off and emits nothing', () => {
      expect(chain).toMatch(/\*\*`stop`\.\*\* Print the readout, then the returned `banner` and `bannerBody`, and run `\.claude\/hooks\/notify-complete\.sh "plan"/);
      expect(chain).toMatch(/\*\*`implement`\.\*\* Run the `implement` step's `Skill\(\)` and emit nothing after it/);
    });

    test('the "run is over" sentence applies to the implement step only', () => {
      expect(step7).toMatch(/after the `implement` step's `Skill\(\)`[^.]*returns, the run is over\. Emit nothing/);
      expect(step7).toMatch(/This applies to that step only/);
      expect(step7).not.toMatch(/when it does, the run is over/);
    });

    test('the generic chainSkill row is guarded against chainSkill: null', () => {
      expect(step7).toMatch(/when `chainSkill` is not `null`: `Skill\(\{ skill: chainSkill, args: chainArgs \}\)`/);
    });
  });

  test('Step 6a runs after audit-trd (medium) and after Step 6 (small), after the last model writer', () => {
    expect(lockStep).not.toBe('');
    expect(raw.indexOf('## Step 6a')).toBeGreaterThan(raw.indexOf('## Step 6:'));
    expect(raw.indexOf('## Step 6a')).toBeLessThan(raw.indexOf('## Step 7:'));
    expect(lockStep).toMatch(/after `audit-trd` at medium/);
    expect(lockStep).toMatch(/after Step 6's findings are applied at small/);
    expect(lockStep).toMatch(/last model writer/);
  });

  test('Step 6a runs render-objectives --trd and then check, and a failure stops the plan naming each problem', () => {
    expect(lockStep).toMatch(/spec-scope\.js render-objectives --spec <spec> --section "<section heading>" --ids <core ids> --trd docs\/TRD\/<slug>\.md/);
    const checkAt = lockStep.indexOf('spec-scope.js check');
    expect(checkAt).toBeGreaterThan(lockStep.indexOf('spec-scope.js render-objectives'));
    expect(lockStep).toMatch(/--sweep docs\/plan\/<slug>\.sweep\.md --trd docs\/TRD\/<slug>\.md/);
    expect(lockStep).toMatch(/COMMAND STUCK: \/plan/);
    expect(lockStep).toMatch(/naming each (problem|id)/);
  });

  test('Step 5b points at Step 6a before Step 7', () => {
    const fiveB = flat(raw.split('### 5b.')[1].split('## Step 6:')[0]);
    expect(fiveB).toMatch(/Step 6a/);
  });

  test('plan.md is still byte-identical to its mirror', () => {
    expect(read(CLAUDE_PLAN)).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// plan-from-spec FIX-004: /sweep keeps every criterion accounted for.
// ---------------------------------------------------------------------------

describe('sweep.md criterion accounting (plan-from-spec)', () => {
  const raw = read(path.join(path.dirname(CORE_PLAN), 'sweep.md'));
  const step = flat((raw.split('## Step 3a:')[1] || '').split('\n## Step 4')[0]);

  test('sits between attestation and recording, and applies only with criterion ids', () => {
    expect(step).not.toBe('');
    expect(raw.indexOf('## Step 3a:')).toBeGreaterThan(raw.indexOf('## Step 3:'));
    expect(raw.indexOf('## Step 3a:')).toBeLessThan(raw.indexOf('## Step 4:'));
    expect(step).toMatch(/without criterion ids skips this whole step/);
  });

  test('every id lands in fixed, already fine or failed; deferred or too-big is STUCK', () => {
    expect(step).toMatch(/exactly one of: fixed \(attested\), already fine, or failed/);
    expect(step).toMatch(/COMMAND STUCK: \/sweep[^.]*is not a sweep item[^.]*re-run `\/plan`/);
  });

  test('writes sweep-result.json mapping criterion id to changed files', () => {
    expect(step).toMatch(/\.trd-state\/<slug>-sweep\/sweep-result\.json/);
    expect(step).toMatch(/"fixed": \{ "AC-4\.1": \[/);
    expect(step).toMatch(/whether or not the run ends STUCK/);
  });

  test('runs overlap against the core TRD and stops on any shared file', () => {
    expect(step).toMatch(/spec-scope\.js overlap --sweep-files <every changed file, comma-separated> --trd <core TRD>/);
    expect(step).toMatch(/`\*\*Core TRD\*\*:` line/);
    expect(step).toMatch(/Unless it is `none`/);
    expect(step).toMatch(/Any shared file ends the run `COMMAND STUCK: \/sweep`/);
  });

  test('sweep.md is byte-identical to its mirror', () => {
    expect(read(path.join(path.dirname(CLAUDE_PLAN), 'sweep.md'))).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// plan-sweep-chain FIX-003: /sweep --chained, called as a step of /plan --implement.
// ---------------------------------------------------------------------------

describe('sweep.md --chained (plan-sweep-chain)', () => {
  const raw = read(path.join(path.dirname(CORE_PLAN), 'sweep.md'));
  const step1 = flat(raw.split('## Step 1:')[1].split('\n## Step 2')[0]);
  const step3a = flat(raw.split('## Step 3a:')[1].split('\n## Step 4')[0]);
  const step4 = flat(raw.split('## Step 4:')[1].split('\n## Readout')[0]);
  const completion = flat(raw.split('## Completion signal')[1].split('\n## Autonomous')[0]);

  test('argument-hint lists --chained', () => {
    expect(raw.split('\n')[3]).toMatch(/^argument-hint:.*\[--chained\]/);
  });

  test('Step 1 strips --chained and --project before reading the list', () => {
    expect(step1).toMatch(/Strip the flags first\.\*\* Remove `--chained` and `--project <dir>`/);
    expect(step1).toMatch(/`<file> --chained` is not a readable path/);
  });

  test('--chained reads the fragments and hands them to the workflow', () => {
    expect(step1).toMatch(/read-never-unattended \.claude\/rules\/verification\.md/);
    expect(raw).toMatch(/fragments: \[/);
  });

  test('--chained keeps the read paths and defers items touching them; unchained passes no fragments', () => {
    expect(step1).toMatch(/Under `--chained`, read the owner's never-unattended fragments once/);
    expect(step1).toMatch(/and keep its `paths`/);
    expect(raw).toMatch(/fragments: \[<the `paths` list, under --chained only>\]/);
    expect(flat(raw)).toMatch(/With `fragments`, triage and every fixer are told to defer any item whose fix would touch a path containing one; leave it out without `--chained`/);
  });

  test('Step 3a always writes notSweepItems and overlap; chained records instead of STUCK', () => {
    expect(step3a).toMatch(/"notSweepItems": \["AC-4\.3"\]/);
    expect(step3a).toMatch(/"overlap": \{ "AC-4\.2": \["src\/shared\.ts"\] \}/);
    expect(step3a).toMatch(/always written, empty when there are none/);
    expect(step3a).toMatch(/Under `--chained` it does not end the run/);
    expect(step3a).toMatch(/Under `--chained`\*\* record each in `overlap`/);
  });

  test('the STUCK wording still applies without --chained', () => {
    expect(step3a).toMatch(/end the run `COMMAND STUCK: \/sweep` with the reason "`<id>` is not a sweep item/);
    expect(step3a).toMatch(/Any shared file ends the run `COMMAND STUCK: \/sweep`/);
  });

  test('Step 4 records no discovery for folded ids', () => {
    expect(step4).toMatch(/Under `--chained`, skip the ids listed in `notSweepItems` or `overlap`/);
  });

  test('chained ends on the RETURN line with no banner and no notify-complete.sh', () => {
    expect(completion).toMatch(/Under `--chained`\*\* there is no banner and no `notify-complete\.sh`/);
    expect(completion).toContain(
      '[STATUS: /sweep] RETURN → <n> fixed, <n> already fine, <n> not sweep items, <n> overlapping, <n> failed'
    );
    // the unchained banner and notify call are still there
    expect(completion).toMatch(/Without `--chained`:/);
    expect(completion).toContain('COMMAND COMPLETE: /sweep');
    expect(completion).toContain('notify-complete.sh "sweep" "complete"');
  });

  test('workflow mirror is byte-identical', () => {
    const core = read(path.join(REPO, 'packages/core/workflows/sweep.js'));
    expect(read(path.join(REPO, '.claude/workflows/sweep.js'))).toBe(core);
  });
});

// ---------------------------------------------------------------------------
// plan-from-spec FIX-005: a sweep file or a `**Source spec**:` TRD is verified from spec-scope
// criteria (never derived); a sweep file runs as <slug>-sweep, one iteration, no fix loop.
// ---------------------------------------------------------------------------

describe('verify-build.md verifies spec-sourced inputs without deriving', () => {
  const body = () => flat(read(CORE_VERIFY_BUILD));
  const step3a = () => body().split('### 3a.')[1].split('### 3b.')[0];

  test('both inputs write the definition with spec-scope.js criteria and skip the derive', () => {
    const s = step3a();
    expect(s).toMatch(/A spec-sourced input is never derived/);
    expect(s).toMatch(/a sweep file \(`\.sweep\.md`\), and a TRD whose header has a `\*\*Source spec\*\*: <path> § <section>` line/);
    expect(s).toMatch(/node \.claude\/lib\/spec-scope\.js criteria --spec <spec> --section <section> --ids <ids>/);
    expect(s).toMatch(/\*\*Source kind\*\*: spec/);
  });

  test('a sweep file runs as <slug>-sweep with cap 1 and prd set to the sweep file', () => {
    const s = step3a();
    expect(s).toMatch(/feature: "<slug>-sweep"`, `cap: 1`, `prd: <the sweep file's path>`/);
  });

  test('a sweep file skips the fix loop and never points at /refine-verification or /audit-build', () => {
    expect(step3a()).toMatch(/Skip the fix\s+loop entirely/);
    expect(step3a()).toMatch(/never point NEXT at `\/refine-verification` or `\/audit-build`/);
  });

  test('a sweep readout NEXT gives renderReport\'s steps as literal commands, core TRD from spec-scope.js source', () => {
    const readout = flat(body().split('## Readout')[1].split("## `--fix")[0]);
    expect(readout).toContain('node .claude/lib/spec-scope.js source --file <sweep file>');
    expect(readout).toContain(
      "\"commit the swept fixes, then build the core TRD named on the sweep file's `**Core TRD**:` line\""
    );
    expect(readout).toContain('`/implement-trd <coreTrd>`');
    expect(readout).toMatch(/When `coreTrd` is `none`, drop the `\/implement-trd` step/);
    expect(readout).toContain(
      '"re-run `/sweep <sweep file>` for the failed criteria, then `/verify-build <sweep file>`"'
    );
    expect(readout).toContain('Step 1 is `/sweep <sweep file>`, step 2 is `/verify-build <sweep file>`');
  });

  test('each met swept criterion is recorded in the CORE feature manifest, covering its changed files', () => {
    const s = step3a();
    expect(s).toMatch(/live-evidence\.js record --state-dir \.trd-state\/<core-slug>/);
    expect(s).toMatch(/--covers <that criterion's files from sweep-result\.json/);
    expect(s).toMatch(/sweep-result\.json/);
  });
});

// plan-sweep-chain FIX-004: `/verify-build <sweep file> --chained` is one step of /plan's run.
describe('verify-build.md --chained (sweep file only)', () => {
  const body = () => flat(read(CORE_VERIFY_BUILD));
  const section = () => body().split('## `--chained`')[1].split('## `--fix [plan-path]`')[0];

  test('flag is stripped before the path is read and honoured only for a sweep file', () => {
    const b = body();
    expect(b).toMatch(/Strip it from the arguments before reading the path/);
    expect(b).toMatch(/honoured \*\*only for a sweep file\*\*/);
    expect(section()).toMatch(/with a TRD the flag is ignored/);
  });

  test('Step 2 asks nothing under it: the default is taken and recorded as a verification.md need', () => {
    const step2 = body().split('### 2. Preflight')[1].split('### 3. Read')[0];
    expect(step2).toMatch(/Under `--chained`.*that one question is NOT asked either/);
    expect(section()).toMatch(/Asks nothing/);
    expect(section()).toMatch(/No `AskUserQuestion` reaches the owner/);
  });

  test('ends with the RETURN line carrying the outcome and met-of-total, and no banner or notification', () => {
    const s = section();
    expect(s).toContain('[STATUS: /verify-build] RETURN → <outcome>, <met> of <total> met');
    expect(s).toMatch(/No banner, no `notify-complete\.sh`, no `PushNotification`/);
    expect(s).toMatch(/exactly `satisfied`/);
  });

  test('the report is still written and the evidence carry-over still runs', () => {
    const s = section();
    expect(s).toMatch(/Still does the work/);
    expect(s).toMatch(/verification-report\.md/);
    expect(s).toMatch(/evidence step in 3a.*still runs/);
  });

  test('output discipline and autonomy sections defer to it', () => {
    const b = body();
    expect(b.split('## Output discipline')[1]).toMatch(/Under `--chained` \(a sweep file\) none of the rest of this section applies/);
    expect(b.split('## Autonomous-execution discipline')[1]).toMatch(/Under `--chained`, not even that/);
  });

  test('without the flag the banner and notify-complete.sh instructions are intact', () => {
    const b = read(CORE_VERIFY_BUILD);
    expect(b).toContain('═══ COMMAND COMPLETE: /verify-build ═══');
    expect(b).toContain('.claude/hooks/notify-complete.sh "verify-build" "complete"');
  });
});

describe('functional-verification contract lists the spec source kind', () => {
  test('Source kind includes spec', () => {
    const c = read(path.join(REPO, 'packages/core/contracts/functional-verification.md'));
    expect(c).toMatch(/\*\*Source kind\*\*: prd \| reproduction \| intended-change \| behaviour-preserved \| spec/);
  });
});

// ---------------------------------------------------------------------------
// plan-from-spec FIX-006: a `**Source spec**:` TRD gets its definition from spec-scope criteria
// (Objectives ids plus the sweep file's ids), source_kind "spec", and no derive agent.
// ---------------------------------------------------------------------------

describe('implement-trd.md writes a spec-sourced definition without deriving (plan-from-spec)', () => {
  const body = () => flat(read(CORE_IMPLEMENT));
  const step1 = () => body().split('**1. Resolve the PRD path**')[1].split('**2. Dispatch the derive pass')[0];

  test('the header check precedes the PRD fallbacks and applies only to a Source spec TRD', () => {
    const s = step1();
    expect(s).toMatch(/spec-scope\.js source --file <TRD>/);
    expect(s.indexOf('spec-scope.js source')).toBeLessThan(s.indexOf("1. Read the TRD's"));
    expect(s).toMatch(/applies \*\*only\*\* to a TRD with the `\*\*Source spec\*\*:` header/);
  });

  test('the library call carries Objectives ids plus the sweep file ids when it exists', () => {
    const s = step1();
    expect(s).toMatch(/spec-scope\.js criteria --spec <spec> --section <section> --ids <ids>/);
    expect(s).toMatch(/--out \.trd-state\/<feature>\/success-definition\.md/);
    expect(s).toMatch(/Objectives table, plus every id the sweep file lists when `docs\/plan\/<feature>\.sweep\.md` exists/);
  });

  test('records source_kind "spec" and skips the derive agent in that case only', () => {
    const s = step1();
    expect(s).toMatch(/source_kind: "spec"/);
    expect(s).toMatch(/skip step 2 and step 3's dispatch entirely\*\* \(no agent\)/);
    expect(body()).toMatch(/\(`prd` \| `spec` \| `reproduction`/);
  });

  test("swept criteria reuse evidence through §8.3's existing liveEvidence read", () => {
    expect(step1()).toMatch(/§8\.3's existing `liveEvidence` read/);
    expect(body()).toMatch(/liveEvidence,\s+\/\/ `node \.claude\/lib\/live-evidence\.js read/);
  });

  test('§8.1b reads the spec section as its source text for a spec source', () => {
    const s81b = body().split('### 8.1b')[1].split('### 8.2')[0];
    expect(s81b).toMatch(/For `source_kind: "spec"` the source text is the spec section/);
  });

  test('implement-trd.md mirror stays byte-identical', () => {
    expect(read(CLAUDE_IMPLEMENT)).toBe(read(CORE_IMPLEMENT));
  });
});

// AMEND-003: audit-docs.md's NEXT (and its Stuck-case Next text) says what to do in words;
// the push-and-PR command text belongs in STATE, never as a NEXT step.
describe('audit-docs.md NEXT carries no shell command', () => {
  const CORE_AUDIT_DOCS = path.join(REPO, 'packages/core/commands/audit-docs.md');
  const CLAUDE_AUDIT_DOCS = path.join(REPO, '.claude/commands/audit-docs.md');
  const nextBullet = () => {
    const readout = read(CORE_AUDIT_DOCS).split('\n## Readout')[1].split('\n## Output discipline')[0];
    const at = readout.indexOf('- **NEXT**');
    expect(at).toBeGreaterThan(-1);
    return flat(readout.slice(at));
  };

  test('the NEXT bullet names push and PR in words and has no git push / gh pr text', () => {
    const next = nextBullet();
    expect(next).toMatch(/push that branch and open a pull request/);
    expect(next).not.toMatch(/\bgit (push|switch|checkout|branch)\b/);
    expect(next).not.toMatch(/\bgh pr\b/);
  });

  test('STATE carries the printed push-and-PR command text', () => {
    const state = flat(read(CORE_AUDIT_DOCS).split('- **STATE**')[1].split('- **DECISIONS**')[0]);
    expect(state).toMatch(/push-and-PR command text/);
  });

  test('the stuck-case Next text gives no git command', () => {
    const text = read(CORE_AUDIT_DOCS);
    expect(text).not.toMatch(/\bgit (switch|checkout|branch -[dD])\b/);
  });

  test('mirror is byte-identical', () => {
    expect(read(CLAUDE_AUDIT_DOCS)).toBe(read(CORE_AUDIT_DOCS));
  });
});

// audit-docs-prd-handling FIX-005: the readout names skipped PRDs, the confirm list, broken
// non-goals and changelog defects, and the .claude/ copies of the command and libs match.
describe('audit-docs.md readout covers PRD handling', () => {
  const CORE_AUDIT_DOCS = path.join(REPO, 'packages/core/commands/audit-docs.md');
  const step7 = () => flat(read(CORE_AUDIT_DOCS).split('### 7. Read the outcome')[1].split('## Stuck cases')[0]);
  const readoutSection = (name, next) =>
    flat(read(CORE_AUDIT_DOCS).split('\n## Readout')[1].split(name)[1].split(next)[0]);

  test('step 7 collects behaviour changes, broken non-goals and changelog defects', () => {
    const text = step7();
    expect(text).toMatch(/behaviourChanges/);
    expect(text).toMatch(/brokenNonGoals/);
    expect(text).toMatch(/changelogDefects/);
    expect(text).toMatch(/skipped TRDs and PRDs/);
  });

  test('STATE names skipped PRDs in-flight and the old TRD-only wording is gone', () => {
    const state = readoutSection('- **STATE**', '- **DECISIONS**');
    expect(state).toMatch(/TRDs and PRDs skipped/);
    expect(state).toMatch(/in-flight/);
    expect(state).not.toMatch(/; TRDs skipped, with the reason/);
  });

  test('ISSUES carries the confirm list, because confirming is the owner\'s action, and STATE does not', () => {
    const issues = readoutSection('- **ISSUES**', '- **NEXT**');
    expect(issues).toMatch(/listed\s+to confirm/);
    expect(issues).toMatch(/behaviourChanges/);
    const state = readoutSection('- **STATE**', '- **DECISIONS**');
    expect(state).not.toMatch(/confirm/i);
  });

  test('ISSUES names broken non-goals and changelog defects', () => {
    const issues = readoutSection('- **ISSUES**', '- **NEXT**');
    expect(issues).toMatch(/non-goal/);
    expect(issues).toMatch(/brokenNonGoals/);
    expect(issues).toMatch(/changelog/);
    expect(issues).toMatch(/changelogDefects/);
  });

  test('libs are byte-identical to their .claude/ mirrors', () => {
    for (const f of ['assemble', 'apply', 'deliver']) {
      const name = `docs-audit-${f}.js`;
      expect(read(path.join(REPO, '.claude/lib', name))).toBe(read(path.join(REPO, 'packages/core/lib', name)));
    }
  });
});
