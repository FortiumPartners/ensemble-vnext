'use strict';

/**
 * agent-routing.js — resolve which implementer a task needs.
 *
 * WHY THIS IS CODE AND NOT PROSE
 *
 * `implement-trd.md` §3.3 has always specified this resolution: the TRD's own `Agent:`
 * assignment wins, else a keyword match on the description, else `backend-implementer`.
 * All three steps lived in the command's prompt, so applying them depended on the
 * orchestrating model remembering to.
 *
 * It did not. The smoke harness caught it on 2026-08-28: `implement-one-task`'s
 * "an implementer agent invoked" assertion went red, with the task dispatched to the
 * GENERIC workflow subagent instead of a named implementer.
 *
 * That is not a cosmetic routing miss. An unset agentType does not mean "no agent" — it
 * means the generic subagent, which inherits the SESSION model. In an Opus-led session
 * ordinary implementation then runs on Opus: slower, and roughly 5x the price of the
 * Sonnet implementer that should have taken it. The same regression is recorded in
 * `implement-trd.md` at 367 Opus / 330 Sonnet before the item-8 rework vs 393 / 8 after.
 *
 * FAIL TOWARD THE CHEAPER AGENT. Being wrong about the specialism costs a competent
 * implementer working outside its strongest suit. Being unset silently escalates the model
 * tier for every unrouted task in the run, and shows up only as a cost line — never as an
 * error.
 */

/** Ordered: first table entry whose keyword appears wins. */
const KEYWORD_TABLE = [
  { agent: 'agent-implementer', keywords: ['llm', 'rag', 'prompt', 'embedding', 'vector', 'langgraph', 'langfuse', 'openai', 'anthropic', 'claude', 'gpt', 'sonar', 'retrieval', 'tool-calling', 'multi-agent'] },
  { agent: 'cicd-specialist', keywords: ['pipeline', 'github actions', ' ci ', ' cd ', 'ci/cd'] },
  { agent: 'devops-engineer', keywords: ['infra', 'deploy', 'docker', 'k8s', 'kubernetes', 'aws', 'cloud', 'terraform'] },
  { agent: 'mobile-implementer', keywords: ['mobile', 'flutter', 'react-native', 'ios', 'android'] },
  { agent: 'frontend-implementer', keywords: ['frontend', 'ui', 'component', 'react', 'vue', 'angular', 'web page', 'stylesheet', 'css'] },
  { agent: 'backend-implementer', keywords: ['backend', 'api', 'endpoint', 'database', 'server', 'service', 'migration'] },
];

const DEFAULT_AGENT = 'backend-implementer';

/** Strip the `@` sigil a TRD Execution Plan writes (`- Agent: @backend-implementer`). */
function normalizeDeclared(declared) {
  if (typeof declared !== 'string') return null;
  const name = declared.trim().replace(/^@/, '');
  return name.length ? name : null;
}

/**
 * @param {{agent?: string, description?: string, summary?: string, id?: string}} task
 * @returns {string} an agent name — never null, never undefined.
 */
function resolveAgentType(task) {
  if (!task || typeof task !== 'object') return DEFAULT_AGENT;

  // 1. The TRD's own assignment wins. The architect chose it with the whole design in
  //    front of them; keyword-matching a one-line summary re-derives the same decision
  //    from strictly less information.
  const declared = normalizeDeclared(task.agent);
  if (declared) return declared;

  // 2. Keyword match. Padded so ' ci ' cannot match inside "specific".
  const haystack = ` ${[task.description, task.summary].filter(Boolean).join(' ').toLowerCase()} `;
  for (const { agent, keywords } of KEYWORD_TABLE) {
    if (keywords.some((k) => haystack.includes(k))) return agent;
  }

  // 3. Never return unset. See the header.
  return DEFAULT_AGENT;
}

module.exports = { resolveAgentType, KEYWORD_TABLE, DEFAULT_AGENT };
