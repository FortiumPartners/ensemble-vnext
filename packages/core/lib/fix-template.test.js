'use strict';
/**
 * The TRD template that `/plan` ships must PARSE. Grep cannot check that.
 *
 * Run 1 of the predecessor command (`/fix`) wrote grounding fields as `- Touches:` when
 * trd-parser.js requires `- **Touches:**`. Every block parsed EMPTY and warned "missing the
 * mandatory Touches field" — silently dropping the command's highest-value output, the thing
 * that stops an implementer inventing its own file list.
 *
 * No structural test caught it, because the template is prose. This one extracts the SHIPPED
 * template out of plan.md, fills the placeholders, and runs the real parser over it — so
 * editing the template into an unparseable state fails here instead of on a user's next run.
 *
 * `/fix` was retired (superseded by `/plan`); this file KEEPS its name despite testing
 * plan.md now (PLAN-T003 / D12) — renaming it would just be churn for a file whose job is
 * unchanged: parse whatever light-TRD template the active command ships.
 */
const fs = require('fs');
const path = require('path');
const { parseTrd } = require('./trd-parser');

const REPO = path.resolve(__dirname, '../../..');
const PLAN_MD = path.join(REPO, 'packages/core/commands/plan.md');

/** Pull the light-TRD template out of the command as it actually ships. */
function extractTemplate() {
  const src = fs.readFileSync(PLAN_MD, 'utf8');
  const m = src.match(/```markdown\n(# TRD:[\s\S]*?)\n```/);
  if (!m) throw new Error('no TRD template found in plan.md — the light-TRD markdown fence is gone');
  return m[1];
}

/**
 * Substitute the angle-bracket placeholders with plausible real content.
 *
 * Every replacement below is a HARD-CODED LITERAL matching the placeholder text as it ships
 * today, deliberately — not a generic `<...>` sweep. A generic sweep would keep "working" even
 * after a placeholder is reworded, silently leaving the reworded text unfilled while the parse
 * assertions below kept passing (this is risk TR2: vacuous coverage). Renaming a placeholder in
 * plan.md must make ONE of these .replace() calls stop matching, so the leftover `<...>` shows
 * up in the "fill actually substituted" assertion instead of hiding behind a green suite.
 */
function fill(tpl) {
  const literal = (str, from, to) => str.split(from).join(to);
  let out = tpl;
  out = literal(out, '<slug>', 'sample-fix');
  out = literal(out, '<defect | small change decided in session>', 'defect');
  out = literal(out, '<what must be true>', 'the export no longer returns an empty file');
  out = literal(out, 'the reproduction below / your instruction, <date>', 'the reproduction below, 2026-09-23');
  out = literal(
    out,
    '<the decided outcome, in checkable terms, cited to the conversation turn>',
    'the export always writes at least one row'
  );
  out = literal(
    out,
    '<the test command that passes BEFORE this change and must still pass after>',
    '`npx jest src/export.test.ts` [ran]'
  );
  out = literal(
    out,
    '<the public surface that must not move>',
    'the exported `exportRows()` signature stays public surface'
  );
  out = literal(
    out,
    '<the approach chosen; and if an alternative was considered and rejected, why>',
    'fix the chunking loop directly rather than rewriting the export pipeline'
  );
  out = literal(out, '<what this fix must not grow into>', 'rewriting the export pipeline');
  out = literal(out, '<the open decision>', 'whether to also fix the sibling off-by-one');
  out = literal(out, '<what I did>', 'left it alone');
  out = literal(
    out,
    '<anything asserted but not checked — empty is fine and honest>',
    'nothing'
  );
  return out
    .replace(/`path\/to\/file\.ts`/g, '`src/export.ts`')
    .replace(/\.\.\. \[read\]/g, 'the chunking loop [read]')
    .replace(/\.\.\. \[ran\]/g, 'the old off-by-one guard [ran]')
    .replace(/^- \*\*(Follow|Careful):\*\* \.\.\.$/gm, '- **$1:** local convention')
    .replace(
      /^\| FIX-001 \| \.\.\. \| O1 \| None \| \.\.\. \|$/m,
      '| FIX-001 | fix the month-boundary chunking | O1 | None | export returns rows |'
    );
}

describe('the /plan TRD template', () => {
  const filled = fill(extractTemplate());
  const parsed = parseTrd(filled, { path: 'sample-fix.md' });

  test('the fill actually SUBSTITUTED — no placeholder angle bracket remains', () => {
    // Strip HTML comments first: `<!-- defects only -->` etc. are legitimate markdown, not
    // unfilled placeholders, and would otherwise false-positive this check.
    const withoutComments = filled.replace(/<!--[\s\S]*?-->/g, '');
    const leftover = withoutComments.match(/<[^\n]*?>/g);
    expect(leftover).toBeNull();
  });

  test('parses to at least one task', () => {
    expect(parsed.tasks.length).toBeGreaterThan(0);
  });

  test('GROUNDING SURVIVES — every task has a non-empty Touches', () => {
    // The exact defect from run 1. An unbolded field name parses to nothing.
    for (const task of parsed.tasks) {
      const g = parsed.grounding[task.id];
      expect(g).toBeDefined();
      expect(Array.isArray(g.touches)).toBe(true);
      expect(g.touches.length).toBeGreaterThan(0);
    }
  });

  test('no grounding warning is emitted', () => {
    const bad = (parsed.warnings || []).filter((w) => /Touches/i.test(w));
    expect(bad).toEqual([]);
  });

  test('the only warning is the documented phase-less default', () => {
    // A light TRD has no phase headings by design; anything else is a real defect.
    const other = (parsed.warnings || []).filter((w) => !/No "Phase <n>" heading found/i.test(w));
    expect(other).toEqual([]);
  });

  test('every task names an objective', () => {
    for (const task of parsed.tasks) {
      expect([].concat(task.serves || []).filter(Boolean).length).toBeGreaterThan(0);
    }
  });

  test('Open Questions parses OQ-1 with ownerOnly: true', () => {
    // The template's Owner-only cell must carry the literal string "owner-only" — trd-parser.js
    // has no dedicated ownerOnly column role, it regex-tests the DATA ROW'S OWN joined cell
    // text against /owner-only|owner ruling/i. A cell reading "yes" would parse to false.
    const oq = parsed.openQuestions.find((q) => q.id === 'OQ-1');
    expect(oq).toBeDefined();
    expect(oq.ownerOnly).toBe(true);
  });

  test('Behaviour Preserved carries a public-surface line', () => {
    const section = filled.split(/\n## /).find((s) => s.startsWith('Behaviour Preserved'));
    expect(section).toBeDefined();
    expect(section).toMatch(/public surface/i);
  });
});

describe('the decision reaches implementers BY CONSTRUCTION', () => {
  // Three attempts, and the first two fixed nothing while looking right:
  //   1. "repeat it in every task's prompt" — /plan never writes task prompts
  //   2. "repeat it as a **Follow:** bullet"  — worked, but only if the author
  //      hand-copied it into every block, under a field whose own instruction
  //      calls it "an existing pattern in this repository"
  //   3. parse `## Decision` and emit <decision> into every prompt — this one
  const wrap = (body) => `# TRD: t

**Source PRD**: None — defect

## Decision

Emit \`{}\`. NOT \`systemMessage\`: it is user-facing.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | do the thing | O1 | None | it is done |

## Task Grounding

### FIX-001
- **Touches:** \`src/a.ts\`
${body}
`;

  test('the top-level ## Decision section is parsed, not dropped', () => {
    const p = parseTrd(wrap('- **Reuse:** the existing helper [read]'), { path: 't.md' });
    expect(p.decision).toMatch(/NOT `systemMessage`/);
  });

  test('a per-task **Decision:** bullet is recognised, for the override case', () => {
    const p = parseTrd(wrap('- **Decision:** this task overrides'), { path: 't.md' });
    expect(p.grounding['FIX-001'].decision.join(' ')).toMatch(/overrides/);
  });

  test('a **Decision:** bullet no longer TRUNCATES the field before it', () => {
    // The silent double-loss: an unrecognised bullet flushed the preceding
    // field's body, so writing the intuitive thing destroyed the field above it.
    const p = parseTrd(
      wrap('- **Reuse:** the existing helper [read]\n- **Decision:** override'),
      { path: 't.md' }
    );
    expect(p.grounding['FIX-001'].reuse.join(' ')).toMatch(/existing helper/);
  });

  test('the command no longer demands manual duplication into every task', () => {
    const src = fs.readFileSync(PLAN_MD, 'utf8');
    expect(src).toMatch(/no duplication into tasks is needed/);
  });

  test('implement-trd emits it as <decision> into EVERY task prompt', () => {
    const impl = fs.readFileSync(path.join(REPO, 'packages/core/commands/implement-trd.md'), 'utf8');
    expect(impl).toMatch(/`<decision>`/);
    expect(impl).toMatch(/into \*\*every\*\* task's prompt/);
  });

  test('the contract warns <decision> is NOT prior art', () => {
    // Delivered under **Follow:** it read as "an existing pattern in this
    // repository", which is untrue of a decision being taken right now.
    const contract = fs.readFileSync(path.join(REPO, 'packages/core/contracts/task-delegation.md'), 'utf8');
    expect(contract).toMatch(/NOT prior art/);
  });
});

describe('the command DELEGATES its branch decisions rather than restating them', () => {
  const src = () => fs.readFileSync(PLAN_MD, 'utf8');

  // These invariants used to be asserted against the command's prose. They now
  // live in fix-plan.js with tests of their own, because the same table
  // written in five places disagreed with itself in four of them. What this file
  // must check is that the command CALLS the lib and does not re-derive it.

  test('the command calls fix-plan instead of branching in prose', () => {
    expect(src()).toMatch(/require\("\.\/\.claude\/lib\/fix-plan"\)/);
  });

  test('it forbids re-deriving the plan', () => {
    expect(src()).toMatch(/Do not re-derive any of this in prose/);
  });

  test('a null banner is explicitly explained, not left to inference', () => {
    // The one output a reader is most likely to override on instinct.
    expect(src()).toMatch(/`banner: null`/);
  });

  test('the retired PHASE 1/2 numbering has not crept back', () => {
    expect(src()).not.toMatch(/\[STATUS: \/fix\] PHASE 1\/2 COMPLETE/);
  });
});
