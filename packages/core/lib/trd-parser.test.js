/**
 * trd-parser.js test suite.
 *
 * Run with: npx jest packages/core/lib/trd-parser.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parseTrd, normalizeLineEndings, findSection, findTables, splitRowCells } = require('./trd-parser');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function readRepoDoc(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// Synthetic fixtures — one per documented format fact
// ---------------------------------------------------------------------------

const SIX_COLUMN_TRD = `# TRD: Example

## 4. Master Task List

### 4.2 Phase 1: Evidence and the deterministic library

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-P001 | Probe something | AC-1 | | None | Probe runs clean |
| EX-B001 | Build the endpoint [LIVE] | AC-2, D1 | \`developing-with-python\` | EX-P001 | 200 OK returned |

### 4.3 Phase 2: Consumer rework

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-B002 | Wire the consumer | AC-3 | | EX-B001 (API contract only) | Consumer compiles |
| ~~EX-B003~~ | ~~retired~~ | | | | **RETIRED.** Folded into EX-B002. |
`;

const FIVE_COLUMN_TRD = `# TRD: Example Five Column

## 4. Master Task List

### 4.1 Phase 1 — Resolve the mechanics

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| EX-P001 | Probe hook composition | Register two hooks on one event | None | backend-implementer |
| EX-P002 | Probe payload | Capture the payload shape | EX-P001 | backend-implementer |
`;

// Mirrors test/smoke/lib/project.sh's smoke_write_trd(): a BULLET-LIST "## 4. Master Task
// List" (not a table) plus a phase heading that lives under "## 5. Execution Plan" instead of
// under Master Task List at all. Per §3.1, a bullet-list Master Task List yields zero tasks —
// ITR-B015 fixes the fixture, not the parser — so this fixture asserts that documented
// behavior rather than a table-parsing success.
const SMOKE_FIXTURE_SHAPE_TRD = `# TRD: Example Smoke Shape

## 4. Master Task List

- [ ] **EX-T001**: Create src/greet.js exporting greet()

## 5. Execution Plan

### 5.1 Phase 1 — Single task

Single task, single phase.
`;

const PHASE_UNDER_TABLE_TRD = `# TRD: Example Under Execution Plan Table

## 4. Master Task List

### 5.1 Phase 1 — Single task

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-T001 | Do the one thing | AC-1 | | None | It works |
`;

const NO_MASTER_TASK_LIST_TRD = `# TRD: No Tasks Here

## 5. Execution Plan

Nothing to see.
`;

const MALFORMED_ROW_TRD = `# TRD: Malformed Row

## 4. Master Task List

### 4.2 Phase 1: Only Phase

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-B001 | Good row | AC-1 | | None | Fine |
| EX-B002 | Bad row missing a column | AC-2 | None | Nope |
`;

const DUPLICATE_ID_TRD = `# TRD: Duplicate IDs

## 4. Master Task List

### 4.2 Phase 1: Only Phase

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-B001 | First occurrence | AC-1 | | None | Fine |
| EX-B001 | Second occurrence, should be ignored | AC-9 | | None | Ignored |
`;

const UNKNOWN_DEPENDENCY_TRD = `# TRD: Unknown Dependency

## 4. Master Task List

### 4.2 Phase 1: Only Phase

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-B001 | Depends on a ghost | AC-1 | | EX-GHOST999 | Fine |
`;

const GROUNDING_AND_QUESTIONS_TRD = `# TRD: Grounding And Questions

## 4. Master Task List

### 4.2 Phase 1: Only Phase

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-B001 | Build the thing | AC-1 | | None | Fine |

## 9. Task Grounding

### EX-B001 — \`packages/example/thing.js\`

- **Touches:** \`packages/example/thing.js\` (new), \`packages/example/thing.test.js\` (new)
- **Reuse:** \`withRetry()\` in \`packages/lib/retry.js\` — do not reimplement backoff
- **Careful:**
  1. First fact to watch for.
  2. Second fact to watch for.

## Open Questions

| ID | Question | Why only the owner can settle it | The default that ships meanwhile |
|----|----------|-----------------------------------|-----------------------------------|
| OQ-1 | Should we do X? | Owner-only call, business impact | Default: no |

## Could Not Verify

| Claim | Why this audit did not settle it, and how to settle it |
|-------|----------------------------------------------------------|
| The service scales to 10x load | Out of scope: requires a load test |
`;

// ---------------------------------------------------------------------------
// Line-ending normalization
// ---------------------------------------------------------------------------

describe('normalizeLineEndings', () => {
  it('converts CRLF to LF', () => {
    expect(normalizeLineEndings('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('converts lone CR to LF', () => {
    expect(normalizeLineEndings('a\rb\rc')).toBe('a\nb\nc');
  });

  it('parses a CRLF-encoded TRD identically to its LF equivalent', () => {
    const crlf = SIX_COLUMN_TRD.replace(/\n/g, '\r\n');
    const lf = parseTrd(SIX_COLUMN_TRD);
    const crlfResult = parseTrd(crlf);
    expect(crlfResult.tasks.map((t) => t.id)).toEqual(lf.tasks.map((t) => t.id));
  });
});

// ---------------------------------------------------------------------------
// Heading / section matching
// ---------------------------------------------------------------------------

describe('findSection', () => {
  it('matches loosely: any level, with or without a leading number', () => {
    const lines = ['## 10. Could Not Verify', 'content', '## Next'];
    const section = findSection(lines, 'Could Not Verify');
    expect(section).not.toBeNull();
    expect(section.text).toBe('10. Could Not Verify');
  });

  it('returns null when no heading matches', () => {
    const lines = ['## Something Else', 'content'];
    expect(findSection(lines, 'Could Not Verify')).toBeNull();
  });

  it('with strategy "last", prefers the final matching heading over an earlier accidental one', () => {
    const lines = [
      '## Open Questions` surfacing. The',
      'prose that is not really a section',
      '## 4. Master Task List',
      '| ID |',
      '## Open Questions',
      '| ID | Question |',
      '|----|----------|',
      '| OQ-1 | Real one |',
    ];
    const last = findSection(lines, 'Open Questions', { strategy: 'last' });
    const first = findSection(lines, 'Open Questions', { strategy: 'first' });
    expect(first.headingIndex).toBe(0);
    expect(last.headingIndex).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Table splitting
// ---------------------------------------------------------------------------

describe('splitRowCells', () => {
  it('splits a pipe-delimited row into trimmed cells', () => {
    expect(splitRowCells('| a | b | c |')).toEqual(['a', 'b', 'c']);
  });

  it('honors escaped pipes inside a cell', () => {
    expect(splitRowCells('| a\\|b | c |')).toEqual(['a|b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// Master Task List: error handling
// ---------------------------------------------------------------------------

describe('parseTrd — Master Task List error handling', () => {
  it('throws when there is no Master Task List section, naming the file path', () => {
    expect(() => parseTrd(NO_MASTER_TASK_LIST_TRD, { path: 'docs/TRD/no-tasks.md' })).toThrow(
      /Master Task List.*docs\/TRD\/no-tasks\.md/
    );
  });

  it('throws without a path when opts.path is omitted', () => {
    expect(() => parseTrd(NO_MASTER_TASK_LIST_TRD)).toThrow(/Master Task List/);
  });

  it('records a malformed (wrong column count) row as a warning and skips it, without throwing', () => {
    const result = parseTrd(MALFORMED_ROW_TRD);
    expect(result.tasks.map((t) => t.id)).toEqual(['EX-B001']);
    expect(result.warnings.some((w) => /Malformed table row/.test(w))).toBe(true);
  });

  it('records an unknown dependency id as a warning rather than throwing', () => {
    const result = parseTrd(UNKNOWN_DEPENDENCY_TRD);
    expect(result.tasks).toHaveLength(1);
    expect(result.warnings.some((w) => /unknown task id: EX-GHOST999/.test(w))).toBe(true);
  });

  it('keeps the first occurrence of a duplicate task id and warns about the rest', () => {
    const result = parseTrd(DUPLICATE_ID_TRD);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].description).toMatch(/First occurrence/);
    expect(result.warnings.some((w) => /Duplicate task id: EX-B001/.test(w))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Column-count independence (5 vs 6 columns) and phase-heading formats
// ---------------------------------------------------------------------------

describe('parseTrd — column schemas and phase-heading formats', () => {
  it('parses a six-column table (Task ID | Description | Serves | Skills | Dependencies | AC)', () => {
    const result = parseTrd(SIX_COLUMN_TRD);
    const ids = result.tasks.map((t) => t.id);
    expect(ids).toEqual(['EX-P001', 'EX-B001', 'EX-B002']);
    expect(result.warnings).toEqual([]);
  });

  it('parses a five-column table (ID | Task | Description | Dependencies | Assignee) without warning on every row', () => {
    const result = parseTrd(FIVE_COLUMN_TRD);
    expect(result.tasks).toHaveLength(2);
    expect(result.warnings.filter((w) => /Malformed/.test(w))).toEqual([]);
    const p1 = result.tasks[0];
    expect(p1.id).toBe('EX-P001');
    // "Task" + "Description" columns are combined into one description string.
    expect(p1.description).toMatch(/Probe hook composition/);
    expect(p1.description).toMatch(/Register two hooks on one event/);
  });

  it('excludes struck-through (retired) rows from tasks', () => {
    const result = parseTrd(SIX_COLUMN_TRD);
    expect(result.tasks.map((t) => t.id)).not.toContain('EX-B003');
  });

  it('sets live=true only when the description carries the [LIVE] marker', () => {
    const result = parseTrd(SIX_COLUMN_TRD);
    const live = result.tasks.find((t) => t.id === 'EX-B001');
    const notLive = result.tasks.find((t) => t.id === 'EX-P001');
    expect(live.live).toBe(true);
    expect(notLive.live).toBe(false);
  });

  it('extracts dependency ids from a cell with parenthetical annotation', () => {
    const result = parseTrd(SIX_COLUMN_TRD);
    const consumer = result.tasks.find((t) => t.id === 'EX-B002');
    expect(consumer.dependencies).toEqual(['EX-B001']);
  });

  it('treats a "None" dependency cell as an empty array', () => {
    const result = parseTrd(SIX_COLUMN_TRD);
    const first = result.tasks.find((t) => t.id === 'EX-P001');
    expect(first.dependencies).toEqual([]);
  });

  it('matches "### 4.2 Phase 1: Name" (colon separator)', () => {
    const result = parseTrd(SIX_COLUMN_TRD);
    expect(result.phases[1]).toBe('Evidence and the deterministic library');
    expect(result.phases[2]).toBe('Consumer rework');
  });

  it('matches "### 4.1 Phase 1 — Name" (em-dash separator)', () => {
    const result = parseTrd(FIVE_COLUMN_TRD);
    expect(result.phases[1]).toBe('Resolve the mechanics');
  });

  it('matches a phase heading by text even when its own section number ("5.1") does not match the outer Master Task List number ("4.")', () => {
    const result = parseTrd(PHASE_UNDER_TABLE_TRD);
    expect(result.tasks.map((t) => t.id)).toEqual(['EX-T001']);
    expect(result.phases[1]).toBe('Single task');
  });

  it('yields zero tasks (not a throw) for a bullet-list Master Task List, per §3.1 — ITR-B015 fixes the fixture, not the parser', () => {
    const result = parseTrd(SMOKE_FIXTURE_SHAPE_TRD);
    expect(result.tasks).toEqual([]);
    expect(result.warnings.some((w) => /zero tasks were parsed/.test(w))).toBe(true);
  });

  it('builds description from the Task-title column alone when a table has no separate Description column', () => {
    const taskOnly = `# TRD

## 4. Master Task List

### 4.2 Phase 1: Only Phase

| Task ID | Task | Serves | Dependencies |
|---------|------|--------|--------------|
| EX-B001 | Just a title, no description column | AC-1 | None |
`;
    const result = parseTrd(taskOnly);
    expect(result.tasks[0].description).toBe('Just a title, no description column');
  });

  it('stops a phase span at the next heading of level <= the phase heading, even when it is not itself a Phase heading', () => {
    const twoPhasesWithInterloper = `# TRD

## 4. Master Task List

### 4.2 Phase 1: First

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-B001 | In phase 1 | AC-1 | | None | Fine |

### Some non-phase sub-heading that ends the span above

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-B002 | Should NOT be counted (outside any phase span) | AC-2 | | None | Fine |
`;
    const result = parseTrd(twoPhasesWithInterloper);
    expect(result.tasks.map((t) => t.id)).toEqual(['EX-B001']);
  });
});

// ---------------------------------------------------------------------------
// Grounding, Open Questions, Could Not Verify
// ---------------------------------------------------------------------------

describe('parseTrd — Task Grounding', () => {
  const result = parseTrd(GROUNDING_AND_QUESTIONS_TRD);

  it('keys grounding blocks by task id', () => {
    expect(Object.keys(result.grounding)).toEqual(['EX-B001']);
  });

  it('parses Touches as backtick-quoted file paths', () => {
    expect(result.grounding['EX-B001'].touches).toEqual([
      'packages/example/thing.js',
      'packages/example/thing.test.js',
    ]);
  });

  it('parses Reuse as a single-element array when it has no numbered sub-list', () => {
    expect(result.grounding['EX-B001'].reuse).toHaveLength(1);
    expect(result.grounding['EX-B001'].reuse[0]).toMatch(/withRetry/);
  });

  it('splits Careful into its numbered sub-items', () => {
    expect(result.grounding['EX-B001'].careful).toEqual([
      'First fact to watch for.',
      'Second fact to watch for.',
    ]);
  });

  it('omits a grounding[id] entry entirely for a task with no grounding block', () => {
    // EX-P001 exists in SIX_COLUMN_TRD but that fixture has no "## 9. Task Grounding" section.
    const noGrounding = parseTrd(SIX_COLUMN_TRD);
    expect(noGrounding.grounding).toEqual({});
  });

  it('warns when a grounding block is missing its mandatory Touches field', () => {
    const missingTouches = `# TRD

## 4. Master Task List

### 4.2 Phase 1: Only Phase

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-B001 | Build the thing | AC-1 | | None | Fine |

## 9. Task Grounding

### EX-B001 — nothing to touch

- **Reuse:** nothing in particular
`;
    const r = parseTrd(missingTouches);
    expect(r.grounding['EX-B001'].touches).toEqual([]);
    expect(r.warnings.some((w) => /missing the mandatory Touches field/.test(w))).toBe(true);
  });
});

describe('parseTrd — Open Questions', () => {
  const result = parseTrd(GROUNDING_AND_QUESTIONS_TRD);

  it('parses id, question and assumed default', () => {
    expect(result.openQuestions).toHaveLength(1);
    expect(result.openQuestions[0]).toMatchObject({
      id: 'OQ-1',
      question: 'Should we do X?',
      assumed: 'Default: no',
    });
  });

  it('marks ownerOnly true when the row text carries an "Owner-only" marker', () => {
    expect(result.openQuestions[0].ownerOnly).toBe(true);
  });

  it('does not mark a question owner-only with no such marker', () => {
    const noMarker = GROUNDING_AND_QUESTIONS_TRD.replace('Owner-only call, business impact', 'Just a design call');
    const r = parseTrd(noMarker);
    expect(r.openQuestions[0].ownerOnly).toBe(false);
  });
});

describe('parseTrd — Could Not Verify', () => {
  const result = parseTrd(GROUNDING_AND_QUESTIONS_TRD);

  it('parses claim/check pairs', () => {
    expect(result.couldNotVerify).toEqual([
      {
        claim: 'The service scales to 10x load',
        check: 'Out of scope: requires a load test',
      },
    ]);
  });

  it('is empty when the document has no Could Not Verify section', () => {
    const r = parseTrd(SIX_COLUMN_TRD);
    expect(r.couldNotVerify).toEqual([]);
  });

  it('records a malformed (wrong column count) Could Not Verify row as a warning and skips it', () => {
    const malformed = `# TRD

## 4. Master Task List

### 4.2 Phase 1: Only Phase

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| EX-B001 | Build the thing | AC-1 | | None | Fine |

## Could Not Verify

| Claim | Why this audit did not settle it, and how to settle it |
|-------|----------------------------------------------------------|
| Good row | Settled by reading |
| Bad row with an extra | pipe | in it |
`;
    const r = parseTrd(malformed);
    expect(r.couldNotVerify).toEqual([{ claim: 'Good row', check: 'Settled by reading' }]);
    expect(r.warnings.some((w) => /Malformed Could Not Verify row/.test(w))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Real TRDs on disk — the acceptance criterion this task lives or dies by.
// A parser that only passes on synthetic fixtures and returns zero on a real file is exactly
// the failure ITR-P001 found in the Sunstone reference (docs/modernization/runs/item8/sunstone-read.md).
// ---------------------------------------------------------------------------

  it('excludes non-path backticked tokens from Touches (symbols, shell commands)', () => {
    // Regression: grounding prose puts evidence markers and symbol names in code spans
    // alongside real paths. Extracting every span made `cmp` and `smoke_write_trd()` into
    // "files", which fabricates conflict edges in task-graph.js and silently serializes
    // tasks that share nothing.
    const md = [
      '# TRD: Touches filter',
      '',
      '## 4. Master Task List',
      '',
      '### 4.2 Phase 1: Only',
      '',
      '| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |',
      '|---------|-------------|--------|--------|--------------|---------------------|',
      '| AAA-B001 | Does a thing | G1 | | None | It works |',
      '',
      '## 9. Task Grounding',
      '',
      '### AAA-B001',
      '- **Touches:** `packages/core/lib/a.js` `[read]`, `cmp`, `smoke_write_trd()`,',
      '  `package.json`, `test/smoke/lib/project.sh`',
      '',
    ].join('\n');
    const r = parseTrd(md);
    expect(r.grounding['AAA-B001'].touches).toEqual([
      'packages/core/lib/a.js',
      'package.json',
      'test/smoke/lib/project.sh',
    ]);
  });

describe('parseTrd — real TRDs in this repository', () => {
  it('parses docs/TRD/implement-trd-rework.md (six-column, struck rows, 19 live tasks)', () => {
    const markdown = readRepoDoc('docs/TRD/implement-trd-rework.md');
    const result = parseTrd(markdown, { path: 'docs/TRD/implement-trd-rework.md' });

    expect(result.tasks.length).toBe(19);
    expect(result.tasks.map((t) => t.id)).not.toEqual(
      expect.arrayContaining(['ITR-B007', 'ITR-B009', 'ITR-B013'])
    );
    expect(Object.keys(result.phases)).toEqual(['1', '2', '3', '4']);
    expect(Object.keys(result.grounding).length).toBeGreaterThan(0);
    expect(result.openQuestions.length).toBeGreaterThan(0);
    expect(result.couldNotVerify.length).toBeGreaterThan(0);
      // This parser FOUND a real defect on first run: OQ-5's row carried one extra column
      // against its own 4-column header, introduced when that row was rewritten to mark the
      // question superseded. The document was fixed rather than the finding suppressed, so
      // the real file must parse clean. Malformed-row BEHAVIOUR stays covered synthetically
      // (MALFORMED_ROW_TRD, and the Could Not Verify case) -- pinning a behavioural assertion
      // to a live document's defect makes fixing the document break the test.
      expect(result.warnings).toEqual([]);
  });

  it('parses docs/TRD/discipline-judgment.md (five-column, em-dash phase headings) with no per-row warnings', () => {
    const markdown = readRepoDoc('docs/TRD/discipline-judgment.md');
    const result = parseTrd(markdown, { path: 'docs/TRD/discipline-judgment.md' });

    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.warnings.filter((w) => /Malformed table row/.test(w))).toEqual([]);
    expect(Object.keys(result.phases)).toEqual(['1', '2', '3', '4']);
  });

  it('parses docs/TRD/_workflow-test-stop-hook.md without throwing and extracts real tasks', () => {
    const markdown = readRepoDoc('docs/TRD/_workflow-test-stop-hook.md');
    const result = parseTrd(markdown, { path: 'docs/TRD/_workflow-test-stop-hook.md' });

    expect(result.tasks.length).toBeGreaterThan(0);
    expect(Object.keys(result.grounding).length).toBeGreaterThan(0);
  });
});
