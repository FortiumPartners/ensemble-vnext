'use strict';

// VCON-B009: both command surfaces (implement-trd.md, verify-build.md, each with its
// .claude/ mirror) learn lanes/refresh/full-run derivation and insufficient-coverage, AND
// the --verify default flip. This suite asserts on the PROSE those two files carry, because
// the derivation itself is executed by a model reading these files, not by code (D5, D15;
// see docs/TRD/verification-convergence.md's "Could Not Verify": "Lane resolution is done by
// a model reading two tables (§3.6a)").
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
// The lane / refresh / full-run derivation (§3.6a)
// ---------------------------------------------------------------------------

describe('implement-trd.md §3.6a derives exerciseLanes/refreshCommand/fullRunCommand', () => {
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

describe('verify-build.md §2 points at the same derivation rather than duplicating it', () => {
  const src = () => read(CORE_VERIFY_BUILD);

  test('still points at §3.6a as identical', () => {
    expect(src()).toMatch(/Identical to `\/implement-trd` §3\.6a/);
  });

  test('names that the pointer now also covers lanes\\/refresh\\/full-run and the digest line', () => {
    expect(src()).toMatch(/exerciseLanes/);
    expect(src()).toMatch(/refreshCommand/);
    expect(src()).toMatch(/fullRunCommand/);
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

describe('both dispatch blocks carry the same 18 fields in the same order', () => {
  test('implement-trd.md §8.3 lists 18 fields ending in the three new ones', () => {
    const fields = extractDispatchFields(read(CORE_IMPLEMENT));
    expect(fields).not.toBeNull();
    expect(fields).toHaveLength(18);
    expect(fields.slice(-3)).toEqual(['exerciseLanes', 'refreshCommand', 'fullRunCommand']);
  });

  test('verify-build.md §4 lists the identical 18 fields in the identical order', () => {
    const implFields = extractDispatchFields(read(CORE_IMPLEMENT));
    const vbFields = extractDispatchFields(read(CORE_VERIFY_BUILD));
    expect(vbFields).toEqual(implFields);
  });

  test('verify-build.md §4 intro says 18 fields, not 15', () => {
    expect(read(CORE_VERIFY_BUILD)).toMatch(/All 18 fields/);
    expect(read(CORE_VERIFY_BUILD)).not.toMatch(/All 15 fields/);
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
