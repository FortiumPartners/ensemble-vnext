'use strict';

const { resolveAgentType, DEFAULT_AGENT } = require('./agent-routing');

describe('resolveAgentType', () => {
  describe('precedence 1: the TRD assignment wins', () => {
    it('uses task.agent even when a keyword would say otherwise', () => {
      // The architect chose with the whole design in view; a one-line summary carries less.
      expect(resolveAgentType({ agent: '@agent-implementer', description: 'build a react ui component' }))
        .toBe('agent-implementer');
    });
    it('strips the @ sigil a TRD Execution Plan writes', () => {
      expect(resolveAgentType({ agent: '@backend-implementer' })).toBe('backend-implementer');
      expect(resolveAgentType({ agent: 'backend-implementer' })).toBe('backend-implementer');
    });
    it('ignores a blank or non-string assignment and falls through', () => {
      expect(resolveAgentType({ agent: '  ', description: 'add a REST endpoint' })).toBe('backend-implementer');
      expect(resolveAgentType({ agent: 42, description: 'build a react component' })).toBe('frontend-implementer');
    });
  });

  describe('precedence 2: keyword match', () => {
    it.each([
      ['Build the dashboard React component', 'frontend-implementer'],
      ['Add a REST endpoint with validation', 'backend-implementer'],
      ['Design the RAG retrieval prompt', 'agent-implementer'],
      ['Provision the EKS cluster with terraform', 'devops-engineer'],
      ['Configure the release pipeline in GitHub Actions', 'cicd-specialist'],
      ['Add the Flutter offline sync screen', 'mobile-implementer'],
    ])('%s -> %s', (description, expected) => {
      expect(resolveAgentType({ description })).toBe(expected);
    });

    it('does not match " ci " inside an unrelated word', () => {
      // The padding exists so "specific"/"decision" cannot route to cicd-specialist.
      expect(resolveAgentType({ description: 'Write a specific decision record' })).toBe(DEFAULT_AGENT);
    });
  });

  describe('precedence 3: never unset', () => {
    // This is the whole point of the module. An unset agentType means the generic workflow
    // subagent, which inherits the SESSION model -- Opus in an Opus-led session, at ~5x the
    // price of the Sonnet implementer. Fail toward the cheaper agent, never the dearer one.
    it('defaults when no keyword matches', () => {
      // The exact fixture from implement-trd.md's measured regression: no routing noun.
      expect(resolveAgentType({ description: 'Create a module and add a Jest test' })).toBe(DEFAULT_AGENT);
    });
    it.each([[{}], [null], [undefined], ['not an object'], [{ description: '' }]])(
      'returns an agent for degenerate input: %p',
      (input) => {
        expect(resolveAgentType(input)).toBe(DEFAULT_AGENT);
      }
    );
  });
});
