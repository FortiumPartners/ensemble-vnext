export const meta = {
  name: 'verify-functional',
  description:
    'Run the bounded functional-verification loop: Exercise, Judge, and (when needed) Debug, once per iteration, until the criteria are satisfied, found unbuilt, stalled, found insufficiently covered, or the iteration cap is reached.',
  whenToUse:
    'Invoked once (not looped) by /implement-trd (unless --no-verify is set) and by /verify-build. This script owns the whole bounded loop (D1) -- the caller dispatches it a single time. Every input arrives in args: the success-definition criteria, the contract text, project notes/stack hints, evidence paths, the checker CLI path, the evidence freshness floor, the iteration cap, state/report paths, and an optional resume snapshot from a prior run\'s state file (D13).',
  phases: [
    { title: 'Exercise', detail: 'verify-app agents walk the OPEN criteria, one per slice, fanned out per resource lane (capture only -- no edits, rebuilds or restarts)' },
    { title: 'Judge', detail: 'one untyped agent runs the checker CLI first, reads content only for tier-1 passes, decides next, and writes state/report (D4, D7, §3.3a)' },
    { title: 'Debug', detail: 'one app-debugger agent, dispatched only on remediate, fixes gaps in place (D8)' },
  ],
}

// ---------------------------------------------------------------------------
// This script owns the entire bounded functional-verification loop (D1). It has no
// filesystem, no shell and no require -- everything that touches disk (the checker CLI, state
// persistence, report rendering) is done by the Judge agent it dispatches, which has Read/
// Write/Bash (§3.3a "Why an agent and not the script"). Each iteration runs three stages in
// order: Exercise, Judge, and (only when the Judge asks for it) Debug.
//
// Exercise is the one stage that fans out. The script holds a settled/open partition across
// iterations (verification-convergence §3.4), walks only the OPEN criteria, and slices them
// into resource lanes (`exerciseLanes`, §3.5) dispatched through `parallel()`. Judge and Debug
// stay single agents: the separate persistence stage is folded into the Judge, and remediation
// is one Debug agent per iteration, not a wave-partitioned fan-out (FV-D7, FV-D8).
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
// NEW (D11, §3.3). The FAST per-iteration refresh, run by Debug as its last act after applying
// fixes -- never by Exercise, and nowhere else in this loop. "" (the default, same idiom as
// NOTES/STACK_HINTS above) means the declared environment cannot be refreshed by the loop, and
// that is not an error: Debug simply skips the step and returns.
const REFRESH_COMMAND = a.refreshCommand || ''
// NEW (D14, §3.3). The FULL end-of-run gate, run by the Judge once on any exit action other
// than "exit-unbuilt" (never on "remediate" -- STEP 6 renders no report and runs no gate) --
// never by Exercise, never by Debug, and never more than once per invocation. "" (the same
// idiom as REFRESH_COMMAND above) means no full-environment run is declared for this
// environment; that is the ordinary case, and the permanent one in this repository (see
// verification-convergence.md's "Could Not Verify"). An empty command is never treated as a
// passing run -- the report says "no full-environment run declared", never that one passed.
const FULL_RUN_COMMAND = a.fullRunCommand || ''
const EVIDENCE_DIR = a.evidenceDir
if (!EVIDENCE_DIR) {
  throw new Error('verify-functional: args.evidenceDir (the evidence directory) is required')
}
const CHECKER = a.checker
if (!CHECKER) {
  throw new Error('verify-functional: args.checker (the checker CLI path) is required')
}
const SINCE = a.since
if (!Number.isInteger(SINCE) || SINCE < 1) {
  // Same standard as `cap` ten lines below, and for a sharper reason: SINCE is the one
  // guarded arg that reaches a shell, interpolated raw into the judge's check-evidence
  // command. A bare truthiness check passes "1700000000", {} and [1,2] straight through.
  // The checker CLI does reject non-finite and <= 0 (functional-verification.js), so this
  // is a strict subset of a rule that already exists -- it just fails here, before an
  // exerciser agent is spawned, instead of inside a dispatched judge.
  throw new Error('verify-functional: args.since (the evidence freshness floor, unix seconds) is required and must be a positive integer')
}
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
if (!STATE_PATH) {
  throw new Error('verify-functional: args.statePath (the state file path) is required')
}
const REPORT_PATH = a.reportPath
if (!REPORT_PATH) {
  throw new Error('verify-functional: args.reportPath (the report file path) is required')
}
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
// The sanctioned writer for a `.trd-state/` JSON file is `implement-state.save()` (§3.3a
// step 3, D9) -- per-writer temp + rename, so a crash mid-write cannot leave a truncated
// state file that `load()` then throws on. The script cannot require it, but the Judge agent
// can shell into it, so the path is resolved here (string ops only) and handed over in the
// prompt. Node module resolution needs an explicit `./` on a relative path, or it reads the
// path as a package name instead of a file.
const LIB_DIR = CHECKER.replace(/\/[^/]*$/, '')
const STATE_WRITER = `${LIB_DIR.startsWith('/') ? LIB_DIR : `./${LIB_DIR}`}/implement-state`
const RESUME = a.resume || null
const PROJECT = a.project || ''
const N = CRITERIA.length

// NEW (D4, D5, §3.3, §3.5). Lane-based Exercise slicing. Absent or empty, this defaults to
// exactly one lane of concurrency 1 over every criterion -- exactly today's single-agent
// behaviour, and the one-lane/concurrency-1 case of the general slicing path below, not a
// second code path beside it. Resolving WHICH environment a criterion needs and HOW MANY of a
// resource may exist at once is the orchestrator's job (VCON-B009): it reads verification.md,
// which this script has no way to do by construction. This file only ever intersects a lane's
// declared criteria with the open set and slices within it (D4) -- it resolves nothing.
const EXERCISE_LANES = (() => {
  const raw = a.exerciseLanes
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) {
    return [{ resource: null, concurrency: 1, createCommand: '', criteria: CRITERIA.map((c) => c.id) }]
  }
  if (!Array.isArray(raw)) {
    throw new Error('verify-functional: args.exerciseLanes must be an array when supplied')
  }
  const idSet = new Set(CRITERIA.map((c) => c.id))
  const seen = new Set()
  for (const lane of raw) {
    if (!Number.isInteger(lane.concurrency) || lane.concurrency < 1) {
      throw new Error(`verify-functional: exerciseLanes: lane for resource ${JSON.stringify(lane.resource ?? null)} has an invalid concurrency (must be a positive integer)`)
    }
    if (!Array.isArray(lane.criteria)) {
      throw new Error(`verify-functional: exerciseLanes: lane for resource ${JSON.stringify(lane.resource ?? null)} is missing a criteria array`)
    }
    for (const id of lane.criteria) {
      if (!idSet.has(id)) {
        throw new Error(`verify-functional: exerciseLanes: lane for resource ${JSON.stringify(lane.resource ?? null)} names unknown criterion id ${JSON.stringify(id)}`)
      }
      if (seen.has(id)) {
        throw new Error(`verify-functional: exerciseLanes: criterion id ${JSON.stringify(id)} appears in more than one lane`)
      }
      seen.add(id)
    }
  }
  return raw.map((lane) => ({
    resource: lane.resource ?? null,
    concurrency: lane.concurrency,
    createCommand: lane.createCommand || '',
    criteria: lane.criteria,
  }))
})()
// 8 is the brief's figure for "criteria with a stated scenario, not 62 and explore" (D4,
// OQ-4 -- a partition parameter, not a measured optimum). The formula deliberately does NOT
// pre-cap the resulting slice count -- see MAX_PARALLEL_SLICES and the batching below instead.
const SLICE_SIZE = 8
// The platform's own concurrent-subagent pool (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`; see
// constitution.md's "Concurrency counts the whole tree"), matching sweep.js's
// MAX_PARALLEL_REGIONS. With lanes there is no single caller-supplied number to bound against
// it, so the sum of every lane's concurrency is what has to be chunked here -- a slice past the
// first batch runs in the next one and is never dropped (sweep.js's own batching pattern).
const MAX_PARALLEL_SLICES = 20

// Same lesson as audit-trd.js's and audit-build.js's SCOPE: an agent that resolves paths
// against the wrong repository boots the wrong system and reports gaps that do not exist.
const SCOPE = PROJECT
  ? `\nPATH SCOPING. The system under verification lives at ${PROJECT}. Every SOURCE, TEST and ` +
    `CONFIG path -- anything belonging to the software you are exercising or fixing -- ` +
    `resolves against THAT project, not against the repository this script runs in. Bring ` +
    `THAT project up, and resolve a path there before reporting anything missing.\n` +
    `The run's OWN artifacts are the exception and do NOT move: the checker CLI, the ` +
    `evidence directory, the state file, the report path and the verification notes are all ` +
    `given to you as explicit paths in this prompt, and every one of them belongs to the ` +
    `orchestrating repository that holds this run's requirements document and its ` +
    `.trd-state/ directory. Use those paths exactly as ` +
    `written -- do not re-root them under ${PROJECT}. The checker is framework machinery ` +
    `(the target project may not even be a Node project), and the loop's record belongs ` +
    `beside the rest of the run's state, not scattered into a repository this run does not own.\n`
  : ''

// --------------------------------------------------------------------------- prompt builders

// `slice` is `{ lane: { resource, concurrency, createCommand }, criteria: [<criterion objects,
// this slice's own subset>] }` (D4, §3.5) -- the slice's own count and its own criteria JSON are
// what the exerciser is told, never the whole definition's `${N}` / `criteriaJson()` (which this
// function used to read). Handing a 5-criterion slice a prompt that says "62" sends it hunting
// for the other 57, which is the exact failure lanes exist to stop.
function buildExercisePrompt(iteration, slice) {
  const { lane, criteria } = slice
  const count = criteria.length
  const laneNote = lane.createCommand
    ? `LANE RESOURCE (D5, D12): ${JSON.stringify(lane.resource)}. This slice's lane declares a ` +
      `create/destroy command. You MAY create AT MOST ONE instance of this resource for this ` +
      `slice, using exactly:\n  ${lane.createCommand}\nand you MUST tear it down again before ` +
      `you return -- do not leave it running.\n\n`
    : `LANE RESOURCE (D5, D12): ${JSON.stringify(lane.resource)}. No create/destroy command is ` +
      `declared for this lane -- use whatever instance of it is already running; you may NOT ` +
      `create one.\n\n`
  return (
    `Functional verification -- Exercise stage, iteration ${iteration}.\n${SCOPE}\n` +
    `Contract:\n${CONTRACT}\n\n` +
    `Project notes (what prior runs learned about running this project):\n${NOTES || '(none)'}\n\n` +
    `Stack hints:\n${STACK_HINTS}\n\n` +
    `Evidence directory: ${EVIDENCE_DIR}\n\n` +
    `CAPTURE ONLY (D11): you may bring the system up when nothing is already running. You may ` +
    `NOT edit source, rebuild, restart or re-deploy it, before, during or after your walk -- not ` +
    `even to fix something small you noticed along the way. If a criterion needs a repair, do ` +
    `not make it yourself: claim that criterion with artifact null and a stated reason describing ` +
    `what is wrong. That reason is what the Judge rules on, and Debug -- a separate stage that ` +
    `runs after the Judge, never you -- is the one that repairs it. A rebuild you perform here ` +
    `invalidates the capture the Judge is about to read.\n\n` +
    laneNote +
    `Bring the system up ONCE, then walk every one of the following ${count} criteria -- your ` +
    `own slice, not the whole run's definition -- and produce one claim per criterion -- an ` +
    `artifact path under the evidence directory that proves it, or (when none exists) a stated ` +
    `reason. Every criterion below must appear in your "claims" array exactly once, id-for-id -- ` +
    `do not narrow to a subset, and do not go looking for criteria outside this list.\n\n` +
    `Criteria:\n${JSON.stringify(criteria)}\n\n` +
    `You own .claude/verification-notes.md (D6): read it before you start, and if anything in ` +
    `this run taught you something worth recording -- a stale hint, a corrected port or ` +
    `command, a substituted evidence artifact -- add or correct a marked line ([ran]/[read]/` +
    `[inferred], per the contract) before you return. Report whether you touched that file.\n\n` +
    `Return { "claims": [ { "criterion": "<id>", "artifact": "<path>" | null, "locator": ` +
    `"<string>" | null, "reason": "<string, present when artifact is null>" }, ... ], ` +
    `"notesUpdated": <true when you added or corrected a line in .claude/verification-notes.md ` +
    `this run, false otherwise> }. "locator" is a literal string you have actually SEEN inside ` +
    `the artifact (not a description of what it ought to contain) -- give none for a ` +
    `judge-only criterion, and expect it to be discarded and re-derived for one either way.`
  )
}

function buildJudgePrompt({ iteration, openCriteria, settledEntries, claims, previousGaps, forcedUnbuilt, exerciseNotesUpdated }) {
  const claimsJson = JSON.stringify(claims)
  const prevGapsJson = JSON.stringify(previousGaps)
  const openCriteriaJson = JSON.stringify(openCriteria)
  const settledJson = JSON.stringify(settledEntries)
  const settledMetIds = settledEntries.filter((e) => e.status === 'met').map((e) => e.id)
  const claimsFile = `${STATE_DIR}/judge-claims-${iteration}.json`
  const decideFile = `${STATE_DIR}/judge-decide-${iteration}.json`
  const reportInputFile = `${STATE_DIR}/judge-report-input-${iteration}.json`
  const stateFile = `${STATE_DIR}/judge-state-${iteration}.json`
  const forced =
    forcedUnbuilt && forcedUnbuilt.length
      ? `\n\nThe Debug stage that just ran reported these criteria as UNBUILT (absent capability, ` +
        `not broken behaviour) and did not attempt them: ${JSON.stringify(forcedUnbuilt)}. Carry ` +
        `them into "unbuilt" on this call rather than re-deriving them.`
      : ''
  // D14, §3.3. Two branches, not a single conditional-inside-the-instruction: which branch
  // applies is known here, at prompt-build time (FULL_RUN_COMMAND does not change iteration to
  // iteration), so there is no reason to make the agent re-derive "is one declared" itself.
  // Only the "declared" branch needs to condition on the action the agent is about to return
  // (skip on exit-unbuilt, run otherwise), because only there does it matter.
  const fullRunGate = FULL_RUN_COMMAND
    ? `unless the action above is "exit-unbuilt", run the declared full-environment command via ` +
      `Bash, exactly once:\n  ${FULL_RUN_COMMAND}\nand record {"command": ` +
      `${JSON.stringify(FULL_RUN_COMMAND)}, "status": "pass"} on a zero exit, or "status": ` +
      `"fail" on any other exit. A failed run does NOT change the "action" you already decided ` +
      `in STEP 3 above -- the criteria were proven against a running system, and what failed is ` +
      `this rebuild, not the evidence. On "exit-unbuilt", skip the run entirely (there is ` +
      `nothing built to gate) and record {"command": ${JSON.stringify(FULL_RUN_COMMAND)}, ` +
      `"status": "skipped"} instead`
    : `no fullRunCommand is declared for this run, so record {"command": "", "status": ` +
      `"skipped"} -- meaning nobody declared one, never that one passed`
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
    `genuinely "not_verifiable" here -- never invent content you have not read. A criterion ` +
    `whose tier-1 verdict is "skipped" is judge-only (D7): read its artifact's content and rule ` +
    `on it directly, or rule on its stated reason when it claims no artifact -- there is no ` +
    `tier-1 gate in front of it, and its absence from the "pass" list is not evidence against ` +
    `it.\n\n` +
    `STEP 3: decide the loop's next action. "met" is every criterion currently at status "met": ` +
    `the ${settledMetIds.length} settled met id(s) carried below (${JSON.stringify(settledMetIds)}), ` +
    `unchanged, plus any id you judge "met" in STEP 2 this iteration. "total" is the whole ` +
    `definition's count, ${N}, not just this iteration's open-set size. Write ` +
    `{"iteration":${iteration},"gaps":<not_met ids>,"unbuilt":<unbuilt ids>,` +
    `"previousGaps":${prevGapsJson},"cap":${CAP},"met":<the met ids, as described above>,` +
    `"total":${N}} to ${decideFile}, then run:\n` +
    `  node ${CHECKER} decide-next --file ${decideFile}\n\n` +
    `STEP 4: persist the run's state to ${STATE_PATH}, BEFORE anything else is dispatched. ` +
    `Do NOT write it with a plain file write: ${STATE_PATH} is a .trd-state JSON file, and the ` +
    `repository's only sanctioned writer for one is the save(filePath, state) function exported ` +
    `by ${STATE_WRITER} (per-writer temp file + rename, so a crash mid-write cannot leave a ` +
    `truncated state file the next --resume throws on). Write the state JSON to ${stateFile} ` +
    `first, then shell into node, load that module, and call save(${STATE_PATH}, <the parsed ` +
    `contents of ${stateFile}>). Going through the payload file keeps the JSON off the command ` +
    `line, same reason as the CLI calls above.\n` +
    `Write EXACTLY these four top-level keys, spelled exactly as given -- the command that ` +
    `dispatched this workflow reads them straight back to compose a --resume snapshot ` +
    `(implement-trd Step 8.2), and a key it does not recognise is read as absent, which ` +
    `silently restarts the loop at iteration 1 with no memory of this run:\n` +
    `  {"iteration": ${iteration}, "criteria": [ <one entry per criterion IN THE WHOLE ` +
    `DEFINITION -- both the already-settled ones (copy them EXACTLY as given below, including ` +
    `their "provenAt"; do not re-derive, re-date or otherwise change them) and the ones you ` +
    `judged this iteration: "id", "status", "tier1", "artifact", "reason", "provenAt" -- ` +
    `"provenAt" is the iteration number a "met"/"not_verifiable"/"unbuilt" verdict was proven ` +
    `at (this iteration's number, ${iteration}, for one you just judged; carried unchanged for ` +
    `a settled one) and is absent/null for a "not_met" criterion, which stays open. "reason" ` +
    `MUST be populated (non-null, non-empty) for every criterion whose status is not "met"; it ` +
    `is the only structured record of why a not_verifiable/not_met/unbuilt verdict was reached, ` +
    `and it is what tells a later run which blockers are worth re-checking> ], "gapsClosed": [ ` +
    `<the gaps-closed history with this iteration appended> ], ` +
    `"outcome": <null when decide-next returned "remediate"; otherwise the outcome string ` +
    `this run exits with: "satisfied", "unbuilt", "stalled", "stuck" or "insufficient-coverage">}` +
    `\n\n` +
    `"outcome" IS THE TERMINALITY MARKER and it is the one key that decides whether a later ` +
    `--verify --resume re-enters this loop or runs the implementation normally ` +
    `(implement-trd Step 3.6 step 0). A null outcome means "this run stopped mid-loop, resume ` +
    `it"; a non-null one means "this run finished, do not resume it". Omitting the key ` +
    `entirely reads as null, so a finished run would be resumed forever -- skipping the derive ` +
    `pass, the whole phase loop and the end-of-run hardening on every subsequent invocation. ` +
    `Write it on EVERY iteration, including remediate ones, where its value is null.\n` +
    `"gapsClosed" is an AUDIT RECORD, not a loop input: nothing reads it back to drive the ` +
    `stall rule (previousGaps is reconstructed from "criteria"). Write it as an array of ` +
    `integers -- one count per completed iteration, in order, being how many gaps that ` +
    `iteration closed -- so the history stays readable by a human reviewing the run.\n\n` +
    `STEP 5: on any exit action (anything other than "remediate"), FIRST settle the end-of-run ` +
    `full-environment gate (D14): ${fullRunGate}. Call that object "finalEnvironmentRun".\n` +
    `THEN write the render-report input to ${reportInputFile} -- it MUST include "feature": ` +
    `${JSON.stringify(FEATURE)}, "prd": ${JSON.stringify(PRD)} and "definitionPath": ` +
    `${JSON.stringify(DEFINITION_PATH)} verbatim (do not invent or omit these three -- they are ` +
    `the report's header, supplied by the command that dispatched this workflow) alongside ` +
    `"outcome", "reason", "criteria" and "finalEnvironmentRun" (the object you just produced, ` +
    `verbatim) -- "criteria" is one entry per criterion IN THE WHOLE DEFINITION, same ` +
    `completeness rule as STEP 4's state file (the already-settled ones carried verbatim with ` +
    `their "provenAt", plus the ones you judged this iteration): id, statement, cites, status, ` +
    `artifact, reason, provenAt, attempts, blocker), then run:\n` +
    `  node ${CHECKER} render-report --file ${reportInputFile}\n` +
    `and write the output to ${REPORT_PATH}.\n\n` +
    `STEP 6: on "remediate", do not render a report and do not touch anything besides the state ` +
    `file already written in STEP 4 -- just return the gap set.\n\n` +
    `Already-settled criteria from a prior iteration (status met/not_verifiable/unbuilt) -- do ` +
    `NOT re-judge these. Copy them, unchanged, into the state file and the report input above; ` +
    `they do not belong in your "criteria" return below, which is for this iteration's ` +
    `judgements only:\n${settledJson}\n\n` +
    `Criteria still open, under judgement this iteration (${openCriteria.length} of ${N}):\n${openCriteriaJson}\n\n` +
    `This iteration's Exercise claims:\n${claimsJson}\n\n` +
    `Previous iteration's gaps (null on a fresh run's first iteration): ${prevGapsJson}${forced}\n\n` +
    `The Exercise agent (which owns .claude/verification-notes.md, D6) reports it ` +
    `${exerciseNotesUpdated ? 'DID' : 'did NOT'} add or correct a line in that file this ` +
    `iteration. Forward that value unchanged as "notesUpdated" below -- you do not read or ` +
    `write the notes file yourself, so do not re-derive this.\n\n` +
    `Return { "action": "exit-satisfied"|"exit-unbuilt"|"exit-stalled"|"exit-stuck"|` +
    `"exit-insufficient-coverage"|"remediate", ` +
    `"reason": "<string>", "criteria": [ { "id","status","tier1","artifact","reason","files" }, ` +
    `... one entry per criterion you judged THIS iteration -- the open set above, not the ` +
    `already-settled ones ], "gaps": [<not_met ids>], "unbuilt": ` +
    `[<unbuilt ids>], "closed": [<ids decide-next reported closed>], "notesUpdated": <boolean>, ` +
    `"finalRun": { "command","status" } | omitted -- the SAME "finalEnvironmentRun" object from ` +
    `STEP 5's gate, present on any exit action and omitted on "remediate" (STEP 6 renders no ` +
    `report and runs no gate at all), ` +
    `"debugGaps": [ { "id","statement","reason","artifact","files" }, ... present only when ` +
    `action is "remediate" ] }.`
  )
}

function buildDebugPrompt(debugGaps) {
  const refreshStep = REFRESH_COMMAND
    ? `\n\nLAST STEP, after every fix above is applied -- and only after (D11): refresh the ` +
      `running system so the next Exercise pass sees your change, by running:\n` +
      `  ${REFRESH_COMMAND}\n` +
      `Run it once, at the end, not before any fix and not once per gap -- a rebuild that lands ` +
      `between a capture and its judgement is the exact defect this ordering exists to close.`
    : `\n\nNo refresh command is declared for this environment (D11) -- that is not an error. Do ` +
      `not rebuild or restart anything yourself; just return your results.`
  return (
    `Functional verification -- Debug stage.\n${SCOPE}\n` +
    `The Judge found the following gap(s) still open. Fix the code in place, one gap at a time. ` +
    `Do not re-verify -- the next Exercise/Judge pair is the check, seconds later. If a gap ` +
    `turns out to be an absent capability rather than broken behaviour, report it as "unbuilt" ` +
    `rather than implementing it -- that is your own stated exclusion.\n\n` +
    `Gaps:\n${JSON.stringify(debugGaps)}\n\n` +
    `Project notes:\n${NOTES || '(none)'}\n\n` +
    `Stack hints:\n${STACK_HINTS}\n\n` +
    `Contract:\n${CONTRACT}` +
    refreshStep +
    `\n\nReturn { "results": [ { "criterion": "<id>", "result": "<what you changed, or why you ` +
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
          locator: { type: ['string', 'null'] },
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
    action: {
      type: 'string',
      enum: ['exit-satisfied', 'exit-unbuilt', 'exit-stalled', 'exit-stuck', 'exit-insufficient-coverage', 'remediate'],
    },
    reason: { type: 'string' },
    criteria: { type: 'array', items: JUDGE_CRITERION_SCHEMA },
    gaps: { type: 'array', items: { type: 'string' } },
    unbuilt: { type: 'array', items: { type: 'string' } },
    closed: { type: 'array', items: { type: 'string' } },
    notesUpdated: { type: 'boolean' },
    // NEW (D14). Present on any exit action, omitted on "remediate" -- see buildJudgePrompt's
    // fullRunGate / Return spec. Not in the top-level `required` list for that reason.
    finalRun: {
      type: 'object',
      additionalProperties: false,
      required: ['command', 'status'],
      properties: {
        command: { type: 'string' },
        status: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
      },
    },
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

// --------------------------------------------------------------------------- claim reconciliation

// The Exercise prompt instructs the exerciser to return exactly one claim per criterion,
// id-for-id, and not to narrow to a subset -- but it is an agent, so "instructed" is not
// "guaranteed", and nothing downstream re-derives the correspondence: `checkEvidence` maps over
// whatever claims it is handed, so a criterion with no claim simply produces no verdict, and the
// Judge -- which is told the full open-set criteria but sees only the claims -- is the sole
// thing standing between a missing claim and a report that never mentions it.
//
// Called once per SLICE (D4, §3.5), not once over the whole open set: each call's `openCriteria`
// argument is that slice's own criteria, never `CRITERIA` and never the full open set. A claim
// the exerciser returns for an id outside its own slice -- an already-settled criterion it is
// unaware of, or one assigned to a different lane's slice -- is silently excluded here rather
// than reported as unknown or unwalked, the same way a claim for an id that IS in the current
// open set but not this slice's own would be: it is simply not this slice's business. Left
// CRITERIA-relative (its shape before VCON-B004) or open-set-relative rather than slice-relative
// (its shape before VCON-B006), every carried-forward or out-of-slice criterion would report as
// unwalked, which the PRD names as the likeliest place to break a correct run.
//
// Two concrete wrong answers this closes, both silent, both still true of the open set:
//   - An exerciser that claimed one real open criterion plus one id absent from the definition
//     reported `exercised: "2/2"` -- the label was `claims.length` over the open-set size and
//     never checked WHICH ids those claims were for, so the report's coverage figure was
//     fabricated while one open criterion had not been walked at all.
//   - That unwalked criterion reached the Judge as an absence rather than as a stated gap, with
//     no verdict of its own from tier 1 to anchor the Judge's reading.
//
// Reconciling here uses the same device the dead-Exercise branch below already uses: a claim
// with a null artifact and a stated reason, which tier 1 fails as `no-artifact` and the Judge
// resolves on the reason. A claim naming an id that is not in the definition at all (not merely
// settled) is dropped and logged -- there is no criterion for it to be evidence of. Every
// resulting claim is stamped `judgeOnly` from its criterion row's `tier1` (D7) -- discarding
// whatever the exerciser supplied, since only the definition's own authoring-time marker may
// exempt a criterion from the locator check.
function reconcileClaims(returned, openCriteria) {
  const byId = new Map()
  let duplicates = 0
  for (const claim of returned) {
    if (byId.has(claim.criterion)) duplicates++
    else byId.set(claim.criterion, claim)
  }
  const claims = openCriteria.map((c) => {
    const claim = byId.has(c.id)
      ? byId.get(c.id)
      : { criterion: c.id, artifact: null, reason: 'the exerciser returned no claim for this criterion' }
    return { ...claim, judgeOnly: c.tier1 === 'judge-only' }
  })
  const walked = openCriteria.filter((c) => byId.has(c.id)).length
  const unknown = [...byId.keys()].filter((id) => !CRITERIA.some((c) => c.id === id))
  return { claims, walked, unknown, duplicates }
}

// --------------------------------------------------------------------------- result assembly

const OUTCOME_BY_ACTION = {
  'exit-satisfied': 'satisfied',
  'exit-unbuilt': 'unbuilt',
  'exit-stalled': 'stalled',
  'exit-stuck': 'stuck',
  'exit-insufficient-coverage': 'insufficient-coverage',
}

// D14. The two deterministic branches (nothing declared; the exit is exit-unbuilt) are computed
// here rather than trusted to the agent's own return, for the same reason OUTCOME_BY_ACTION is a
// lookup table rather than a re-derivation: both are knowable from FULL_RUN_COMMAND and the
// action alone, with no Bash involved. Only the "a command is declared and this exit calls for
// it" branch genuinely needs the Judge's return -- only the Judge can run the command -- and a
// Judge that omitted it there (JUDGE_SCHEMA does not require the field) reports as a failed run
// rather than a silently skipped one, since "skipped" would misrepresent "never actually ran" as
// "nobody declared one".
function computeFinalRun(judgeResult) {
  if (!FULL_RUN_COMMAND) return { command: '', status: 'skipped' }
  if (judgeResult.action === 'exit-unbuilt') return { command: FULL_RUN_COMMAND, status: 'skipped' }
  return judgeResult.finalRun || { command: FULL_RUN_COMMAND, status: 'fail' }
}

// `settled` (the Map built up across iterations, §3.4) is passed in so the returned `criteria`
// covers the WHOLE definition -- the Judge's own structured return (`judgeResult.criteria`) is
// this iteration's open-set judgements only (see buildJudgePrompt's Return spec), and every
// already-settled criterion lives in this map instead, never duplicated back through the agent.
// Coverage is over the WHOLE definition (OQ-5: the denominator is every criterion), so a
// criterion no status was returned for counts as uncovered rather than disappearing. Every
// result this workflow returns carries it (§3.3), including the two no-Judge exits below.
function coverageOf(criteria) {
  const metIds = new Set((criteria || []).filter((c) => c.status === 'met').map((c) => c.id))
  const uncovered = CRITERIA.map((c) => c.id).filter((id) => !metIds.has(id))
  return { proven: N - uncovered.length, total: N, uncovered }
}

function buildFinalResult(judgeResult, iterations, debugAttempts, exercisedLabel, settled) {
  const settledCriteria = Array.from(settled, ([id, v]) => ({ id, ...v }))
  const openReturned = (judgeResult.criteria || []).filter((c) => !settled.has(c.id))
  const criteria = [...settledCriteria, ...openReturned]
  return {
    outcome: OUTCOME_BY_ACTION[judgeResult.action] || 'stuck',
    reason: judgeResult.reason || '',
    iterations,
    reportPath: REPORT_PATH,
    criteria,
    gaps: judgeResult.gaps || [],
    unbuilt: judgeResult.unbuilt || [],
    exercised: exercisedLabel,
    debugAttempts,
    notesUpdated: Boolean(judgeResult.notesUpdated),
    coverage: coverageOf(criteria), // §3.3 -- read by /implement-trd §8.4
    finalRun: computeFinalRun(judgeResult), // NEW (D14)
  }
}

// --------------------------------------------------------------------------- empty criteria

// Zero criteria is a legitimate outcome (the success definition's own AC-3), not an error: the
// definition step already reported it. Skip Exercise and Debug entirely -- there is nothing to
// exercise or fix -- and run exactly one Judge call so the empty report still gets written.
if (N === 0) {
  phase('Judge')
  const judgeResult = required(
    await agent(
      buildJudgePrompt({ iteration: 0, openCriteria: [], settledEntries: [], claims: [], previousGaps: null, forcedUnbuilt: null }),
      { label: 'judge', phase: 'Judge', schema: JUDGE_SCHEMA }
    ),
    'Judge'
  )
  return buildFinalResult(judgeResult, 0, [], '0/0', new Map())
}

// --------------------------------------------------------------------------- the loop

// A resume snapshot is read off disk by the caller, so treat its shape as untrusted: a state
// file missing `iteration` would otherwise produce NaN (a loop that never runs, reported as a
// cap exhaustion that never happened), and one missing `criteria` would throw here.
const RESUME_ITERATION = RESUME && Number.isFinite(Number(RESUME.iteration)) ? Number(RESUME.iteration) : 0
const RESUME_CRITERIA = RESUME && Array.isArray(RESUME.criteria) ? RESUME.criteria : null

let iteration = RESUME_ITERATION + 1
let previousGaps = RESUME_CRITERIA ? RESUME_CRITERIA.filter((c) => c.status === 'not_met').map((c) => c.id) : null

// --------------------------------------------------------------------------- settled/open (D1, D2, §3.4)
//
// The loop's memory. Held here, in the script, never re-derived by an agent: the Judge is an
// agent and the open set is arithmetic. Seeded from `resume.criteria` filtering for `met` ONLY
// (D2) -- a `not_verifiable` entry from a previous invocation goes back into the open set,
// because the preflight has re-read verification.md since and an environment the owner
// unblocked is what a resume is for. `not_met` was never settled to begin with. `unbuilt` is
// deliberately not seeded either: `decideNext` exits terminally the moment `unbuilt.length > 0`,
// so `--verify --resume` never re-enters a run that produced one (D2) -- there is no later pass,
// in this run or a resumed one, that would consult an `unbuilt` entry here.
//
// Within ONE invocation, `met`, `not_verifiable` and `unbuilt` are all settled and stop being
// re-walked (see the fold below, after each Judge return) -- it is only ACROSS invocations that
// the seeding narrows to `met` alone.
const settled = new Map()
if (RESUME_CRITERIA) {
  for (const c of RESUME_CRITERIA) {
    if (c.status === 'met') {
      settled.set(c.id, {
        status: c.status,
        tier1: c.tier1 ?? null,
        artifact: c.artifact ?? null,
        reason: c.reason ?? null,
        provenAt: c.provenAt ?? null,
      })
    }
  }
}

// A resume whose last completed iteration already reached the cap has no budget left --
// `iterations` is defined (§3.3) as the total ACROSS resumes, so the cap is a total budget,
// not a per-invocation one. Left to the loop, `iteration <= CAP` is false on the first check:
// zero agents dispatch and the fall-through at the bottom of this file reports
// "cap reached without the Judge returning an exit action", which blames the Judge for a
// state it was never given a turn to produce, and returns `criteria: []` so the caller's
// banner tallies every count at 0. Worse, the caller reached here having ALREADY skipped the
// derive pass, the phase loop and the hardening step (implement-trd Step 3.6 step 0), so the
// whole run becomes a silent no-op. Name the real cause and carry the resumed statuses
// forward so the banner reports what the prior run actually established.
if (iteration > CAP) {
  return {
    outcome: 'stuck',
    reason: `resumed at iteration ${iteration} with an iteration cap of ${CAP} -- the prior run already spent the whole budget, so no iteration ran on this invocation; raise the cap or reset the loop state to make further progress`,
    iterations: RESUME_ITERATION,
    reportPath: REPORT_PATH,
    criteria: RESUME_CRITERIA || [],
    gaps: previousGaps || [],
    unbuilt: RESUME_CRITERIA ? RESUME_CRITERIA.filter((c) => c.status === 'unbuilt').map((c) => c.id) : [],
    exercised: `0/${N}`,
    debugAttempts: [],
    notesUpdated: false,
    coverage: coverageOf(RESUME_CRITERIA),
    finalRun: null, // NEW (D14) -- one of the two "not-run" cases: no Judge turn happened this invocation to run the gate at all
  }
}
const debugAttempts = []
let exercisedLabel = `0/${N}`
let skipExercise = false
let forcedUnbuilt = null

for (; iteration <= CAP; iteration++) {
  // Recomputed every iteration: a criterion the previous iteration's Judge settled is not
  // walked again (§3.4). `reconcileClaims`, the lane slicing below and the Judge prompt are all
  // open-set relative.
  const openCriteria = CRITERIA.filter((c) => !settled.has(c.id))
  const settledEntries = Array.from(settled, ([id, v]) => ({ id, ...v }))

  let claims
  let exerciseNotesUpdated = false

  if (skipExercise) {
    // The previous iteration's Debug stage reported one or more gaps as unbuilt -- re-walking
    // the system to rediscover that the code is missing is exactly the waste this skip exists
    // to avoid. The Judge below is told directly, via `forcedUnbuilt`.
    claims = []
    // `exercised` is defined (§3.3) as the FINAL iteration's figure, over the OPEN set (§3.4) --
    // this iteration exercised nothing, so the label must say so here rather than retaining
    // whatever the last Exercise that actually ran happened to report. Left stale, a report
    // could claim "5/6 exercised" on an iteration where zero criteria were walked.
    exercisedLabel = `0/${openCriteria.length}`
    log(`iteration ${iteration}: skipping Exercise -- Debug reported unbuilt gaps last iteration`)
  } else {
    phase('Exercise')

    // Slice each lane against the open set (D4, §3.5): `openInLane = lane.criteria ∩ openSet`,
    // in definition order, then `sliceCount(lane) = lane.concurrency <= 1 ? 1 : min(ceil(openInLane
    // / SLICE_SIZE), lane.concurrency)`. A criterion in no lane at all -- including one whose
    // resource was declared unusable at the preflight -- is exercised by nothing; it is not this
    // script's job to know why, only to make sure it still reaches the Judge (§3.3).
    const laneCoveredIds = new Set()
    const sliceJobs = []
    for (const lane of EXERCISE_LANES) {
      const laneIdSet = new Set(lane.criteria)
      const openInLane = openCriteria.filter((c) => laneIdSet.has(c.id))
      for (const c of openInLane) laneCoveredIds.add(c.id)
      const sliceCount = openInLane.length === 0 ? 0 : lane.concurrency <= 1 ? 1 : Math.min(Math.ceil(openInLane.length / SLICE_SIZE), lane.concurrency)
      if (sliceCount === 0) continue
      // Contiguous, ceil-sized chunks with the remainder in the last one -- e.g. 20 criteria at
      // sliceCount 3 gives 7 / 7 / 6, not 4 equal-ish groups. `sliceCount` never exceeds
      // `openInLane.length` (ceil(len/SLICE_SIZE) <= len for len >= 1), so no chunk is empty.
      const chunkSize = Math.ceil(openInLane.length / sliceCount)
      for (let i = 0; i < sliceCount; i++) {
        const chunk = openInLane.slice(i * chunkSize, (i + 1) * chunkSize)
        if (chunk.length > 0) sliceJobs.push({ lane, criteria: chunk })
      }
    }
    const noLaneCriteria = openCriteria.filter((c) => !laneCoveredIds.has(c.id))
    // Same device as the dead-slice fallback just below: one synthesized claim with a stated
    // reason, so a criterion the declarations reach no environment for still gets to the Judge
    // (which rules `not_verifiable` from the reason, §3.4's STEP 2) instead of sitting open until
    // the iteration cap.
    const noLaneClaims = noLaneCriteria.map((c) => ({
      criterion: c.id,
      artifact: null,
      reason: 'no exercise lane: the declarations reach no environment that covers this criterion',
      judgeOnly: c.tier1 === 'judge-only',
    }))
    if (noLaneCriteria.length > 0) {
      log(`iteration ${iteration}: ${noLaneCriteria.length} open criterion/criteria reach no exercise lane -- synthesizing a not_verifiable-shaped claim for each: ${noLaneCriteria.map((c) => c.id).join(', ')}`)
    }

    // Every lane's slices dispatch together, batched at MAX_PARALLEL_SLICES (sweep.js's pattern,
    // §3.5) -- a slice past the first batch runs in the next one and is never dropped.
    const dispatchSlice = (job) => async () => {
      const exerciseResult = await agent(buildExercisePrompt(iteration, job), {
        label: 'exercise',
        phase: 'Exercise',
        agentType: 'verify-app',
        schema: EXERCISE_SCHEMA,
      })
      if (!exerciseResult) {
        return {
          job,
          dead: true,
          claims: job.criteria.map((c) => ({
            criterion: c.id,
            artifact: null,
            reason: 'exerciser returned nothing',
            judgeOnly: c.tier1 === 'judge-only',
          })),
          walked: 0,
          unknown: [],
          duplicates: 0,
          notesUpdated: false,
        }
      }
      const reconciled = reconcileClaims(exerciseResult.claims || [], job.criteria)
      return {
        job,
        dead: false,
        claims: reconciled.claims,
        walked: reconciled.walked,
        unknown: reconciled.unknown,
        duplicates: reconciled.duplicates,
        notesUpdated: Boolean(exerciseResult.notesUpdated),
      }
    }

    const sliceBatches = []
    for (let i = 0; i < sliceJobs.length; i += MAX_PARALLEL_SLICES) {
      sliceBatches.push(sliceJobs.slice(i, i + MAX_PARALLEL_SLICES))
    }
    if (sliceBatches.length > 1) {
      log(`iteration ${iteration}: ${sliceJobs.length} exercise slices exceed the ${MAX_PARALLEL_SLICES}-way parallel cap -- running in ${sliceBatches.length} batches`)
    }
    const sliceResults = []
    for (const batch of sliceBatches) {
      sliceResults.push(...(await parallel(batch.map(dispatchSlice))))
    }

    // Aggregate AFTER every slice of this iteration has returned (§3.4's `exercisedLabel` /
    // `skipExercise` / `forcedUnbuilt` are single mutable `let`s across the whole outer loop) --
    // never left as whatever the last-resolved slice happened to write.
    let walked = 0
    const unknown = []
    let duplicates = 0
    let notesUpdated = false
    const slicedClaims = []
    for (const r of sliceResults) {
      walked += r.walked
      unknown.push(...r.unknown)
      duplicates += r.duplicates
      if (r.notesUpdated) notesUpdated = true
      slicedClaims.push(...r.claims)
      if (r.dead) {
        log(`iteration ${iteration}: an Exercise slice for lane resource ${JSON.stringify(r.job.lane.resource)} (${r.job.criteria.length} criterion/criteria) returned nothing -- recording each as not_met`)
      }
    }
    const laneCriteriaCount = openCriteria.length - noLaneCriteria.length
    if (unknown.length > 0) {
      log(`iteration ${iteration}: dropping ${unknown.length} claim(s) for criterion id(s) not in the definition: ${unknown.join(', ')}`)
    }
    if (duplicates > 0) {
      log(`iteration ${iteration}: ${duplicates} duplicate claim(s) ignored -- first claim per criterion kept`)
    }
    if (walked < laneCriteriaCount) {
      log(`iteration ${iteration}: the exerciser returned no claim for ${laneCriteriaCount - walked} open criterion/criteria -- recording each as an unbacked claim for the Judge`)
    }

    claims = [...slicedClaims, ...noLaneClaims]
    // `exercised` reports over the open set (§3.4) -- criteria in no lane were never walked and
    // do not count as exercised, same as a dead slice's criteria don't.
    exercisedLabel = `${walked}/${openCriteria.length}`
    exerciseNotesUpdated = notesUpdated
  }

  phase('Judge')
  const judgeResult = required(
    await agent(
      buildJudgePrompt({ iteration, openCriteria, settledEntries, claims, previousGaps, forcedUnbuilt, exerciseNotesUpdated }),
      { label: 'judge', phase: 'Judge', schema: JUDGE_SCHEMA }
    ),
    'Judge'
  )
  skipExercise = false
  forcedUnbuilt = null

  // Fold this iteration's newly-settled verdicts into the map (§3.4, D2). The Judge's own
  // structured return is the only channel back to the script -- it has no filesystem, so it
  // cannot re-read the state file it just told the Judge to write. A returned entry for a
  // criterion already in the map (the Judge was told not to include one) is ignored rather
  // than applied: the carried-forward entry wins, because letting a re-judgement overwrite a
  // proven verdict would make the open set non-monotonic, the one property O1 asks for.
  for (const c of judgeResult.criteria || []) {
    if (settled.has(c.id)) {
      log(`iteration ${iteration}: Judge returned an entry for already-settled criterion ${c.id} -- ignoring it (the carried-forward entry wins)`)
      continue
    }
    if (c.status === 'met' || c.status === 'not_verifiable' || c.status === 'unbuilt') {
      settled.set(c.id, {
        status: c.status,
        tier1: c.tier1 ?? null,
        artifact: c.artifact ?? null,
        reason: c.reason ?? null,
        provenAt: iteration,
      })
    }
    // A `not_met` verdict stays out of the map and remains open (§3.4).
  }

  if (judgeResult.action !== 'remediate') {
    return buildFinalResult(judgeResult, iteration, debugAttempts, exercisedLabel, settled)
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
  coverage: coverageOf(Array.from(settled, ([id, v]) => ({ id, ...v }))),
  finalRun: null, // NEW (D14) -- the other "not-run" case: the loop fell through with no exit action, so no gate ran
}
