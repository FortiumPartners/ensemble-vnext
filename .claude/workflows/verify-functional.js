export const meta = {
  name: 'verify-functional',
  description:
    'Run the bounded functional-verification loop: Exercise, Judge, and (when needed) Debug, once per iteration, until the criteria are satisfied, found unbuilt, stalled, or the iteration cap is reached.',
  whenToUse:
    'Invoked once (not looped) when --verify-functional is set. This script owns the whole bounded loop (D1) -- the caller dispatches it a single time. Every input arrives in args: the success-definition criteria, the contract text, project notes/stack hints, evidence paths, the checker CLI path, the HEAD commit time, the iteration cap, state/report paths, and an optional resume snapshot from a prior run\'s state file (D13).',
  phases: [
    { title: 'Exercise', detail: 'one verify-app agent walks every criterion against the running system (D2)' },
    { title: 'Judge', detail: 'one untyped agent runs the checker CLI first, reads content only for tier-1 passes, decides next, and writes state/report (D4, D7, §3.3a)' },
    { title: 'Debug', detail: 'one app-debugger agent, dispatched only on remediate, fixes gaps in place (D8)' },
  ],
}

// ---------------------------------------------------------------------------
// This script owns the entire bounded functional-verification loop (D1). It has no
// filesystem, no shell and no require -- everything that touches disk (the checker CLI, state
// persistence, report rendering) is done by the Judge agent it dispatches, which has Read/
// Write/Bash (§3.3a "Why an agent and not the script"). Each iteration is exactly three
// sequential agent() calls (D2): Exercise, Judge, and (only when the Judge asks for it) Debug.
//
// There is no fan-out helper call anywhere in this file, and no reference to a task graph,
// concurrency batches, per-criterion touched-file bookkeeping, or the requirements document
// this feature was specified in. An earlier version of this loop used all four; none of that
// machinery is reconstructed here (D2, D7, D8): the per-criterion fan-out for Exercise/Judge
// is gone, the separate persistence stage is folded into the Judge, and multi-agent
// wave-partitioned remediation is replaced by one Debug agent per iteration.
// ---------------------------------------------------------------------------

// Copied verbatim from implement-phase.js, which copied it from audit-trd.js.
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

// Copied verbatim from implement-phase.js, which copied it from audit-trd.js. Unlike
// implement-phase.js's Dispatch/Gate stages -- which deliberately do NOT use this for a dead
// task/gate agent -- the Judge stage below DOES use it: nothing was written to disk and the
// loop has no decision without it, matching audit-trd.js's own Index stage. Exercise and Debug
// follow implement-phase.js's other path instead: a dead agent there is recorded in the return
// value and the loop continues.
function required(value, stage) {
  if (value === null || value === undefined) {
    throw new Error(`${stage} stage returned no result (the agent died or was skipped). Nothing downstream can run without it.`)
  }
  return value
}

const a = readArgs(args)
const CRITERIA = a.criteria
if (!Array.isArray(CRITERIA)) {
  throw new Error('verify-functional: args.criteria is required and must be an array (possibly empty)')
}
const CONTRACT = a.contract || ''
const NOTES = a.notes || ''
const STACK_HINTS = a.stackHints || ''
const EVIDENCE_DIR = a.evidenceDir
const CHECKER = a.checker
const SINCE = a.since
const CAP = a.cap
if (!Number.isInteger(CAP) || CAP < 1) {
  // Unvalidated, a missing/non-numeric cap makes `iteration <= CAP` false on the very first
  // check: the loop body never runs, zero agents dispatch, and the caller gets a `stuck`
  // result reading "iteration cap (undefined) reached" -- a silent no-op dressed as a stuck
  // outcome. `cap` is a required field of VerifyFunctionalArgs (§3.3), same standing as
  // `criteria`, so it gets the same treatment: fail loudly here rather than downstream.
  throw new Error('verify-functional: args.cap is required and must be a positive integer (the iteration cap, ordinarily 3)')
}
const STATE_PATH = a.statePath
const REPORT_PATH = a.reportPath
// Finding A (FV-B005): renderReport()'s header needs feature/prd/definitionPath and nothing
// in §3.3's original interface supplied them -- every report rendered "undefined" for all
// three. Resolved by adding them to VerifyFunctionalArgs (this is the one place the judge,
// which has no other context, can get them from) rather than dropping them from
// renderReport() -- the report's header is meaningless without a feature name and a source
// PRD, and functional-verification.test.js already exercises renderReport() with all three.
const FEATURE = a.feature || ''
const PRD = a.prd || ''
const DEFINITION_PATH = a.definitionPath || ''
// Scratch directory for judge-input payload files (Finding: shell-quoting hazard, §3.3a).
// Free-text `reason` strings from the exerciser can carry an apostrophe ("couldn't start the
// server"), which would terminate a `'<json>'`-quoted shell argument mid-command. Payload
// files sidestep that: the judge writes JSON to disk (a plain write, not a content-read of
// evidence -- it does not violate the "checker call before any content reading" ordering
// constraint) and passes the CLI a `--file <path>` instead of interpolating the JSON text.
const STATE_DIR = STATE_PATH.replace(/\/[^/]*$/, '')
const RESUME = a.resume || null
const PROJECT = a.project || ''
const N = CRITERIA.length

// Same lesson as audit-trd.js's and audit-build.js's SCOPE: an agent that resolves paths
// against the wrong repository boots the wrong system and reports gaps that do not exist.
const SCOPE = PROJECT
  ? `\nPATH SCOPING. The system under verification lives at ${PROJECT}. Every source, test, ` +
    `config, evidence and state path resolves against THAT project, not against the ` +
    `repository this script runs in. Bring THAT project up, and resolve a path there before ` +
    `reporting anything missing.\n`
  : ''

// --------------------------------------------------------------------------- prompt builders

function criteriaJson() {
  return JSON.stringify(CRITERIA)
}

function buildExercisePrompt(iteration) {
  return (
    `Functional verification -- Exercise stage, iteration ${iteration}.\n${SCOPE}\n` +
    `Contract:\n${CONTRACT}\n\n` +
    `Project notes (what prior runs learned about running this project):\n${NOTES || '(none)'}\n\n` +
    `Stack hints:\n${STACK_HINTS}\n\n` +
    `Evidence directory: ${EVIDENCE_DIR}\n\n` +
    `Bring the system up ONCE, then walk every one of the following ${N} criteria and produce ` +
    `one claim per criterion -- an artifact path under the evidence directory that proves it, ` +
    `or (when none exists) a stated reason. Every criterion below must appear in your "claims" ` +
    `array exactly once, id-for-id -- do not narrow to a subset.\n\n` +
    `Criteria:\n${criteriaJson()}\n\n` +
    `You own .claude/verification-notes.md (D6): read it before you start, and if anything in ` +
    `this run taught you something worth recording -- a stale hint, a corrected port or ` +
    `command, a substituted evidence artifact -- add or correct a marked line ([ran]/[read]/` +
    `[inferred], per the contract) before you return. Report whether you touched that file.\n\n` +
    `Return { "claims": [ { "criterion": "<id>", "artifact": "<path>" | null, "reason": ` +
    `"<string, present when artifact is null>" }, ... ], "notesUpdated": <true when you added ` +
    `or corrected a line in .claude/verification-notes.md this run, false otherwise> }.`
  )
}

function buildJudgePrompt({ iteration, claims, previousGaps, forcedUnbuilt, exerciseNotesUpdated }) {
  const claimsJson = JSON.stringify(claims)
  const prevGapsJson = JSON.stringify(previousGaps)
  const claimsFile = `${STATE_DIR}/judge-claims-${iteration}.json`
  const decideFile = `${STATE_DIR}/judge-decide-${iteration}.json`
  const reportInputFile = `${STATE_DIR}/judge-report-input-${iteration}.json`
  const forced =
    forcedUnbuilt && forcedUnbuilt.length
      ? `\n\nThe Debug stage that just ran reported these criteria as UNBUILT (absent capability, ` +
        `not broken behaviour) and did not attempt them: ${JSON.stringify(forcedUnbuilt)}. Carry ` +
        `them into "unbuilt" on this call rather than re-deriving them.`
      : ''
  return (
    `Functional verification -- Judge stage, iteration ${iteration}.\n${SCOPE}\n` +
    `You are the loop's hands -- every decision comes from the CLI below, you supply the ` +
    `filesystem and process access the script does not have. Do the following IN THIS ORDER:\n\n` +
    `A NOTE ON THE CLI CALLS BELOW: free-text "reason" strings (yours or the exerciser's) can ` +
    `contain an apostrophe or other shell-special character, which breaks a '<json>'-quoted ` +
    `argument. Do not interpolate JSON into the command line. Instead, WRITE each payload to ` +
    `the file path given below and pass it with --file <path> -- writing a payload file is a ` +
    `plain file write, not a content-read of evidence, so it does not violate STEP 1's ordering ` +
    `requirement.\n\n` +
    `STEP 1 (do this FIRST, before reading any file content): write the claims JSON below to ` +
    `${claimsFile}, then run the evidence checker over the whole claim set:\n` +
    `  node ${CHECKER} check-evidence --file ${claimsFile} ${SINCE}\n\n` +
    `STEP 2: only for the criteria whose tier-1 verdict just came back "pass", read the ` +
    `evidence artifact's content and decide, per criterion, one of "met" / "not_met" / ` +
    `"not_verifiable" / "unbuilt", with a reason and implicated files for anything not met. A ` +
    `criterion whose tier-1 verdict is "fail" is "not_met" unless its stated reason shows it is ` +
    `genuinely "not_verifiable" here -- never invent content you have not read.\n\n` +
    `STEP 3: decide the loop's next action -- write ` +
    `{"iteration":${iteration},"gaps":<not_met ids>,"unbuilt":<unbuilt ids>,` +
    `"previousGaps":${prevGapsJson},"cap":${CAP}} to ${decideFile}, then run:\n` +
    `  node ${CHECKER} decide-next --file ${decideFile}\n\n` +
    `STEP 4: persist the run's state to ${STATE_PATH}, BEFORE anything else is dispatched. ` +
    `Write EXACTLY these three top-level keys, spelled exactly as given -- the command that ` +
    `dispatched this workflow reads them straight back to compose a --resume snapshot ` +
    `(implement-trd Step 8.2), and a key it does not recognise is read as absent, which ` +
    `silently restarts the loop at iteration 1 with no memory of this run:\n` +
    `  {"iteration": ${iteration}, "criteria": [ <one entry per criterion: "id", "status", ` +
    `"artifact"> ], "gapsClosed": [ <the gaps-closed history with this iteration appended> ]}` +
    `\n\n` +
    `STEP 5: on any exit action (anything other than "remediate"), write the render-report input ` +
    `to ${reportInputFile} -- it MUST include "feature": ${JSON.stringify(FEATURE)}, "prd": ` +
    `${JSON.stringify(PRD)} and "definitionPath": ${JSON.stringify(DEFINITION_PATH)} verbatim ` +
    `(do not invent or omit these three -- they are the report's header, supplied by the ` +
    `command that dispatched this workflow) alongside "outcome", "reason" and "criteria" (one ` +
    `entry per criterion: id, statement, cites, status, artifact, reason, attempts, blocker), ` +
    `then run:\n` +
    `  node ${CHECKER} render-report --file ${reportInputFile}\n` +
    `and write the output to ${REPORT_PATH}.\n\n` +
    `STEP 6: on "remediate", do not render a report and do not touch anything besides the state ` +
    `file already written in STEP 4 -- just return the gap set.\n\n` +
    `All criteria (full definition):\n${criteriaJson()}\n\n` +
    `This iteration's Exercise claims:\n${claimsJson}\n\n` +
    `Previous iteration's gaps (null on a fresh run's first iteration): ${prevGapsJson}${forced}\n\n` +
    `The Exercise agent (which owns .claude/verification-notes.md, D6) reports it ` +
    `${exerciseNotesUpdated ? 'DID' : 'did NOT'} add or correct a line in that file this ` +
    `iteration. Forward that value unchanged as "notesUpdated" below -- you do not read or ` +
    `write the notes file yourself, so do not re-derive this.\n\n` +
    `Return { "action": "exit-satisfied"|"exit-unbuilt"|"exit-stalled"|"exit-stuck"|"remediate", ` +
    `"reason": "<string>", "criteria": [ { "id","status","tier1","artifact","reason","files" }, ` +
    `... one entry per criterion in the definition ], "gaps": [<not_met ids>], "unbuilt": ` +
    `[<unbuilt ids>], "closed": [<ids decide-next reported closed>], "notesUpdated": <boolean>, ` +
    `"debugGaps": [ { "id","statement","reason","artifact","files" }, ... present only when ` +
    `action is "remediate" ] }.`
  )
}

function buildDebugPrompt(debugGaps) {
  return (
    `Functional verification -- Debug stage.\n${SCOPE}\n` +
    `The Judge found the following gap(s) still open. Fix the code in place, one gap at a time. ` +
    `Do not re-verify -- the next Exercise/Judge pair is the check, seconds later. If a gap ` +
    `turns out to be an absent capability rather than broken behaviour, report it as "unbuilt" ` +
    `rather than implementing it -- that is your own stated exclusion.\n\n` +
    `Gaps:\n${JSON.stringify(debugGaps)}\n\n` +
    `Project notes:\n${NOTES || '(none)'}\n\n` +
    `Stack hints:\n${STACK_HINTS}\n\n` +
    `Contract:\n${CONTRACT}\n\n` +
    `Return { "results": [ { "criterion": "<id>", "result": "<what you changed, or why you ` +
    `could not>", "unbuilt": <true when this gap is absent capability, omit or false otherwise> ` +
    `}, ... ] }.`
  )
}

// --------------------------------------------------------------------------- schemas

const EXERCISE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claims'],
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterion'],
        properties: {
          criterion: { type: 'string' },
          artifact: { type: ['string', 'null'] },
          reason: { type: 'string' },
        },
      },
    },
    notesUpdated: { type: 'boolean' },
  },
}

const JUDGE_CRITERION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'status'],
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: ['met', 'not_met', 'not_verifiable', 'unbuilt'] },
    tier1: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
    artifact: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
    files: { type: 'array', items: { type: 'string' } },
  },
}

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'reason', 'criteria', 'gaps', 'unbuilt', 'closed'],
  properties: {
    action: { type: 'string', enum: ['exit-satisfied', 'exit-unbuilt', 'exit-stalled', 'exit-stuck', 'remediate'] },
    reason: { type: 'string' },
    criteria: { type: 'array', items: JUDGE_CRITERION_SCHEMA },
    gaps: { type: 'array', items: { type: 'string' } },
    unbuilt: { type: 'array', items: { type: 'string' } },
    closed: { type: 'array', items: { type: 'string' } },
    notesUpdated: { type: 'boolean' },
    debugGaps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string' },
          statement: { type: 'string' },
          reason: { type: 'string' },
          artifact: { type: ['string', 'null'] },
          files: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const DEBUG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterion', 'result'],
        properties: {
          criterion: { type: 'string' },
          result: { type: 'string' },
          unbuilt: { type: 'boolean' },
        },
      },
    },
  },
}

// --------------------------------------------------------------------------- result assembly

const OUTCOME_BY_ACTION = {
  'exit-satisfied': 'satisfied',
  'exit-unbuilt': 'unbuilt',
  'exit-stalled': 'stalled',
  'exit-stuck': 'stuck',
}

function buildFinalResult(judgeResult, iterations, debugAttempts, exercisedLabel) {
  return {
    outcome: OUTCOME_BY_ACTION[judgeResult.action] || 'stuck',
    reason: judgeResult.reason || '',
    iterations,
    reportPath: REPORT_PATH,
    criteria: judgeResult.criteria || [],
    gaps: judgeResult.gaps || [],
    unbuilt: judgeResult.unbuilt || [],
    exercised: exercisedLabel,
    debugAttempts,
    notesUpdated: Boolean(judgeResult.notesUpdated),
  }
}

// --------------------------------------------------------------------------- empty criteria

// Zero criteria is a legitimate outcome (the success definition's own AC-3), not an error: the
// definition step already reported it. Skip Exercise and Debug entirely -- there is nothing to
// exercise or fix -- and run exactly one Judge call so the empty report still gets written.
if (N === 0) {
  phase('Judge')
  const judgeResult = required(
    await agent(buildJudgePrompt({ iteration: 0, claims: [], previousGaps: null, forcedUnbuilt: null }), {
      label: 'judge',
      phase: 'Judge',
      schema: JUDGE_SCHEMA,
    }),
    'Judge'
  )
  return buildFinalResult(judgeResult, 0, [], '0/0')
}

// --------------------------------------------------------------------------- the loop

// A resume snapshot is read off disk by the caller, so treat its shape as untrusted: a state
// file missing `iteration` would otherwise produce NaN (a loop that never runs, reported as a
// cap exhaustion that never happened), and one missing `criteria` would throw here.
const RESUME_ITERATION = RESUME && Number.isFinite(Number(RESUME.iteration)) ? Number(RESUME.iteration) : 0
const RESUME_CRITERIA = RESUME && Array.isArray(RESUME.criteria) ? RESUME.criteria : null

let iteration = RESUME_ITERATION + 1
let previousGaps = RESUME_CRITERIA ? RESUME_CRITERIA.filter((c) => c.status === 'not_met').map((c) => c.id) : null
const debugAttempts = []
let exercisedLabel = `0/${N}`
let skipExercise = false
let forcedUnbuilt = null

for (; iteration <= CAP; iteration++) {
  let claims
  let exerciseNotesUpdated = false

  if (skipExercise) {
    // The previous iteration's Debug stage reported one or more gaps as unbuilt -- re-walking
    // the system to rediscover that the code is missing is exactly the waste this skip exists
    // to avoid. The Judge below is told directly, via `forcedUnbuilt`.
    claims = []
    // `exercised` is defined (§3.3) as the FINAL iteration's figure -- this iteration exercised
    // nothing, so the label must say so here rather than retaining whatever the last Exercise
    // that actually ran happened to report. Left stale, a report could claim "5/6 exercised" on
    // an iteration where zero criteria were walked.
    exercisedLabel = `0/${N}`
    log(`iteration ${iteration}: skipping Exercise -- Debug reported unbuilt gaps last iteration`)
  } else {
    phase('Exercise')
    const exerciseResult = await agent(buildExercisePrompt(iteration), {
      label: 'exercise',
      phase: 'Exercise',
      agentType: 'verify-app',
      schema: EXERCISE_SCHEMA,
    })
    if (!exerciseResult) {
      log(`iteration ${iteration}: Exercise returned nothing -- recording every criterion as not_met`)
      claims = CRITERIA.map((c) => ({ criterion: c.id, artifact: null, reason: 'exerciser returned nothing' }))
      exercisedLabel = `0/${N}`
    } else {
      claims = exerciseResult.claims || []
      exercisedLabel = `${claims.length}/${N}`
      exerciseNotesUpdated = Boolean(exerciseResult.notesUpdated)
    }
  }

  phase('Judge')
  const judgeResult = required(
    await agent(buildJudgePrompt({ iteration, claims, previousGaps, forcedUnbuilt, exerciseNotesUpdated }), {
      label: 'judge',
      phase: 'Judge',
      schema: JUDGE_SCHEMA,
    }),
    'Judge'
  )
  skipExercise = false
  forcedUnbuilt = null

  if (judgeResult.action !== 'remediate') {
    return buildFinalResult(judgeResult, iteration, debugAttempts, exercisedLabel)
  }

  previousGaps = judgeResult.gaps || []

  phase('Debug')
  const debugResult = await agent(buildDebugPrompt(judgeResult.debugGaps || []), {
    label: 'debug',
    phase: 'Debug',
    agentType: 'app-debugger',
    schema: DEBUG_SCHEMA,
  })

  if (!debugResult) {
    // Following implement-phase.js's pattern for a dead task agent: record the failure and
    // continue rather than dereferencing null. Nothing was fixed, so no gap closes -- the next
    // Judge call reaches its own stalled exit by the ordinary rule, without this script having
    // to introduce a new one.
    log(`iteration ${iteration}: Debug returned nothing -- gaps stay open`)
    debugAttempts.push({ iteration, gaps: previousGaps, result: 'agent returned nothing' })
    continue
  }

  const results = debugResult.results || []
  debugAttempts.push({
    iteration,
    gaps: previousGaps,
    result: results.length ? results.map((r) => `${r.criterion}: ${r.result}`).join('; ') : 'no results returned',
  })

  const unbuiltIds = results.filter((r) => r.unbuilt).map((r) => r.criterion)
  if (unbuiltIds.length > 0) {
    skipExercise = true
    forcedUnbuilt = unbuiltIds
  }
}

// The Judge's own decide-next call includes an `iteration >= cap` rule that should already have
// produced an exit action on the last in-bounds iteration. Reaching here means that did not
// happen -- report it plainly rather than let the loop fall through silently.
return {
  outcome: 'stuck',
  reason: `iteration cap (${CAP}) reached without the Judge returning an exit action`,
  iterations: CAP,
  reportPath: REPORT_PATH,
  criteria: [],
  gaps: previousGaps || [],
  unbuilt: [],
  exercised: exercisedLabel,
  debugAttempts,
  notesUpdated: false,
}
