/**
 * judge detector — context-preamble channel (AJCS-B001)
 *
 * Proves two things about `buildFullPrompt`, the assembly seam exported for testing
 * (judge.js normally shells out to `claude --print`, which Jest must not do):
 *
 *   1. A case with NO `context` produces a prompt byte-identical to the prompt built
 *      directly from the hook-prompt builders + payload substitution + response-format
 *      suffix — i.e. identical to what judge.js produced before this field existed.
 *   2. A case WITH `context` produces a prompt containing that text, positioned ahead
 *      of (at a lower string index than) the generated hook-prompt/payload text.
 *
 * Run with: npx jest test/discipline-corpus/
 */

'use strict';

const judge = require('./judge');
const {
  buildPrompt,
  buildCombinedPrompt,
  STOP_DISCIPLINE_HOOKS,
} = require('../../../packages/core/hooks/prompts/build-judge-prompts');

describe('judge detector — buildFullPrompt context channel', () => {
  describe('no context field (the common case)', () => {
    test('Stop case: prompt is byte-identical to the pre-context assembly', () => {
      const testCase = {
        id: 'no-context-stop',
        event: 'Stop',
        text: 'Done. All tests pass.',
      };

      const actual = judge.buildFullPrompt(testCase, 'discipline-stop');

      const rawPrompt = buildCombinedPrompt(STOP_DISCIPLINE_HOOKS);
      const payload = {
        hook_event_name: 'Stop',
        stop_hook_active: false,
        background_tasks: [],
        session_crons: [],
        last_assistant_message: testCase.text,
      };
      const expected = `${rawPrompt.replace('$ARGUMENTS', JSON.stringify(payload, null, 2))}\n\n## How to respond (offline harness — no submit tool available here)\n\nReply with EXACTLY ONE JSON object and nothing else — no markdown fences, no prose before\nor after it:\n\n  {"ok": true}\n  {"ok": false, "reason": "<short reason, one sentence>"}`;

      expect(actual).toBe(expected);
    });

    test('SubagentStop case: prompt is byte-identical to the pre-context assembly', () => {
      const testCase = {
        id: 'no-context-subagent',
        event: 'SubagentStop',
        text: 'Investigated and applied the fix.',
      };

      const actual = judge.buildFullPrompt(testCase, 'subagent-discipline');

      const rawPrompt = buildPrompt('subagent-discipline');
      const payload = {
        hook_event_name: 'SubagentStop',
        stop_hook_active: false,
        background_tasks: [],
        session_crons: [],
        last_assistant_message: testCase.text,
        agent_id: testCase.id,
        agent_type: 'unknown',
      };
      const expected = `${rawPrompt.replace('$ARGUMENTS', JSON.stringify(payload, null, 2))}\n\n## How to respond (offline harness — no submit tool available here)\n\nReply with EXACTLY ONE JSON object and nothing else — no markdown fences, no prose before\nor after it:\n\n  {"ok": true}\n  {"ok": false, "reason": "<short reason, one sentence>"}`;

      expect(actual).toBe(expected);
    });

    test('undefined context and empty-string context both produce no preamble', () => {
      const base = { id: 'x', event: 'Stop', text: 'Done.' };
      const withUndefined = judge.buildFullPrompt(base, 'discipline-stop');
      const withEmptyString = judge.buildFullPrompt({ ...base, context: '' }, 'discipline-stop');
      expect(withEmptyString).toBe(withUndefined);
    });
  });

  describe('context field present', () => {
    test('preamble text appears in the prompt, ahead of the generated hook prompt', () => {
      const testCase = {
        id: 'with-context',
        event: 'Stop',
        text: 'Done. All tests pass.',
        context: 'This turn followed a marker showing state=active for a running /implement-trd.',
      };

      const withContext = judge.buildFullPrompt(testCase, 'discipline-stop');
      const withoutContext = judge.buildFullPrompt({ ...testCase, context: undefined }, 'discipline-stop');

      // Contains the context text verbatim.
      expect(withContext).toContain(testCase.context);

      // Positioned ahead of the generated prompt: the index of the context text is
      // lower than the index at which the (unchanged) generated prompt begins.
      const contextIndex = withContext.indexOf(testCase.context);
      const generatedPromptStart = withoutContext.slice(0, 40); // stable prefix of the hook prompt
      const generatedPromptIndex = withContext.indexOf(generatedPromptStart);
      expect(contextIndex).toBeGreaterThanOrEqual(0);
      expect(generatedPromptIndex).toBeGreaterThan(contextIndex);

      // Everything from the generated-prompt's start onward is unaffected by context.
      expect(withContext.slice(generatedPromptIndex)).toBe(withoutContext);
    });

    test('is labelled (not raw, unattributed prose)', () => {
      const testCase = {
        id: 'with-context-2',
        event: 'SubagentStop',
        text: 'Applied the fix and returned.',
        context: 'Extra situational note for the judge.',
      };
      const prompt = judge.buildFullPrompt(testCase, 'subagent-discipline');
      expect(prompt).toMatch(/^## .*context/i);
    });
  });

  describe('applicableHooks — unaffected by this change (sanity)', () => {
    test('Stop -> discipline-stop, SubagentStop -> subagent-discipline', () => {
      expect(judge.applicableHooks({ event: 'Stop' })).toEqual(['discipline-stop']);
      expect(judge.applicableHooks({ event: 'SubagentStop' })).toEqual(['subagent-discipline']);
    });
  });
});

describe('session_id in the payload (phase-3 review HIGH)', () => {
  // The Stop precondition honours "the LAST ENSEMBLE_COMMAND marker whose session=
  // matches this payload's session_id". Before this, buildPayload never emitted one, so
  // NO marker could match and every context-bearing case fell into the precondition's
  // catch-all — scoring the state=none cases as false positives for a harness reason.
  const stopCase = (over = {}) => ({ id: 'c', event: 'Stop', text: 'hi', ...over });

  it('emits session_id parsed from the context marker', () => {
    const out = judge.buildFullPrompt(
      stopCase({ context: 'ENSEMBLE_COMMAND state=none session=abc-123' }),
      'discipline-stop'
    );
    expect(out).toMatch(/"session_id":\s*"abc-123"/);
  });

  it('omits session_id entirely when the case has no context — D7 byte-identity', () => {
    const out = judge.buildFullPrompt(stopCase(), 'discipline-stop');
    expect(out).not.toMatch(/"session_id"/);
  });

  it('prefers an explicit session_id over the marker, so a case can MISMATCH the two', () => {
    const out = judge.buildFullPrompt(
      stopCase({ context: 'ENSEMBLE_COMMAND state=none session=from-marker', session_id: 'explicit' }),
      'discipline-stop'
    );
    expect(out).toMatch(/"session_id":\s*"explicit"/);
    expect(out).toContain('session=from-marker');
  });

  it('tolerates a context with no session= without throwing', () => {
    const out = judge.buildFullPrompt(stopCase({ context: 'ENSEMBLE_COMMAND state=none' }), 'discipline-stop');
    expect(out).not.toMatch(/"session_id"/);
  });
});
