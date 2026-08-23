'use strict';
/**
 * The TRD template that `/fix` ships must PARSE. Grep cannot check that.
 *
 * Run 1 of /fix wrote grounding fields as `- Touches:` when trd-parser.js
 * requires `- **Touches:**`. Every block parsed EMPTY and warned "missing the
 * mandatory Touches field" — silently dropping the command's highest-value
 * output, the thing that stops an implementer inventing its own file list.
 *
 * No structural test caught it, because the template is prose. This one
 * extracts the SHIPPED template out of fix.md, fills the placeholders, and runs
 * the real parser over it — so editing the template into an unparseable state
 * fails here instead of on a user's next bug.
 */
const fs = require('fs');
const path = require('path');
const { parseTrd } = require('./trd-parser');

const REPO = path.resolve(__dirname, '../../..');
const FIX_MD = path.join(REPO, 'packages/core/commands/fix.md');

/** Pull the Step 4 TRD template out of the command as it actually ships. */
function extractTemplate() {
  const src = fs.readFileSync(FIX_MD, 'utf8');
  const m = src.match(/```markdown\n(# TRD:[\s\S]*?)\n```/);
  if (!m) throw new Error('no TRD template found in fix.md — the Step 4 markdown fence is gone');
  return m[1];
}

/** Substitute the angle-bracket placeholders with plausible real content. */
function fill(tpl) {
  return tpl
    .replace(/<slug>/g, 'sample-fix')
    .replace(/<defect \| small change decided in session>/g, 'defect')
    .replace(/<what must be true>/g, 'the export no longer returns an empty file')
    .replace(/the reproduction below \/ your instruction, <date>/g, 'the reproduction below')
    .replace(/<the decided outcome[^>]*>/g, 'n/a')
    .replace(/<what this fix must not grow into>/g, 'rewriting the export pipeline')
    .replace(/<anything asserted but not checked[^>]*>/g, 'nothing')
    .replace(/`path\/to\/file\.ts`/g, '`src/export.ts`')
    .replace(/\.\.\. \[read\]/g, 'the chunking loop [read]')
    .replace(/\.\.\. \[ran\]/g, 'the old off-by-one guard [ran]')
    .replace(/^- \*\*(Follow|Careful):\*\* \.\.\.$/gm, '- **$1:** local convention')
    .replace(/^\| FIX-001 \| \.\.\. \| O1 \| None \| \.\.\. \|$/m,
             '| FIX-001 | fix the month-boundary chunking | O1 | None | export returns rows |');
}

describe('the /fix TRD template', () => {
  const parsed = parseTrd(fill(extractTemplate()), { path: 'sample-fix.md' });

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
});

describe('the decision must reach implementers through a field that PARSES', () => {
  // Blind audit 2026-08-23: /fix never writes task prompts — /implement-trd does,
  // and its placeholder list has no Decision element. A top-level `## Decision`
  // section is dropped on the floor, and a `- **Decision:**` bullet parses as
  // NOTHING because trd-parser matches only Touches|Reuse|Replaces|Follow|Careful.
  // So the previous fix ("repeat it in every task's prompt") fixed nothing.
  const wrap = (groundingBody) => `# TRD: t

**Source PRD**: None — defect

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | do the thing | O1 | None | it is done |

## Task Grounding

### FIX-001
- **Touches:** \`src/a.ts\`
${groundingBody}
`;

  test('a **Follow:** bullet carries the decision through the parser', () => {
    const p = parseTrd(wrap('- **Follow:** emit `{}`, NOT systemMessage — it is user-facing'), { path: 't.md' });
    const follow = p.grounding['FIX-001'].follow.join(' ');
    expect(follow).toMatch(/NOT systemMessage/);
  });

  test('a **Decision:** bullet is silently DROPPED — which is why Follow is used', () => {
    const p = parseTrd(wrap('- **Decision:** emit `{}`, NOT systemMessage'), { path: 't.md' });
    const g = p.grounding['FIX-001'];
    // It lands in NO field — the parser has no key for it at all, so these are
    // undefined rather than empty. Spreading them would throw; that was a bug in
    // this test, not in the parser.
    const all = []
      .concat(g.follow || [], g.careful || [], g.reuse || [], g.replaces || [])
      .join(' ');
    expect(all).not.toMatch(/systemMessage/);
  });

  test('the command instructs the Follow carrier, not a bare "put it in the prompt"', () => {
    const src = fs.readFileSync(FIX_MD, 'utf8');
    expect(src).toMatch(/repeat it as a `\*\*Follow/);
    expect(src).toMatch(/dropped on the floor/);
  });
});

describe('the command DELEGATES its branch decisions rather than restating them', () => {
  const src = () => fs.readFileSync(FIX_MD, 'utf8');

  // These invariants used to be asserted against the command's prose. They now
  // live in fix-plan.js with 15 tests of their own, because the same table
  // written in five places disagreed with itself in four of them. What this file
  // must check is that the command CALLS the lib and does not re-derive it.

  test('Step 6 calls fix-plan instead of branching in prose', () => {
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
