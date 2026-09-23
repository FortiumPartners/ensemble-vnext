export const meta = {
  name: 'implement-phase',
  description: 'Execute one phase of a TRD implementation: dispatch its tasks by wave, then gate the phase',
  whenToUse: 'Invoked by /implement-trd once per phase, after the command has computed the wave partition (task-graph.js) and pre-assembled every prompt this script needs. This script opens no file and runs no shell -- every input arrives in args. It dispatches each eligibility wave of tasks in parallel, awaits sequentially between waves so a later wave never starts before an earlier one that shares a touched file finishes, then gates the phase with verify-app, code-simplifier and a phase-scoped code review.',
  phases: [
    { title: 'Dispatch', detail: 'run each wave of tasks in parallel, sequential between waves (D7)' },
    { title: 'Gate', detail: 'verify-app, then phase-scoped code review' },
  ],
}

// ---------------------------------------------------------------------------
// implement-phase is deliberately NOT pipeline(). pipeline() runs every item through the
// same ordered stages -- fine for a flat batch, but this workflow has a wave partition with
// heterogeneous per-chain dependency ordering (task-graph.js's union graph): wave N+1 must
// not start until every task in wave N that shares a touched file has actually finished, and
// that's a property of the GRAPH, not a fixed per-item stage list. Sequential `await` between
// waves expresses that directly; pipeline() cannot (D7).
//
// The runtime gives this script no filesystem, no shell, and no Date.now()/Math.random()/
// argless `new Date()` -- verbatim "No filesystem or Node.js API access." Every input this
// script needs -- the TRD path (cited in prompts, never opened), the wave partition, each
// task's fully-assembled delegation prompt, and the three gate prompts -- arrives in `args`,
// assembled by the command, which has the filesystem this script does not.
//
// args: {
//   trd:     string,   path to the TRD, for citation only -- never opened here
//   phase:   number,   1-based phase number
//   tasks:   { waves: string[][], records: (Task & { prompt: string, agentType?: string })[] }
//   gate:    { verifyPrompt: string, simplifyPrompt: string, reviewPrompt: string }
//   project: string,   project root; '' means the repo the workflow runs in (unused here --
//                      passed through only because verify-app/code-simplifier/review prompts
//                      already carry whatever path context they need; this script never
//                      resolves a path itself)
// }
// ---------------------------------------------------------------------------

// Copied from audit-trd.js (ITR-B008's grounding names this as reuse, not reinvention).
function readArgs(raw) {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch (e) {
      throw new Error('workflow args arrived as a string and is not valid JSON. Pass args as an actual JSON object.')
    }
  }
  return raw || {}
}

// Copied from audit-trd.js. audit-trd.js uses this to hard-fail its single-agent Index stage,
// where nothing downstream can run without it. This workflow's own Error Handling (§3.4)
// deliberately does NOT take that path for task or gate agents: a dead task/gate agent is
// recorded as a failure in the return value instead of thrown, because AC-F16.6 gives the
// COMMAND the retry decision -- a thrown exception here would take that decision away by
// crashing the whole phase over one dead agent instead of returning a structured partial
// result the command can act on. The guard is kept available (and matches audit-trd.js's
// shape exactly) for any stage this workflow later adds where nothing downstream CAN run
// without it -- none of today's stages qualify.
function required(value, stage) {
  if (value === null || value === undefined) {
    throw new Error(`${stage} stage returned no result (the agent died or was skipped). Nothing downstream can run without it.`)
  }
  return value
}

const a = readArgs(args)
const TRD = a.trd
const PHASE = a.phase
const TASKS = a.tasks || {}
const WAVES = TASKS.waves || []
const RECORDS = TASKS.records || []
const GATE = a.gate || {}

if (!TRD) throw new Error('implement-phase: args.trd (the TRD path, for citation) is required')
if (PHASE === undefined || PHASE === null) throw new Error('implement-phase: args.phase (1-based phase number) is required')
if (!Array.isArray(WAVES)) {
  throw new Error('implement-phase: args.tasks.waves is required and must be an array of waves')
}

// EVERY RECORD MUST APPEAR IN A WAVE. `records` is the phase's non-success tasks and `waves`
// is those same ids partitioned, so the two sets are equal by construction -- and a record
// missing from every wave is a task that will never be dispatched, never reported, and
// invisible in the result.
//
// Measured 2026-09-23: a 13-task TRD reached this workflow with a 6-task wave list, because
// a dependency cycle in task-graph.js dropped 7 tasks and everything downstream of them out
// of the levelisation. Nothing here caught it. The four bad-result shapes below all concern
// tasks this workflow WAS given, so 7 tasks it was never given produced nothing to report:
// every task it received could succeed and the phase would return `complete`. That is the
// phantom-success failure `--reconcile` exists to catch after the fact, arriving through a
// door nothing watched.
//
// The cycle itself is fixed in task-graph.js. This check is deliberately BROADER than that
// cause: it fails on any short wave list, whatever produced it.
{
  const waveIds = new Set(WAVES.flat())
  const dropped = RECORDS.map((r) => r && r.id).filter((id) => id && !waveIds.has(id))
  if (dropped.length) {
    throw new Error(
      `implement-phase: ${dropped.length} task(s) have a record but appear in no wave and would ` +
      `never be dispatched: ${dropped.join(', ')}. ` +
      `records=${RECORDS.length} waves=${waveIds.size}. ` +
      `The wave partition does not cover this phase's task set -- check task-graph.js's ` +
      `\`cycles\` before dispatching; a cycle drops its members and everything downstream.`
    )
  }
}
// An EMPTY waves array is a legitimate state, not an error: every task in this phase is
// already `success`, which is what a --resume sees after a crash between this workflow
// returning and the command writing its Step 5 checkpoint. Throwing there turned an
// ordinary resume into an unhandled workflow error -- the command has no catch around this
// call -- so the phase could never be closed out. Return the shape a completed phase
// returns, with the gate marked skipped so nothing downstream mistakes it for a gate that
// ran and passed.
if (WAVES.length === 0) {
  log(`Phase ${PHASE}: no remaining tasks -- every task already succeeded; skipping to checkpoint`)
  return {
    phase: PHASE,
    tasks: [],
    status: 'complete',
    skipped: true,
    gate: {
      verify: 'skipped',
      simplify: 'skipped',
      simplifyReported: false,
      reviewReported: false,
      postSimplify: null,
      review: { findings: 0, applied: 0, reported: 0, summary: [] },
    },
  }
}

const recordsById = {}
for (const rec of RECORDS) {
  if (rec && rec.id) recordsById[rec.id] = rec
}

// --------------------------------------------------------------------------- 1. DISPATCH

phase('Dispatch')

// What each task agent is asked to return. Only status/filesChanged/error cross back into
// this script's return value (AC-F16.7 -- no per-task agent OUTPUT reaches the orchestrator,
// only this small structured summary).
const TASK_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'filesChanged'],
  properties: {
    status: { type: 'string', enum: ['success', 'failed'] },
    filesChanged: { type: 'array', items: { type: 'string' } },
    error: { type: 'string', description: 'present only when status is failed' },
  },
}

const taskResults = {} // id -> { id, status, filesChanged, error? }

for (let w = 0; w < WAVES.length; w++) {
  const wave = WAVES[w]
  log(`wave ${w + 1}/${WAVES.length}: dispatching ${wave.length} task(s): ${wave.join(', ')}`)

  const waveOutcomes = await parallel(
    wave.map((id) => () => {
      const rec = recordsById[id]
      if (!rec || !rec.prompt) {
        // Not the agent-died case below -- the command's records array simply did not carry
        // this wave id. Fail loud in the return value rather than silently skipping it, since
        // a missing record here means the command's wave/records pairing is broken.
        return Promise.resolve({ id, missingRecord: true })
      }
      const opts = { label: `task:${id}`, phase: `Phase ${PHASE}`, schema: TASK_RESULT_SCHEMA }
      // The Task shape trd-parser.js emits has no implementer-type column -- the command is
      // expected to resolve which implementer a task needs (backend/frontend/mobile/agent)
      // and carry it as `record.agentType`, the same way create-trd.js's author stage passes
      // agentType: 'technical-architect' (attested: agent() accepts opts.agentType).
      //
      // When it does not, DEFAULT rather than letting the platform decide. An unset
      // agentType does not mean "no agent" -- it means the generic workflow subagent, which
      // inherits the SESSION model. In an Opus-led session that silently runs ordinary
      // implementation on Opus at roughly 5x the price of the Sonnet implementer that should
      // have taken it, and slower. implement-trd.md's routing rule already says "When neither
      // the TRD nor a keyword decides, use `backend-implementer`. Do NOT leave `agentType`
      // unset" -- but that was a PROMPT instruction with nothing enforcing it, and the smoke
      // harness caught it failing: implement-one-task's "an implementer agent invoked"
      // assertion went red on 2026-08-28 with the task dispatched to the generic subagent.
      //
      // Fail toward the cheaper agent, never toward the more expensive one: being wrong about
      // backend-implementer costs a competent implementer on the wrong specialism, while an
      // unset type silently escalates the model tier for every unrouted task in the run.
      opts.agentType = rec.agentType || 'backend-implementer'
      return agent(rec.prompt, opts).then((r) => ({ id, result: r }))
    })
  )

  for (const outcome of waveOutcomes) {
    if (!outcome) continue // parallel() itself dropped an entry; nothing to key it to
    const { id, missingRecord, result } = outcome
    if (missingRecord) {
      taskResults[id] = { id, status: 'failed', filesChanged: [], error: 'no record with a prompt for this task id in args.tasks.records' }
      continue
    }
    // agent() returns null when the agent died or was skipped (documented behaviour, same as
    // audit-trd.js's VERIFIERS wave) -- record the failure explicitly rather than
    // dereferencing a null result.
    if (!result) {
      taskResults[id] = { id, status: 'failed', filesChanged: [], error: 'agent returned nothing (the agent died or was skipped)' }
      continue
    }
    taskResults[id] = {
      id,
      status: result.status === 'success' ? 'success' : 'failed',
      filesChanged: result.filesChanged || [],
      ...(result.error ? { error: result.error } : {}),
    }
  }
}

const taskList = WAVES.flat().map((id) => taskResults[id] || { id, status: 'failed', filesChanged: [], error: 'never dispatched' })
const deadTasks = taskList.filter((t) => t.status === 'failed')
if (deadTasks.length > 0) {
  log(`WARNING: ${deadTasks.length}/${taskList.length} task(s) failed this phase: ${deadTasks.map((t) => t.id).join(', ')}`)
}

// --------------------------------------------------------------------------- 2. GATE

phase('Gate')

// verify-app and code-simplifier run as named agents dispatched from inside this workflow
// (attested: agent() accepts opts.agentType). Both run in the foreground -- neither needs to
// be a background subagent (that requirement, AC-F8.4/NFR-4/AC-N4, applies only to the
// review below), and verify-app's own frontmatter declares `background: true` and
// `disallowedTools: Agent`, so it cannot fan out further even if asked to.
const verifyResult = await agent(GATE.verifyPrompt, {
  label: 'gate:verify-app',
  phase: `Phase ${PHASE}`,
  agentType: 'verify-app',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['pass', 'fail'] },
      notes: { type: 'string' },
    },
  },
})
if (!verifyResult) log('WARNING: gate:verify-app returned nothing -- treating the phase gate as failed on this stage')
const verifyStatus = verifyResult ? verifyResult.status : 'fail'
log(`gate: verify-app -> ${verifyStatus}`)

// REMOVED 2026-08-18: gate:code-simplifier and gate:verify-app (post-simplify).
//
// The simplifier reported `no-change` in every phase of every measured run, and the
// post-simplify re-verify exists ONLY to catch a simplifier that broke something -- so it
// never fired either. Together they were 1-2 of the gate's 4 agents for zero observed
// benefit, paid once per phase forever.
//
// The post-simplify re-verify was itself added on 2026-08-16 to fix a real defect (gateOk
// read a verifyStatus captured before the simplifier ran, so a refactor that reddened the
// suite still passed). Removing the simplifier removes the defect's cause, so the fix goes
// with it rather than guarding a stage that no longer exists.
//
// Refactoring is not abandoned -- it moves to where it has an objective. The end-of-run
// hardening pass still reviews the whole branch, and a task whose TRD asks for refactoring
// gets an implementer that does it.
const simplifyStatus = 'skipped'
const simplifyReported = false
const postSimplifyStatus = null

// REMOVED 2026-08-28 (owner ruling, plan item 14): gate:review.
//
// Per-phase code review is gone; review happens ONCE, at the end of the run, where the
// end-of-run hardening pass already reads the whole branch diff. This is the same move made
// for gate:code-simplifier on 2026-08-18, for the same reason and with the same result:
// a stage paid once per phase, forever, for benefit nobody could point at.
//
// The evidence that settled it: across every implement.json in the framework repo -- 279
// tasks, 11 features -- there are ZERO failed tasks and ZERO retries. The phase gate's
// failure path has never fired, so the usual defence ("it bounds failure to one phase, a
// phase-1 defect cannot compound into phase 4") describes something with no observed
// instances. What the review actually did was find-and-fix inline, which the end-of-run pass
// does over a strictly larger diff.
//
// The owner priced the one property that survived -- gates run before each checkpoint commit,
// so committed work was reviewed work: "Committed work with possible issues is acceptable.
// PRs are where we consider it complete, tested code."
//
// Review is NOT abandoned and does NOT become a manual step: the end-of-run pass is still
// dispatched by this command, automatically, on every run.
const reviewReported = false
const reviewFindings = 0
const reviewApplied = 0
const reviewOpen = 0
const reviewSummary = []

// --------------------------------------------------------------------------- RETURN

const allTasksOk = deadTasks.length === 0
// Both verify passes must be green. postSimplifyStatus is null when the simplifier changed
// nothing, in which case there is nothing new to verify and the first pass stands.
// postSimplifyStatus is always null now (the stage is gone); kept in the return shape so a
// consumer reading gate.postSimplify sees an explicit null rather than an absent key.
const gateOk = verifyStatus === 'pass'
const status = allTasksOk && gateOk ? 'complete' : 'failed'

return {
  phase: PHASE,
  tasks: taskList,
  gate: {
    verifyApp: verifyStatus,
    simplify: simplifyStatus,
    // *Reported flags distinguish "the agent ran and said this" from "the agent died and we
    // defaulted". Without them a dead reviewer's `findings: 0` is byte-identical to a clean
    // review, and that laundered "the reviewer died" into "the reviewer approved" in the
    // checkpoint commit message and the PHASE banner -- a durable git record asserting a
    // review that never happened.
    simplifyReported,
    reviewReported,
    postSimplify: postSimplifyStatus,
    review: { findings: reviewFindings, applied: reviewApplied, reported: reviewOpen, summary: reviewSummary },
  },
  status,
}
