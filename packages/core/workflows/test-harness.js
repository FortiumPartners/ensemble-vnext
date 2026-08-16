/**
 * Test harness for packages/core/workflows/*.js.
 *
 * These scripts are NOT CommonJS or ES modules -- they are prompt-DSL bodies executed by the
 * platform's own `Workflow` tool (lead-session only, no local runtime in this repo -- see
 * docs/TRD/implement-trd-rework.md). Their shape is: a leading `export const meta = {...}`,
 * then top-level `await agent(...)` / `parallel(...)` / `phase(...)` / `log(...)` calls against
 * globals the platform injects, and a bare top-level `return {...}` as the script's result.
 *
 * That is not valid as a real Node module (`export` outside an ESM file, and a bare `return`
 * outside a function, are both syntax errors under CommonJS `require`). This harness loads a
 * script's SOURCE TEXT, neutralises the one ESM keyword it uses (`export `), wraps the rest of
 * the file body in an async function so the top-level `await` and `return` become legal, and
 * calls that function with stub implementations of the five injected globals
 * (agent/parallel/pipeline/phase/log) plus `args`.
 *
 * This harness does not modify the workflow scripts under test -- it only reads and wraps them.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = __dirname;

/**
 * Load a workflow script's source text from packages/core/workflows/<name>.
 */
function readScript(filename) {
  return fs.readFileSync(path.join(WORKFLOWS_DIR, filename), 'utf8');
}

/**
 * Build a stub `agent()` that resolves calls against a caller-supplied plan.
 *
 * `plan` is either:
 *   - a function `(prompt, opts) => result` (or returning a Promise), called once per agent()
 *     invocation and free to inspect `opts.label` / `opts.agentType` to decide what to return, or
 *   - a Map/object keyed by `opts.label`, whose value is returned verbatim (a raw value, a
 *     thrown-shaped `{ throws: Error }` is NOT special-cased here -- tests that need a rejection
 *     should use the function form).
 *
 * Every call (prompt, opts) is recorded, in order, on `calls` -- this is what wave-sequencing
 * and agentType-passthrough assertions read.
 *
 * Returning `undefined` from a function plan, or omitting a label from a map plan, resolves the
 * agent() call to `null` -- the documented "agent died or was skipped" behaviour every script
 * under test is required to handle without throwing.
 */
function makeAgentStub(plan) {
  const calls = [];
  const resolvePlan = (prompt, opts) => {
    if (typeof plan === 'function') return plan(prompt, opts);
    const key = opts && opts.label;
    return plan && Object.prototype.hasOwnProperty.call(plan, key) ? plan[key] : undefined;
  };

  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts, at: calls.length });
    const result = await resolvePlan(prompt, opts);
    return result === undefined ? null : result;
  };
  agent.calls = calls;
  return agent;
}

/**
 * Build a stub `parallel()` that runs its thunks concurrently (matching the documented contract:
 * an array of zero-arg thunks, not raw promises) and records each call's thunk COUNT so wave-size
 * assertions don't need to reach into agent.calls.
 */
function makeParallelStub() {
  const waves = []; // one entry per parallel() call: { size, startedAt, finishedAt }
  const parallel = async (thunks) => {
    const wave = { size: thunks.length };
    waves.push(wave);
    const results = await Promise.all(thunks.map((thunk) => thunk()));
    return results;
  };
  parallel.waves = waves;
  return parallel;
}

/**
 * Run a workflow script's source text with stubbed globals.
 *
 * opts:
 *   agent:    an async (prompt, opts) => result function (use makeAgentStub for the common case)
 *   parallel: an async (thunks) => results[] function (use makeParallelStub for the common case)
 *   pipeline: optional; defaults to a stub that throws if called (no script under test uses it)
 *   phase:    optional; defaults to a recorder pushing titles onto `phases` (returned)
 *   log:      optional; defaults to a recorder pushing messages onto `logs` (returned)
 *   args:     the `args` global -- either a JSON-serializable object or a pre-stringified string
 *
 * Returns { result, phases, logs } where `result` is the script's top-level `return` value.
 */
async function runWorkflow(source, opts = {}) {
  const phases = [];
  const logs = [];
  const phase = opts.phase || ((title) => phases.push(title));
  const log = opts.log || ((msg) => logs.push(msg));
  const pipeline =
    opts.pipeline ||
    (() => {
      throw new Error('pipeline() was called but no stub was supplied for this test');
    });
  const agentFn = opts.agent || makeAgentStub({});
  const parallelFn = opts.parallel || makeParallelStub();
  const argsValue = opts.args === undefined ? {} : opts.args;

  // The only ESM syntax these scripts use is the leading `export `. Strip it so the remaining
  // body -- top-level const/await/return -- is legal inside a plain async function.
  const body = source.replace(/^export\s+const\s+meta\s*=/m, 'const meta =');

  // eslint-disable-next-line no-new-func -- intentional: this IS the harness's job.
  const factory = new Function(
    'agent',
    'parallel',
    'pipeline',
    'phase',
    'log',
    'args',
    `return (async () => {\n${body}\n})();`
  );

  const result = await factory(agentFn, parallelFn, pipeline, phase, log, argsValue);
  return { result, phases, logs };
}

module.exports = { readScript, runWorkflow, makeAgentStub, makeParallelStub, WORKFLOWS_DIR };
