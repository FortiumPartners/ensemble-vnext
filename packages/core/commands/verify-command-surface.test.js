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

describe('both dispatch blocks carry the same 22 fields in the same order (VSET-B002/B003, D8)', () => {
  test('implement-trd.md §8.3 lists 22 fields ending in checks/checkComments/pagesDir', () => {
    const fields = extractDispatchFields(read(CORE_IMPLEMENT));
    expect(fields).not.toBeNull();
    expect(fields).toHaveLength(22);
    expect(fields.slice(-3)).toEqual(['checks', 'checkComments', 'pagesDir']);
  });

  test('verify-build.md §4 lists the identical 22 fields in the identical order', () => {
    const implFields = extractDispatchFields(read(CORE_IMPLEMENT));
    const vbFields = extractDispatchFields(read(CORE_VERIFY_BUILD));
    expect(vbFields).toEqual(implFields);
  });

  test('verify-build.md §4 intro says 22 fields, not 21 or 18', () => {
    expect(read(CORE_VERIFY_BUILD)).toMatch(/All 22 fields/);
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
      /\[STATUS: \/implement-trd\] RETURN → chained by \/verify-build: <n> of <m> tasks built/
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
      /argument-hint: "\[trd-path\] \[--resume\] \[--cap N\] \[--no-fix\] \[--fix \[plan-path\]\]"/
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

  test('NEXT offers gh pr merge, never a command that merges on its own', () => {
    expect(auditBuild).toMatch(/gh pr merge <number> --merge/);
    expect(closeFeature).toMatch(/gh pr merge <number> --merge/);
  });

  test('implement-trd.md says /audit-build opens the PR when openPullRequest is auto', () => {
    expect(implementTrd).toMatch(/passing `\/audit-build` opens the PR when `ensemble\.openPullRequest` is `auto`/);
  });

  test('autonomy.md names openPullRequest', () => {
    expect(autonomy).toMatch(/openPullRequest/);
  });
});
