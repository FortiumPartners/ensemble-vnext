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
