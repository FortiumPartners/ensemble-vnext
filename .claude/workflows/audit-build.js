export const meta = {
  name: 'audit-build',
  description: 'Verify delivered code against its TRD and PRD, with traceability as the headline check',
  whenToUse: "Invoked by /audit-build. Runs after implementation to check the code that was actually delivered -- does it match the TRD's tasks (verification), does it match the PRD's requirements (validation), and does every requirement carry both an implementation AND a test proving it (traceability)? Replaces the per-task acceptance-criteria job removed from the implement loop by ITR-B010.",
  phases: [
    { title: 'Index', detail: 'derive requirements/tasks from the PRD and TRD' },
    { title: 'Verify', detail: 'parallel read-only verifiers over the delivered code' },
    { title: 'Reconcile', detail: 'apply what survives, rewrite Could Not Verify' },
  ],
}

// ---------------------------------------------------------------------------
// audit-build checks the OUTPUT of implementation, not the documents that specified it.
// audit-prd and audit-trd verify that a document is internally sound and traces to its
// own source. Neither one opens the delivered code. This one does nothing else -- every
// verifier here reads src/ and tests/ first and the documents second, because a document
// can be perfect and the code can still not match it.
//
// The headline check is traceability, and it is the one nothing else in this pipeline
// covers: a requirement with code and no test is a GAP, not a pass. The measured case is
// sanitize_error_detail() -- documented in a design doc, inherited as fact through two
// review passes, and never existed in src/ at all. 0 hits in code, 5 in docs. A document
// audit does not find that; only a check that greps the delivered tree does.
//
// args: { trd, prd, project }
//   trd      the TRD the code claims to implement
//   prd      the PRD the TRD claims to satisfy
//   project  the codebase actually delivered, when it differs from where the docs live
// ---------------------------------------------------------------------------

function readArgs(raw) {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch (e) {
      throw new Error('workflow args arrived as a string and is not valid JSON. Pass args as an actual JSON object.')
    }
  }
  return raw || {}
}

function required(value, stage) {
  if (value === null || value === undefined) {
    throw new Error(`${stage} stage returned no result (the agent died or was skipped). Nothing downstream can run without it.`)
  }
  return value
}

const a = readArgs(args)
const TRD = a.trd
const PRD = a.prd || ''
const PROJECT = a.project || ''
if (!TRD) throw new Error('audit-build: args.trd (the TRD the delivered code claims to implement) is required')

// Same lesson as audit-trd's SCOPE: a verifier that resolves the delivered tree against the
// wrong repository produces false positives that look like real gaps.
const SCOPE = `
PATH SCOPING. ${PROJECT
  ? `The delivered code lives at ${PROJECT}. Every src/, test/, config and .claude/rules/*
path resolves against THAT project, not against the repository holding the TRD/PRD
documents. Resolve a path there before reporting anything missing.`
  : `Relative paths resolve against the repository containing the TRD.`}
A "does not exist" finding resolved against the wrong repository is a false positive.`

// audit-trd's rule inverted for this command's purpose: here the CODE is what audit-build
// exists to check, and the documents are the checklist it is checked against. Both audits
// share the same underlying fact -- design docs record intent, not current state -- but
// audit-build's job is specifically to catch the code failing to match that intent, not to
// judge the intent itself.
const CORPUS_RULE = `
THE TRD AND PRD STATE WHAT WAS PROMISED. THE DELIVERED CODE STATES WHAT WAS BUILT. Open the
actual src/ and tests/ files before asserting a requirement is met. A task marked complete in
implement.json, a Could Not Verify row that says "confirmed," or prose in the TRD claiming a
mechanism exists are all CLAIMS, not evidence. Resolve every claim against the tree.`

const FINDABLE_ONLY = `
FINDABLE ONLY. Every finding names a source requirement/task ID, a file, and either what is
missing or what contradicts it -- checkable in seconds.
  - "AC-F9.1 has no test asserting it" is checkable and permitted.
  - "I think this implementation is fragile" is manufactured and FORBIDDEN.
Do NOT propose new requirements. Do NOT strike one on judgment. Zero findings is a legitimate
result -- do not manufacture findings to look thorough.`

const BATCH = `
BATCH YOUR READS. Every tool call re-caches your whole context, so turn count costs as much
as context size. Prefer one grep over five. Do not re-open a file you have read.`

// --------------------------------------------------------------------------- 1. INDEX

phase('Index')

const index = await agent(
  `Index ${TRD}${PRD ? ` and ${PRD}` : ''} so the verifiers can target their reads instead of
scanning whole documents.

You are producing a MAP, not a review. Do not evaluate anything and do not open any code yet.

From the TRD, capture every TASK: its ID, description, and its Touches Files list (grep the
Task Grounding section for the task's ID and read the Touches line under it; an empty list is
a real answer).

From the TRD${PRD ? ' and the PRD' : ''}, capture every REQUIREMENT -- acceptance criteria,
functional requirements, NFRs, anything phrased as a measurable or checkable promise. For each,
capture its ID, its statement, and which task(s) claim to serve it.

MANDATORY -- grep the TRD for headings CONTAINING "Could Not Verify" and "Open Questions" --
match loosely, authors number them into the document's own scheme. Capture EVERY row of each,
verbatim. Both may be absent.

BATCH YOUR READS. Grep for tables and headings; do not read either document linearly.`,
  {
    label: 'index',
    phase: 'Index',
    effort: 'low',
    model: 'haiku',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['requirements', 'tasks'],
      properties: {
        requirements: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'statement'],
            properties: {
              id: { type: 'string' }, statement: { type: 'string' },
              source: { type: 'string', description: 'TRD or PRD, plus section' },
              served_by: { type: 'array', items: { type: 'string' }, description: 'task IDs claiming to satisfy this requirement' },
            },
          },
        },
        tasks: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'description'],
            properties: {
              id: { type: 'string' }, description: { type: 'string' },
              touches: { type: 'array', items: { type: 'string' }, description: 'files from this task Task Grounding block; empty list if none' },
            },
          },
        },
        could_not_verify: { type: 'array', items: { type: 'string' } },
        open_questions: { type: 'array', items: { type: 'string' } },
      },
    },
  }
)
required(index, 'Index')
log(`indexed ${index.requirements.length} requirements, ${index.tasks.length} tasks` +
    `${(index.could_not_verify || []).length ? `; ${index.could_not_verify.length} unverified claims declared` : ''}`)

// An empty index is the one failure this command must never report as a clean pass. The
// traceability verifier iterates `requirements`; hand it none and it finds nothing wrong,
// every other verifier follows, and the zero-findings path below prints "every requirement
// is implemented and has a test proving it" — maximal confidence from zero evidence, which
// is precisely the failure mode audit-build exists to catch. A cheap haiku Index missing
// the AC table, or a TRD with no requirement table at all, both land here.
const EMPTY_REQS = index.requirements.length === 0
const EMPTY_TASKS = index.tasks.length === 0
if (EMPTY_REQS) log('WARNING: the Index found ZERO requirements — traceability, the headline check, has nothing to check')
if (EMPTY_TASKS) log('WARNING: the Index found ZERO tasks — verification against the TRD has nothing to check')

// --------------------------------------------------------------------------- 2. VERIFY

phase('Verify')

const FINDING_ITEMS = {
  type: 'array',
  items: {
    type: 'object', additionalProperties: false,
    required: ['check', 'why', 'confidence'],
    properties: {
      check: { type: 'string', enum: ['traceability', 'verification', 'validation', 'test-quality', 'consistency', 'citation'] },
      why: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      id: { type: 'string', description: "the requirement or task ID this finding is about; omit if none applies" },
      evidence: { type: 'string', description: 'the file:line or grep result that supports this finding' },
      action: { type: 'string', enum: ['gap', 'untested', 'mismatch', 'fix-citation', 'confirm-wanted'] },
    },
  },
}
const FINDING_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['findings'], properties: { findings: FINDING_ITEMS },
}

const REQ = JSON.stringify(index.requirements, null, 1)
const TSK = JSON.stringify(index.tasks, null, 1)

const GROUNDING_RULE = `
GROUNDING RULE -- NON-NEGOTIABLE. The records above are an INDEX telling you what was promised
and roughly where. It is NOT the code and NOT the tests. Before reporting ANY finding, open the
actual file(s) in ${PROJECT || 'this repository'} and confirm what you are about to report is
really there or really absent. A finding citing an ID or field absent from the index's source
document is a fabrication.`

const VERIFIERS = [
  {
    key: 'traceability-audit', effort: 'high',
    // This is the headline verifier -- the whole reason audit-build exists separately from
    // audit-trd. See the comment near the top of this file for the measured case
    // (sanitize_error_detail: 0 hits in src/, 5 in docs) this check is built to catch.
    prompt: `TRACEABILITY. For every requirement below, determine whether it has BOTH an
implementation AND a test that PROVES it -- not a test that merely exercises the same file.

REQUIREMENTS (index):
${REQ}

For each requirement:
  1. Find the implementation. Grep for the behavior it describes, not just a matching name --
     a function that exists is not the same as a function that does what the requirement says.
     Read the code, not just its signature.
  2. Find a test that asserts the requirement's OUTCOME, not just that the code runs. A test
     file importing the module is not proof. A test asserting the specific behavior the
     requirement names -- the return value, the error path, the rejected input -- is proof.
  3. Classify:
       - implemented + tested: no finding.
       - implemented, no test proving it: GAP. This is the case that gets missed. A requirement
         with code and no test is a GAP, not a pass -- report it as such even though "the
         feature works."
       - no implementation found at all: GAP, and say so plainly -- do not assume it exists
         because a design document describes it. Grep src/ (or the delivered project's
         equivalent) directly; zero hits is zero hits regardless of how many documents mention it.
       - implementation found, but it does something other than what the requirement states:
         mismatch, not a pass.

A requirement can be documented in the TRD, referenced in a review, and still not exist in the
delivered tree. Verify by grepping the tree, never by trusting that it must be there.`,
  },
  {
    key: 'verification-audit', effort: 'high',
    prompt: `Verify the delivered code against the TRD's TASKS -- does the code match what each
task specified?

TASKS (index):
${TSK}

For each task, open the files in its touches list (or grep for the described change if the
list is empty) and confirm the described work is actually present, matches the task's
description, and was not silently narrowed or left half-done. A task marked complete
elsewhere (implement.json, a commit message) is a claim, not evidence -- check the code.`,
  },
  {
    key: 'validation-audit', effort: 'high',
    prompt: `Validate the delivered system against the PRD's REQUIREMENTS -- does what was
built satisfy what the PRD asked for, independent of how the TRD phrased the task?

${PRD
  ? `Read ${PRD} fully; its requirements are your checklist. Cross-check each against the
delivered code and the TRD's own requirement index above -- a requirement can survive
faithfully into the TRD and still not be built, or the TRD can satisfy its own restated
version of a requirement while quietly dropping what the PRD actually asked for.`
  : `No PRD was supplied. Report that as your single finding and stop -- a validation pass
without a source cannot run, and guessing what the PRD asked for would manufacture findings.`}`,
  },
  {
    key: 'test-quality-audit', effort: 'medium',
    prompt: `Sample the tests that the traceability check will rely on and judge whether they
are REAL proof or theater.

Grep the delivered project's test directories for tests touching the requirements/tasks
indexed above. For a representative sample (do not read every test file -- pick the ones tied
to the requirements that matter most, and any with round numbers or generic names that suggest
they were written to satisfy a coverage gate rather than to prove behavior):
  - Does the test assert a specific outcome, or just that a call did not throw?
  - Is the assertion tautological (mocking the exact thing being tested, asserting the mock
    was called rather than what it returned)?
  - Does the test cover the requirement's stated edge cases, or only the happy path?

This check exists because "has a test" is gameable -- a test file can exist and prove nothing.
Report tests that would pass the traceability check's literal bar (a test file references the
requirement) while actually proving little.`,
  },
  {
    key: 'deterministic', effort: 'low', model: 'haiku',
    prompt: `Two mechanical checks against the delivered tree. Do NOT read linearly -- both are
lookups.

  CITATIONS: grep for citation-shaped strings in the TRD (IDs, section refs, file:line), then
  grep each referenced ID or path in its live target in ${PROJECT || 'this repository'}. Report
  every one that does not resolve, naming the ID and the file searched.

  CONFORMANCE: read ${PROJECT || 'this repository'}'s .claude/rules/stack.md and
  .claude/rules/constitution.md -- both short -- then grep the delivered code for what they
  constrain: technologies outside the declared stack, prohibited patterns, contradicted
  architectural invariants.

Both are pass/fail per item. A miss is a miss; do not interpret.`,
  },
]

const VERIFIER_MODEL = 'sonnet'

const waves = await parallel(
  VERIFIERS.map((v) => () =>
    agent(`${v.prompt}\n${GROUNDING_RULE}\n${SCOPE}\n${CORPUS_RULE}\n${BATCH}\n${FINDABLE_ONLY}`, {
      label: `verify:${v.key}`,
      phase: 'Verify',
      effort: v.effort,
      model: v.model || VERIFIER_MODEL,
      schema: FINDING_SCHEMA,
    }).then((r) => (r ? { verifier: v.key, findings: r.findings || [] } : null))
  )
)

const alive = waves.filter(Boolean)
const findings = alive.flatMap((w) => w.findings.map((f) => ({ ...f, verifier: w.verifier })))
const deadKeys = VERIFIERS.filter((v) => !alive.some((w) => w.verifier === v.key)).map((v) => v.key)
const dead = deadKeys.length
if (dead > 0) log(`WARNING: ${dead} verifier(s) returned nothing — coverage is incomplete for this run`)
log(`${findings.length} findings from ${alive.length}/${VERIFIERS.length} verifiers`)

// --------------------------------------------------------------------------- 3. RECONCILE

// ABSENCE CLAIMS MUST EXHIBIT THE SEARCH. This audit's headline check -- "implemented, but
// nothing tests it" -- is an absence claim by construction, and so is "never built". A search
// that was wrong finds nothing in exactly the way a correct one does.
//
// So a finding resting on absence carries the literal patterns and paths that were run, and
// reconcile REJECTS one that does not: it is a hypothesis. It also rejects a search too narrow
// to conclude from -- one exact-name grep does not establish a capability is unbuilt, because
// real code rarely uses the document's names.
//
// Measured twice in one session here: a verifier grepped the literal "[read]/[ran]/[inferred]",
// a string that appears nowhere in any form, and reported the marker discipline untested. It
// was tested in two files. The grep could not have succeeded, so its emptiness carried no
// information -- and the finding still read as authoritative.
//
// Absence drives deletion, which is why this is stricter than the bar for a positive finding:
// a requirement believed unimplemented gets struck from the owner's document.

phase('Reconcile')

const CNV = `

REWRITE THE ## Could Not Verify SECTION in ${TRD}. This is what makes the artifact carry its
own delivery state, and it is the reason audit-build exists as a separate command from
audit-trd.

READ THE SECTION FROM THE DOCUMENT YOURSELF -- grep ${TRD} for "## Could Not Verify" and read
what is actually there. Do NOT rely on the index for this; the index is a cheap pass and can be
wrong.

For reference only, the index reported (which may be wrong, and may be empty):
${JSON.stringify(index.could_not_verify || [], null, 1)}

Replace that section with what is true AFTER this audit:
  - Claims this audit checked and confirmed built-and-tested: remove them from the section.
  - Claims this audit checked and found as a GAP (missing implementation, missing test,
    mismatch): those are findings, not entries -- they move to the readout, not this section.
  - Claims this audit did NOT check: keep them, and say why they were out of scope.
  - Anything this audit could not resolve (a verifier died, PRD was missing): add it.

If the artifact has no such section, add one.`

const COVERAGE = `

COVERAGE OF THIS AUDIT -- state it, do not infer it from the findings:
  verifiers reporting: ${alive.length}/${VERIFIERS.length}${dead ? `   NO REPORT FROM: ${deadKeys.join(', ')}` : ''}
  PRD supplied: ${PRD || 'NO -- validation against the PRD was skipped or degraded'}
  requirements indexed: ${index.requirements.length}   tasks indexed: ${index.tasks.length}
${dead
  ? `Whatever those verifier(s) cover is UNVERIFIED by this run. Add a Could Not Verify row
naming them and what they would have checked.`
  : ''}${PRD ? '' : `No PRD was supplied, so validation is UNCHECKED. Say so.`}${EMPTY_REQS
  ? `
ZERO REQUIREMENTS WERE INDEXED, so traceability -- this command's headline check -- ran
against an empty list and could not have found anything. Do NOT report this run as clean.
Add a Could Not Verify row saying traceability is UNCHECKED because no requirements were
recovered from ${TRD}${PRD ? ` or ${PRD}` : ''}, and say so in the readout.`
  : ''}${EMPTY_TASKS
  ? `
ZERO TASKS WERE INDEXED, so verification against the TRD's tasks could not have found
anything. Add a Could Not Verify row saying so.`
  : ''}`

const NOTHING_INDEXED = EMPTY_REQS || EMPTY_TASKS

if (findings.length === 0) {
  const clean = await agent(
    `This audit of the code delivered against ${TRD} raised NO findings.${NOTHING_INDEXED
      ? ` That is NOT a
clean bill of health on this run: the Index recovered ${index.requirements.length} requirements and
${index.tasks.length} tasks, so the checks below had nothing to run against. Report the audit as
INCONCLUSIVE, not passing.`
      : ` Verification, validation and traceability all
confirm.`} Your only job is the ## Could Not Verify section in
${TRD} -- do not otherwise edit the document, and do not invent findings.
${COVERAGE}${CNV}`,
    {
      label: 'reconcile:could-not-verify',
      phase: 'Reconcile',
      effort: 'low',
      schema: {
        type: 'object', additionalProperties: false,
        required: ['could_not_verify_remaining'],
        properties: { could_not_verify_remaining: { type: 'array', items: { type: 'string' } } },
      },
    }
  )
  if (!clean) log('WARNING: Could Not Verify rewrite returned nothing — the section is unchanged')
  return {
    trd: TRD, prd: PRD, findings: 0, applied: 0, rejected: 0,
    still_unverified: ((clean && clean.could_not_verify_remaining) || []).length,
    verifiers_reporting: `${alive.length}/${VERIFIERS.length}`,
    incomplete_coverage: dead > 0 || NOTHING_INDEXED,
    readout: `AUDIT-BUILD: ${TRD}\nPRD: ${PRD || '(none supplied)'}\n\n` +
      (NOTHING_INDEXED
        ? `  INCONCLUSIVE — the Index recovered ${index.requirements.length} requirements and ${index.tasks.length} tasks,\n` +
          `  so traceability and verification ran against an empty list. Zero findings here means\n` +
          `  nothing was checked, NOT that everything passed. Re-run once the TRD's requirement\n` +
          `  and task tables parse.\n`
        : `  NO ACTION — every requirement is implemented and has a test proving it, every task\n` +
          `  matches its delivered code, nothing in the PRD was dropped.\n`) +
      (dead > 0 ? `  CAVEAT — ${dead} verifier(s) failed to report (${deadKeys.join(', ')}); coverage is incomplete.\n` : ''),
  }
}

const readout = await agent(
  `Weigh these audit-build findings against the delivered code${PRD ? ` and ${PRD}` : ''}, then
draft the readout. Where a finding warrants a fix that is small and mechanical (a missing test
file stub is NOT small; a citation that resolves elsewhere IS), you may correct the TRD's
## Could Not Verify section, but do NOT write application code or tests yourself -- this
command reports gaps, it does not close them. Closing a GAP is implementation work for the
next /implement-trd pass, not this reconcile step.

SOURCE OF TRUTH for this artifact: ${PRD || '(none supplied)'}
${SCOPE}

You are charged below with REJECTING findings where a verifier missed code or a test that does
exist, or resolved a path against the wrong repository. You cannot do either without the two
facts above -- which is why they are here. Re-open the disputed file yourself before accepting
OR rejecting a finding about it.

FINDINGS (JSON):
${JSON.stringify(findings, null, 2)}

WHERE THESE FINDINGS CAME FROM, so you judge them correctly. Verifier agents read the delivered
code and tests directly, along with ${TRD}. To target their reads they were each handed an
in-memory INDEX of requirements and tasks -- a JSON script variable, NOT a document, NOT a
separate provenance file, and NOT something that exists on disk or can be opened, edited or
cited. It is gone the moment this workflow ends.

So when a finding does not match what the code actually contains, there is exactly one
conclusion available: THE VERIFIER WAS WRONG. Reject it on that basis. Do NOT infer that some
other artifact carries the error, and do NOT open a Could Not Verify row about being unable to
inspect one.

Where a finding is WRONG — the verifier missed an implementation or a test that does exist, or
resolved a path against the wrong repository — do not apply it as a gap, and say so in the
readout naming the file that refutes it. Rejecting a bad finding is as valuable as reporting a
good one.
${COVERAGE}${CNV}

EVERY READOUT LINE NAMES THE ACTION, NOT THE CLASSIFICATION. Use exactly these headings,
omitting empty ones:

  TRACEABILITY GAPS — implemented, no test proving it (the headline check)
  MISSING IMPLEMENTATION — required, never built
  MISMATCH — built, but does something other than what was required
  UNTESTED-IN-PRACTICE — a test exists but does not prove the requirement (test-quality-audit)
  FIX THE CITATION — referenced ID or path does not resolve
  REJECTED THESE FINDINGS — and the file that refutes each
  NO ACTION — implemented, tested, sourced

One screen. If there are 40 clean requirements, print the COUNT as one line, not forty.`,
  {
    label: 'reconcile',
    phase: 'Reconcile',
    effort: 'high',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['readout', 'applied', 'rejected'],
      properties: {
        readout: { type: 'string' },
        applied: { type: 'array', items: { type: 'string' } },
        rejected: { type: 'array', items: { type: 'string' } },
        could_not_verify_remaining: { type: 'array', items: { type: 'string' } },
      },
    },
  }
)
required(readout, 'Reconcile')

return {
  trd: TRD,
  prd: PRD,
  findings: findings.length,
  applied: readout.applied.length,
  rejected: readout.rejected.length,
  still_unverified: (readout.could_not_verify_remaining || []).length,
  verifiers_reporting: `${alive.length}/${VERIFIERS.length}`,
  incomplete_coverage: dead > 0,
  readout: readout.readout,
}
