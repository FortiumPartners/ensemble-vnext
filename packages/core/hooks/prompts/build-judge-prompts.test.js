/**
 * build-judge-prompts.test.js (AJCS-B005)
 *
 * Covers the `precondition` field added to `HOOKS` entries (TRD §3.3, D6):
 *   - it is emitted in both `buildPrompt` and `buildCombinedPrompt`, immediately after
 *     `LOOP_GUARD_BLOCK` and before either judgment's escape valve;
 *   - a hook that declares NO precondition (subagent-discipline) must produce output
 *     byte-identical to what was generated before this task, because `.filter(Boolean)`
 *     is what keeps an absent block from leaving a spurious blank-line separator behind
 *     (D6) — this is the case the missing filter would break, so it's asserted against a
 *     fresh build rather than a cached string;
 *   - the autonomy-discipline precondition text carries every content requirement listed
 *     in TRD §3.3.
 *
 * Run with: npx jest packages/core/hooks/prompts/build-judge-prompts.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  buildPrompt,
  buildCombinedPrompt,
  HOOKS,
  STOP_DISCIPLINE_HOOKS,
} = require('./build-judge-prompts');

describe('precondition placement', () => {
  it('buildPrompt places the precondition after the loop guard and before the escape valve', () => {
    const text = buildPrompt('autonomy-discipline');
    const h = HOOKS['autonomy-discipline'];

    const loopGuardIdx = text.indexOf('## First, the loop guard');
    const preconditionIdx = text.indexOf(h.precondition);
    const escapeValveIdx = text.indexOf(h.escapeValve);

    expect(loopGuardIdx).toBeGreaterThan(-1);
    expect(preconditionIdx).toBeGreaterThan(-1);
    expect(escapeValveIdx).toBeGreaterThan(-1);
    expect(preconditionIdx).toBeGreaterThan(loopGuardIdx);
    expect(preconditionIdx).toBeLessThan(escapeValveIdx);
  });

  it('buildCombinedPrompt places the precondition after the loop guard and before either escape valve', () => {
    const text = buildCombinedPrompt(STOP_DISCIPLINE_HOOKS);
    const asyncH = HOOKS['async-discipline'];
    const autonomyH = HOOKS['autonomy-discipline'];

    const loopGuardIdx = text.indexOf('## First, the loop guard');
    const preconditionIdx = text.indexOf(autonomyH.precondition);
    const asyncEscapeValveIdx = text.indexOf(asyncH.escapeValve);
    const autonomyEscapeValveIdx = text.indexOf(autonomyH.escapeValve);

    expect(loopGuardIdx).toBeGreaterThan(-1);
    expect(preconditionIdx).toBeGreaterThan(-1);
    expect(asyncEscapeValveIdx).toBeGreaterThan(-1);
    expect(autonomyEscapeValveIdx).toBeGreaterThan(-1);

    expect(preconditionIdx).toBeGreaterThan(loopGuardIdx);
    expect(preconditionIdx).toBeLessThan(asyncEscapeValveIdx);
    expect(preconditionIdx).toBeLessThan(autonomyEscapeValveIdx);
  });
});

describe('combined prompt content requirements (TRD §3.3)', () => {
  const text = buildCombinedPrompt(STOP_DISCIPLINE_HOOKS);

  it('contains the precondition text', () => {
    expect(text).toContain(HOOKS['autonomy-discipline'].precondition);
  });

  it('names the ENSEMBLE_COMMAND token and the state=none value', () => {
    expect(text).toContain('ENSEMBLE_COMMAND');
    expect(text).toContain('state=none');
  });

  it('states the session-binding rule and that the last matching marker wins (D3)', () => {
    expect(text).toMatch(/LAST such marker/);
    expect(text).toMatch(/session=/);
    expect(text).toMatch(/supersedes every earlier one/);
  });

  it('states the absent/unknown/mismatched/malformed-marker behaviour (D5): the judgment APPLIES', () => {
    // D5 fixes the direction: Judgment B is skipped ONLY on an explicit `state=none`
    // with a matching session. Every other reading of the channel — including total
    // channel loss — must fall back to today's unconditional behaviour, because
    // absent-marker has causes (ROUTER_DISABLE=1, unscaffolded project, platform
    // change) that would otherwise silently disable the guard entirely (R8).
    const precondition = HOOKS['autonomy-discipline'].precondition;

    // The one and only skip case is state=none WITH a session match.
    expect(precondition).toMatch(
      /`state=none` with a `session=` matching this payload: the judgment does NOT apply/
    );
    expect(precondition).toMatch(/ONLY case that skips it/);

    // Everything else applies, and each of the four causes is named explicitly.
    const fallback = precondition.slice(precondition.indexOf('Anything else'));
    expect(fallback).toMatch(/no marker present at all/);
    expect(fallback).toMatch(/`state=unknown`/);
    expect(fallback).toMatch(/no marker matching this\s+session's id/);
    expect(fallback).toMatch(/marker line that doesn't parse/);
    expect(fallback).toMatch(/the judgment APPLIES/);

    // And the tie-break sentence points the same way, not the other.
    expect(precondition).toMatch(/default to applying it/);
    expect(precondition).not.toMatch(/default to not applying it/);
  });

  it('states the async-deferral judgment is evaluated unconditionally regardless of command state', () => {
    expect(text).toMatch(/unconditionally on every turn regardless of command state/);
  });

  it('adds no instruction to open a file or read the transcript', () => {
    const precondition = HOOKS['autonomy-discipline'].precondition;
    // It explicitly disclaims doing so, and nowhere else does it tell the judge TO open
    // a file or read the transcript (the disclaiming sentence itself necessarily
    // contains that phrase, so assert there's exactly one occurrence: the disclaimer).
    expect(precondition).toMatch(/adds\s+no instruction to open a file or read the transcript/);
    expect(precondition.match(/open a file/gi) || []).toHaveLength(1);
    expect(precondition.match(/read the transcript/gi) || []).toHaveLength(1);
  });

  it('still contains the "when uncertain, allow" and "judge from the payload only" text', () => {
    expect(text).toContain('## When uncertain, allow');
    expect(text).toContain('## Judge from the payload only');
  });
});

describe('a hook with no precondition emits no separator (D6)', () => {
  // The byte-identity check against a checked-in subagent-discipline.prompt.md was dropped
  // in 4.2.0: the SubagentStop judge was unregistered, so the manifest no longer declares
  // that prompt file and the generator no longer emits one. The entry stays in HOOKS purely
  // so the discipline corpus can still score SubagentStop cases (the corpus detector calls
  // buildPrompt() in memory and never reads the .md).
  //
  // The PROPERTY that check existed for is D6 — a hook declaring no `precondition` must not
  // leave a spurious separator where `undefined` sat in the flat `parts` array before
  // `.filter(Boolean)` — and that is asserted directly on the built string, which is
  // strictly better: it no longer depends on a fixture file staying in sync.
  it('subagent-discipline (no precondition) emits no spurious separator', () => {
    const built = buildPrompt('subagent-discipline');
    expect(built).not.toMatch(/\n{3,}/);
    expect(built).not.toContain('undefined');
    // Sanity: it is still a real prompt, not an empty string that would pass vacuously.
    expect(built).toContain('## Judge from the payload only');
  });

  it('discipline-stop output is byte-identical to the checked-in prompt file', () => {
    // The counterpart to the subagent-discipline check above, and the one that closes
    // the shell-only-regeneration hole: generate-hooks-artifacts.sh READS this file and
    // embeds it into the three settings.json — it never WRITES it. Editing
    // build-judge-prompts.js and running only the shell script therefore ships the OLD
    // prompt while every consistency check passes, because settings.json is compared
    // against the same stale file it was generated from. Comparing the file against a
    // FRESH build is the only thing that sees it.
    const built = buildCombinedPrompt(STOP_DISCIPLINE_HOOKS);
    const onDisk = fs.readFileSync(
      path.join(__dirname, 'discipline-stop.prompt.md'),
      'utf-8'
    );
    expect(built + '\n').toBe(onDisk);
  });

  it('has no `precondition` field, proving the identity check above is meaningful', () => {
    expect(HOOKS['subagent-discipline'].precondition).toBeUndefined();
  });

  it('never emits a quadruple-newline gap where an absent block would otherwise leave one', () => {
    const single = buildPrompt('subagent-discipline');
    const combined = buildCombinedPrompt(STOP_DISCIPLINE_HOOKS);
    expect(single).not.toMatch(/\n{4,}/);
    expect(combined).not.toMatch(/\n{4,}/);
  });
});

describe('regression guard: what .filter(Boolean) is protecting against', () => {
  it('demonstrates the byte-identity test would fail without .filter(Boolean)', () => {
    // Reproduces the exact bug D6 describes without touching production code: joining a
    // flat parts array that contains an unfiltered `undefined` (subagent-discipline
    // declares no `precondition`, so `h.precondition` is `undefined`) leaves a
    // `\n\n\n\n` gap around the missing entry, which is NOT what's on disk.
    const h = HOOKS['subagent-discipline'];
    const partsWithoutFilter = ['A', 'B', h.precondition, 'C'];
    const joinedWithoutFilter = partsWithoutFilter.join('\n\n');
    expect(joinedWithoutFilter).toBe('A\n\nB\n\n\n\nC');

    const partsWithFilter = partsWithoutFilter.filter(Boolean);
    const joinedWithFilter = partsWithFilter.join('\n\n');
    expect(joinedWithFilter).toBe('A\n\nB\n\nC');
  });
});

/* Unit 1b/1c, 2026-09-21 — the block reason must sanction dissent and must never compel.
 *
 * These assert the PROMPT's content, not the judge's behaviour; verdict effects are scored
 * through test/discipline-corpus/compare-runs.js, which is the only thing that can measure
 * them (RESULTS.md:472 — "no edit to this prompt ships on a reading"). */
describe('block reasons: sanctioned dissent, and no compelled action', () => {
  const prompt = buildCombinedPrompt(STOP_DISCIPLINE_HOOKS);

  it('sanctions a one-line "My answer stands" reply', () => {
    expect(prompt).toContain('My answer stands');
    expect(prompt).toContain('If this block is mistaken, reply exactly');
  });

  it('forbids restating the blocked message', () => {
    expect(prompt).toContain('do not restate your previous message');
  });

  it('forbids a reason that instructs merge, push, deploy, release or a command', () => {
    expect(prompt).toMatch(/never instruct the agent to merge, push, deploy, release, or invoke a\s+slash command/);
  });

  it('turns an action-shaped remedy into an ALLOW rather than a block', () => {
    // The load-bearing half: if the only remedy is an outward-facing act, the agent was
    // correctly deferring. Without this the rule reads as advice and gets overridden.
    expect(prompt).toContain('the turn was NOT a violation');
  });

  it('remedies the autonomy judgment by deleting the pause, not by doing the work', () => {
    expect(prompt).toContain('DELETE the sentence that hands the decision back');
    expect(prompt).not.toContain('apply the best available default, finish the remaining work');
  });
});
