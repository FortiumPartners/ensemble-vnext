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
});

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

  test('reports a prior-template digest match and its one-line consequence', () => {
    expect(src()).toMatch(/matchedTemplate/);
    expect(flat(src())).toMatch(/predates the resource \/ read-only \/ fast-refresh sections/i);
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
// Both dispatch blocks: 18 fields, same order, same new three appended.
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

describe('both dispatch blocks carry the same 21 fields in the same order', () => {
  test('implement-trd.md §8.3 lists 21 fields ending in checks/checkComments/pagesDir', () => {
    const fields = extractDispatchFields(read(CORE_IMPLEMENT));
    expect(fields).not.toBeNull();
    expect(fields).toHaveLength(21);
    expect(fields.slice(-3)).toEqual(['checks', 'checkComments', 'pagesDir']);
  });

  test('verify-build.md §4 lists the identical 21 fields in the identical order', () => {
    const implFields = extractDispatchFields(read(CORE_IMPLEMENT));
    const vbFields = extractDispatchFields(read(CORE_VERIFY_BUILD));
    expect(vbFields).toEqual(implFields);
  });

  test('verify-build.md §4 intro says 21 fields, not 18', () => {
    expect(read(CORE_VERIFY_BUILD)).toMatch(/All 21 fields/);
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
// VFIX-B004: `--chained` mode (verification-fix-loop TRD §3.3, D2).
// ---------------------------------------------------------------------------

describe('implement-trd.md documents --chained for callers only', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('frontmatter argument-hint carries --chained', () => {
    const frontmatter = src().split('---')[1];
    expect(frontmatter).toMatch(/--chained/);
  });

  test('the Arguments section says --chained is for callers only, never typed by hand', () => {
    const args = src().split('## User Input')[0];
    expect(args).toMatch(/--chained/);
    expect(flat(args)).toMatch(/[Ff]or callers only/);
    expect(flat(args)).toMatch(/never typed by hand/);
  });

  test('the Parse line mentions --chained', () => {
    const paragraph = src().split('Parse: TRD path')[1].split(/\n\n/)[0];
    expect(paragraph).toMatch(/--chained/);
  });

  test('§3.7 states every skip under --chained: derive pass, §3.6a preflight, Step 8, publish, banner, notify', () => {
    const text = src();
    const i37 = text.indexOf("### 3.7 `--chained` mode");
    const i4 = text.indexOf('## Step 4: Main Execution Loop');
    expect(i37).toBeGreaterThan(-1);
    expect(i4).toBeGreaterThan(i37);
    const section = flat(text.slice(i37, i4));
    expect(section).toMatch(/does not dispatch the derive pass/);
    expect(section).toMatch(/§3\.6a's environment preflight is skipped/);
    expect(section).toMatch(/no `AskUserQuestion`/);
    expect(section).toMatch(/Step 8 is skipped entirely/);
    expect(section).toMatch(/§9\.0a publishes nothing/);
    expect(section).toMatch(/No banner, no `notify-complete\.sh`, no `PushNotification`/);
  });

  test('§3.7 states the RETURN line shape for a normal chained return', () => {
    const text = src();
    const section = text
      .split("### 3.7 `--chained` mode")[1]
      .split('## Step 4: Main Execution Loop')[0];
    expect(section).toMatch(
      /\[STATUS: \/implement-trd\] RETURN → chained by \/verify-build --fix: <n> of <m> tasks built/
    );
  });

  test('§3.7 states the STUCK RETURN line and that the caller owns the run\'s banner', () => {
    const text = src();
    const section = flat(
      text.split("### 3.7 `--chained` mode")[1].split('## Step 4: Main Execution Loop')[0]
    );
    expect(section).toMatch(/RETURN → STUCK: <reason>/);
    expect(section).toMatch(/no banner/);
  });

  test('Step 10.1 says the STUCK box is never shown under --chained', () => {
    const text = src();
    const step10 = flat(text.split('## Step 10: Pause Conditions')[1].split('## Error Handling')[0]);
    expect(step10).toMatch(/[Uu]nder `--chained`.*never shown/);
    expect(step10).toMatch(/RETURN → STUCK/);
  });

  test('the RETURN line is documented as a sibling of DISPATCHED\\/RESUMED\\/PHASE', () => {
    const text = src();
    const section = flat(
      text.split("### 3.7 `--chained` mode")[1].split('## Step 4: Main Execution Loop')[0]
    );
    expect(section).toMatch(/sibling of the DISPATCHED\/RESUMED\/PHASE lines/);
  });
});

// ---------------------------------------------------------------------------
// VFIX-B004: §8.1b selects from framework-skills.txt's `check` rows, not three named skills.
// ---------------------------------------------------------------------------

describe('§8.1b selects checks from the one list, not three named skills', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('§8.1b step 2 reads framework-skills.txt\'s check rows', () => {
    const text = src();
    const section = text
      .split('### 8.1b Append the check criteria')[1]
      .split('### 8.2 The `--resume` composition')[0];
    expect(section).toMatch(/framework-skills\.txt/);
    expect(section).toMatch(/`check`-role rows|check.*rows of/i);
  });

  test('§8.1b no longer names the three skills literally as the selection source', () => {
    const text = src();
    const section = text
      .split('### 8.1b Append the check criteria')[1]
      .split('### 8.2 The `--resume` composition')[0];
    expect(section).not.toMatch(/For each of the three skills named in `trd-authoring\.md`/);
  });

  test('§8.1b still resolves each named skill\'s SKILL.md with the packages/skills fallback', () => {
    const text = src();
    const section = text
      .split('### 8.1b Append the check criteria')[1]
      .split('### 8.2 The `--resume` composition')[0];
    expect(section).toMatch(/SKILL\.md/);
    expect(section).toMatch(/packages\/skills\//);
  });
});

// ---------------------------------------------------------------------------
// VFIX-B004: Step 9's readout carries the Diagnosis counts and names the bridge.
// ---------------------------------------------------------------------------

describe('Step 9 readout carries the Diagnosis counts and names the bridge (O1)', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('STATE gains a Diagnosis line gated on the four non-satisfied outcomes', () => {
    const text = src();
    const step9 = flat(text.split('## Step 9: Completion')[1].split('### 9.0a')[0]);
    expect(step9).toMatch(/stalled\/stuck\/unbuilt\/insufficient-coverage/);
    expect(step9).toMatch(/\*\*Diagnosis\*\*/);
    expect(step9).toMatch(/descending by count/);
  });

  test('NEXT names the bridge then /verify-build --fix, in renderReport\'s exact wording', () => {
    const text = src();
    const step9 = flat(text.split('## Step 9: Completion')[1].split('### 9.0a')[0]);
    expect(step9).toMatch(
      /agree a recovery plan with `\/verify-plan-recovery`, then run `\/verify-build --fix`/
    );
  });
});

describe('the --verify flag text says what --resume re-enters (O8)', () => {
  const src = () => read(CORE_IMPLEMENT);

  test('the Arguments section says --resume re-enters only an interrupted (outcome: null) loop', () => {
    const args = src().split('## User Input')[0];
    expect(flat(args)).toMatch(/non-terminal.*outcome: null.*verification-state\.json/);
    expect(flat(args)).toMatch(/interrupted.*verification loop/);
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
// TRD §3.6), the Diagnosis/NEXT lines in the ordinary (no --fix) readout (O1), and the
// stale-wording corrections (O8).
// ---------------------------------------------------------------------------

describe('verify-build.md argument-hint and mutual exclusion', () => {
  test('argument-hint gains --fix [plan-path]', () => {
    expect(read(CORE_VERIFY_BUILD)).toMatch(
      /argument-hint: "\[trd-path\] \[--resume\] \[--cap N\] \[--fix \[plan-path\]\]"/
    );
  });

  test('--fix and --resume are refused together', () => {
    const section = flat(read(CORE_VERIFY_BUILD).split("## `--fix [plan-path]` and `--resume`")[1]);
    expect(section).toMatch(/refused together/);
    expect(section).toMatch(/stop before step 1/);
  });
});

describe('verify-build.md O8 stale-wording corrections', () => {
  const src = () => read(CORE_VERIFY_BUILD);

  test('the "crashed, stalled, or was interrupted" framing is gone', () => {
    expect(flat(src())).not.toMatch(/crashed, stalled, or was interrupted/);
  });

  test('a stalled run is pointed at --fix instead, and the case is stated as outcome: null', () => {
    const section = flat(src().split('## Why this exists separately')[1].split('## Steps')[0]);
    expect(section).toMatch(/crashed or was interrupted/);
    expect(section).toMatch(/outcome: null/);
    expect(section).toMatch(/stalled.*already finished.*--fix/is);
  });

  test('"never implements" is replaced with the chains-/implement-trd carve-out', () => {
    const section = flat(src().split('## Why this exists separately')[1].split('## Steps')[0]);
    expect(section).not.toMatch(/This command never implements\./);
    expect(section).toMatch(/never dispatches an implementer itself/);
    expect(section).toMatch(/under `--fix`.*chains `\/implement-trd`/is);
  });

  test('the --resume section states only met carries forward and the cap is a total budget', () => {
    const section = flat(src().split('### `--resume`')[1].split('### `--fix')[0]);
    expect(section).toMatch(/only the file's `met` entries carry forward/i);
    expect(section).toMatch(/not_verifiable.*unbuilt.*do not/is);
    expect(section).toMatch(/total budget across every resume/);
  });
});

describe('verify-build.md ordinary readout carries the Diagnosis and NEXT (O1)', () => {
  const src = () => read(CORE_VERIFY_BUILD);

  test('STATE gains a Diagnosis line gated on the four non-satisfied outcomes', () => {
    const section = flat(src().split('## Readout')[1].split("## `--fix")[0]);
    expect(section).toMatch(/stalled.*stuck.*unbuilt.*insufficient-coverage/);
    expect(section).toMatch(/Diagnosis line/);
    expect(section).toMatch(/descending by count/);
  });

  test('NEXT names the bridge then /verify-build --fix, in renderReport\'s exact wording', () => {
    const section = flat(src().split('## Readout')[1].split("## `--fix")[0]);
    expect(section).toMatch(
      /agree a recovery plan with `\/verify-plan-recovery`, then run `\/verify-build --fix`/
    );
  });
});

describe('verify-build.md step 3b unions the plan\'s Extra checks under --fix (D11)', () => {
  test('step 3b restricts the union to check-role skills', () => {
    const section = flat(
      read(CORE_VERIFY_BUILD).split('### 3b. Append the check criteria')[1].split('### 3c.')[0]
    );
    expect(section).toMatch(/Extra checks.*table into this selection/);
    expect(section).toMatch(/`check`-role skill/);
    expect(section).toMatch(/verify-plan-recovery.*reported in ISSUES/is);
  });
});

describe('verify-build.md `--fix` states every step of §3.6 in order', () => {
  const fixSection = () =>
    flat(read(CORE_VERIFY_BUILD).split("### `--fix [plan-path]`")[1].split('## Output discipline')[0]);

  test('step 0: plan rulings into notes, extra checks union, readStopRule, fix state init', () => {
    const s = fixSection();
    expect(s).toMatch(/Owner rulings \(verification-plan\.md\)/);
    expect(s).toMatch(/readStopRule\(planText\)/);
    expect(s).toMatch(/functional_verification\.fix = \{ plan, stopRule, rounds: \[\], stopped:\s*false \}/);
  });

  test('round 0: blockers recorded as discoveries, chained build, synthesised verify, no-plan single round', () => {
    const s = fixSection();
    expect(s).toMatch(/Round 0/);
    expect(s).toMatch(/kind: 'gap', ref: 'plan:<id>'/);
    expect(s).toMatch(/--reconcile --chained/);
    expect(s).toMatch(/Without a plan and with no terminal state file/);
    expect(s).toMatch(/a single round, exactly like today's plain run/);
  });

  test('round k >= 1: D4 buildable-cause filter and accepted-not-verifiable exclusion', () => {
    const s = fixSection();
    expect(s).toMatch(/judged-failed.*not-built/is);
    expect(s).toMatch(/Accepted as not verifiable.*ruling in the plan/is);
    expect(s).toMatch(/active slice/);
  });

  test('D13: a verification.md need is recorded as a non-blocking discovery, never edited', () => {
    const s = fixSection();
    expect(s).toMatch(/kind: 'gap', blocksFeature: false, file: '\.claude\/rules\/verification\.md'/);
    expect(s).toMatch(/never edits that file itself/);
  });

  test('D8: the synthesised resume carries only met entries at iteration 0', () => {
    const s = fixSection();
    expect(s).toMatch(/resume` synthesised instead of read/);
    expect(s).toMatch(/iteration: 0, criteria: <the latest state file's entries with status\s*'met'>, gapsClosed: \[\]/);
  });

  test('the per-round publish and comment read reuse the existing mechanisms', () => {
    const s = fixSection();
    expect(s).toMatch(/Publish the report and each\s*selected check's page/);
    expect(s).toMatch(/read comments on\s*each published check page/);
    expect(s).toMatch(/not a second one/);
  });

  test('the PHASE line and decide-fix-round CLI are named exactly', () => {
    const s = fixSection();
    expect(s).toMatch(/\[STATUS: \/verify-build\] PHASE\s*<k>\/<maxRounds> COMPLETE/);
    expect(s).toMatch(/decide-fix-round --file <payload>/);
  });

  test('exactly one banner for the whole run, never one per round', () => {
    const s = fixSection();
    expect(s).toMatch(/Exactly \*\*one\*\* `═══\s*COMMAND COMPLETE: \/verify-build ═══` banner for the whole run — never one per round/);
  });

  test('a STUCK chained return ends the whole run with no further round', () => {
    const s = fixSection();
    expect(s).toMatch(/RETURN → STUCK.*end the whole run now/is);
  });
});

describe('verify-build.md mirror stays byte-identical after --fix additions', () => {
  test('.claude/commands/verify-build.md matches packages/core exactly', () => {
    expect(read(CLAUDE_VERIFY_BUILD)).toBe(read(CORE_VERIFY_BUILD));
  });
});
