export const meta = {
  name: 'audit-trd',
  description: 'Verify an existing TRD against its source, the corpus and the code',
  whenToUse: "Invoked by /audit-trd. Runs the verification wave over any TRD — one this pipeline authored, or one written months ago by anyone. Applies what survives checking and rewrites the artifact's Could Not Verify section.",
  phases: [
    { title: 'Index', detail: 'derive objectives/decisions/tasks from the document itself' },
    { title: 'Verify', detail: 'parallel read-only verifiers, findable-only mandates' },
    { title: 'Reconcile', detail: 'apply what survives, rewrite Could Not Verify' },
  ],
}

// ---------------------------------------------------------------------------
// audit is deliberately SELF-CONTAINED. It does not consume create's structured return,
// because its whole point is to work on an artifact create never touched -- a TRD written
// six months ago, or by hand, or by the pre-rewrite command. It re-derives its own index
// from the document. That costs one cheap agent and buys composability: audit can run after
// create, after refine, before implement, or on nothing but a path.
//
// args: { trd, source, project }
//   trd      the artifact to audit
//   source   the PRD (or spec) it is accountable to
//   project  the codebase it targets, when that differs from where the TRD lives
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
const SOURCE = a.source || ''
const PROJECT = a.project || ''
if (!TRD) throw new Error('audit-trd: args.trd (the artifact to audit) is required')

// Case 3 measured the cost of not having this: 6 of 9 findings were wrong because a verifier
// resolved .claude/rules against the authoring repo instead of the project under design, and
// five of those were reported at HIGH confidence.
const SCOPE = `
PATH SCOPING. ${PROJECT
  ? `The project under design is ${PROJECT}. Every source, test, config and .claude/rules/*
path resolves against THAT project, not against the repository holding the TRD document.
Resolve a path there before reporting that anything does not exist.`
  : `Relative paths resolve against the repository containing the TRD.`}
A "does not exist" finding resolved against the wrong repository is a false positive. That
has happened and cost an entire verifier's output.`

const CORPUS_RULE = `
THE CORPUS STATES INTENT. THE CODE STATES FACT. Design documents are provenance -- they say
what was decided. They are not a description of the current system: most stop being
maintained the moment implementation starts. Cite a document as the SOURCE of a decision;
never as evidence something is built or behaves a given way. Where a document and the code
disagree, the code wins and the disagreement is itself a finding.`

const FINDABLE_ONLY = `
FINDABLE ONLY. Every finding names a source, a contradiction, or a specific mechanism
failure, and is checkable in seconds.
  - "A5 traces to nothing in the source" is checkable and permitted.
  - "I think A5 is unnecessary" is manufactured and FORBIDDEN.
Do NOT propose new requirements. Do NOT strike one on judgment. A finding asserting severity
carries the same sourcing burden as an objective. Zero findings is a legitimate result --
do not manufacture findings to look thorough.`

const BATCH = `
BATCH YOUR READS. Every tool call re-caches your whole context, so turn count costs as much
as context size. Prefer one grep over five. Do not re-open a file you have read.`

// --------------------------------------------------------------------------- 1. INDEX

phase('Index')

const index = await agent(
  `Index ${TRD} so the verifiers can target their reads instead of scanning a whole document.

You are producing a MAP, not a review. Do not evaluate anything.

Type every line by NATURE, not by section heading:
  OBJECTIVE - asserts what must be true and HOW WELL: acceptance criteria, NFRs, thresholds,
              quality gates, coverage targets, latency budgets. A measurable threshold is an
              objective wherever it appears, including inside a specification section.
  DECISION  - how it gets built: architecture, technology, structure, sequencing.
  TASK      - the work.

For each, capture its ID, its statement, the source it claims (verbatim, if it names one),
and roughly where in the document it sits.

MANDATORY -- do not skip and do not return empty without checking. Grep the document for headings CONTAINING "Could Not Verify" and "Open Questions" --
match loosely, because authors number them into the document's own scheme ("## 9. Open
Questions", "## 10. Could Not Verify") and an exact "## Open Questions" match silently
finds nothing. Capture EVERY row of each, verbatim.
Both may be absent -- older artifacts will not have them.

BATCH YOUR READS. Grep for the tables and headings; do not read the document linearly.`,
  {
    label: 'index',
    phase: 'Index',
    effort: 'low',
    model: 'haiku',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['objectives', 'decisions', 'tasks'],
      properties: {
        objectives: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'statement'],
            properties: {
              id: { type: 'string' }, statement: { type: 'string' },
              claimed_source: { type: 'string' }, section: { type: 'string' },
            },
          },
        },
        decisions: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'choice'],
            properties: {
              id: { type: 'string' }, choice: { type: 'string' },
              serves: { type: 'string' }, section: { type: 'string' },
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
              serves: { type: 'string' }, section: { type: 'string' },
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
log(`indexed ${index.objectives.length} objectives, ${index.decisions.length} decisions, ${index.tasks.length} tasks` +
    `${(index.could_not_verify || []).length ? `; ${index.could_not_verify.length} unverified claims declared` : ''}`)

// --------------------------------------------------------------------------- 2. VERIFY

phase('Verify')

const FINDING_ITEMS = {
  type: 'array',
  items: {
    type: 'object', additionalProperties: false,
    required: ['check', 'why', 'confidence'],
    properties: {
      check: { type: 'string', enum: ['provenance','severity','omission','buildability','consistency','derivation','citation','conformance','stale-doc'] },
      why: { type: 'string' },
      confidence: { type: 'string', enum: ['high','medium','low'] },
      id: { type: 'string', description: "the artifact's own ID; omit for omission findings" },
      line: { type: 'string', description: 'the text as written; omit for omission findings' },
      source_ref: { type: 'string' },
      action: { type: 'string', enum: ['delete','lower-to-floor','add-back','unbuildable','pick-one','confirm-wanted','check-reasoning','fix-citation'] },
    },
  },
}
const FINDING_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['findings'], properties: { findings: FINDING_ITEMS },
}

const OBJ = JSON.stringify(index.objectives, null, 1)
const DEC = JSON.stringify(index.decisions, null, 1)
const TSK = JSON.stringify(index.tasks, null, 1)

// The index is an INDEX -- what exists and where. It is NOT the artifact. An earlier version
// let verifiers audit the index directly: findings quoted a JSON field the markdown document
// does not contain and cited an ID with zero hits repo-wide. Findings fell 16 -> 2 and both
// were wrong.
const GROUNDING_RULE = `
GROUNDING RULE -- NON-NEGOTIABLE. The records above are an INDEX telling you what exists and
roughly where. The artifact is ${TRD}, and it is Markdown.
  - Use the index to target reads. Do not read the document linearly.
  - Before reporting ANY finding, grep ${TRD} for the exact text you will quote and confirm
    it is there. Quote the document's words, not the index's field names.
  - If index and document disagree, THAT is the finding. Report both versions.
  - A finding citing an ID or field absent from ${TRD} is a fabrication. This has happened.`

const VERIFIERS = [
  {
    key: 'objective-audit', effort: 'high',
    prompt: `Audit these objectives for PROVENANCE and SEVERITY.

OBJECTIVES (index):
${OBJ}

SOURCE OF TRUTH: ${SOURCE || '(none supplied -- treat the artifact\'s own stated sources as the claim under test)'}
Plus ${PROJECT || 'this repository'}'s .claude/rules/stack.md and .claude/rules/constitution.md.

  provenance: does each trace to a named source, a measurement, or an explicit instruction?
              An objective labelled domain-derived is permitted -- check the reasoning holds.
  severity:   is the STRICTNESS sourced, not just the requirement's existence? Read the
              coverage floors in constitution.md; a figure above a floor must say why.
              "Zero tolerance" and "<=1 per run" are different requirements.

Verify claimed sources by opening them. A source that does not say what the objective claims
it says is a finding.`,
  },
  {
    key: 'derivation-audit', effort: 'high',
    prompt: `Check that every task and every piece of delivery machinery names the objective
it serves.

TASKS (index):
${TSK}

DECISIONS (index):
${DEC}

  - Any task whose serves is empty, or names an ID absent from the objectives/decisions?
  - **SIZING — check the grounding blocks, not just the task table.** Collect each task's
    `Touches` files from the `## Task Grounding` section. Any FILE named by two or more tasks
    means those tasks serialize (two agents editing one file is a lost update). Report each
    such cluster unless the task rows state a size or verifiability reason for staying split.
    Splitting for parallelism that cannot happen costs an implement-loop pass per extra task.
    Measured: four tasks on one command file, two folded on review with no loss.
  - **EMPTY TOUCHES on a non-greenfield repo.** A task whose grounding block names no file
    produces no durable change. Report it unless it names where its findings land — a probe
    document, a decision record, an added line. Measured: four such tasks in one TRD, none
    naming an output.
  - Any DECISION that is really delivery machinery -- feature flags, rollout phases,
    migration paths, guard infrastructure, eval gates, config toggles -- serving no stated
    objective? That is the largest category of wasted implementation work: machinery added
    because it is how one normally ships, then built and deployed dark.`,
  },
  {
    key: 'omission-audit', effort: 'high',
    prompt: `Traverse SOURCE -> ARTIFACT. ${SOURCE
      ? `Read ${SOURCE} fully; its objectives are your checklist.`
      : `No source was supplied. Report that as your single finding and stop -- an omission pass without a source cannot run, and guessing what the source said would manufacture findings.`}

The artifact's objectives are indexed above. For each objective the SOURCE states, assert it
either appears in the artifact or is explicitly listed under Non-Goals (grep the artifact for
"Non-Goal" only -- do not read it through).

A per-line audit cannot see a line that is not there. Dropping a requirement is commoner than
inventing one, and silent narrowing -- reproducing seven of eight metrics and dropping the
eighth without comment -- has no other check that can catch it.`,
  },
  {
    key: 'design-audit', effort: 'high',
    prompt: `Judge the DECISIONS in ${TRD} for BUILDABILITY and CONSISTENCY. This one requires
reading real code, so read it.

DECISIONS (index):
${DEC}

  buildability: can each decision be built AS SPECIFIED, given how the mechanism it governs
                actually works? Check the mechanism. Do not assume it works the way the
                document says. This is the cheapest check available and historically the one
                never performed: a specified mechanism was designed around, built against and
                deferred around before anyone asked whether it could exist. It could not.
  consistency:  does any decision contradict a sibling, or a document that supersedes this one?
  stale-doc:    does the artifact assert something about the code that is no longer true?
                Measured instance: a PRD cited an env var as its verification mechanism whose
                only occurrences anywhere were two design documents describing it as something
                to be built -- zero hits in src/ or tests/.`,
  },
  {
    key: 'deterministic', effort: 'low', model: 'haiku',
    prompt: `Two mechanical checks over ${TRD}. Do NOT read it linearly -- both are lookups.

  CITATIONS: grep for citation-shaped strings (IDs, section refs, file:line), then grep each
  referenced ID in its live target file. Report every one that does not resolve, naming the ID
  and the file searched.

  CONFORMANCE: read ${PROJECT || 'this repository'}'s .claude/rules/stack.md and
  .claude/rules/constitution.md -- both short -- then grep the artifact for what they
  constrain: technologies outside the declared stack, coverage figures below a stated floor,
  prohibited patterns, contradicted architectural invariants.

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

phase('Reconcile')

const CNV = `

REWRITE THE ## Could Not Verify SECTION. This is what makes the artifact carry its own
verification state, and it is the reason audit exists as a separate command.

READ THE SECTION FROM THE DOCUMENT YOURSELF -- grep ${TRD} for "## Could Not Verify" and
read what is actually there. Do NOT rely on the index for this. The index is a cheap pass and
has been observed returning an EMPTY list for a document that carried four populated rows; a
reconcile that trusted it would have silently deleted every one of them while believing it
was rewriting an empty section.

For reference only, the index reported (which may be wrong, and may be empty):
${JSON.stringify(index.could_not_verify || [], null, 1)}

Replace that section with what is true AFTER this audit:
  - Claims this audit checked and confirmed: remove them from the section, since they are no
    longer unverified.
  - Claims this audit checked and found false: those are findings, not entries.
  - Claims this audit did NOT check: keep them, and say why they were out of scope.
  - Anything this audit could not resolve (a verifier died, a source was missing): add it.

If the artifact has no such section, add one. A reader must be able to open this document and
see what has been verified and what has not, without running anything.`

// The section above asks for "anything this audit could not resolve (a verifier died, a
// source was missing)". NOTHING in the findings JSON carries that: a verifier that dies
// returns null and vanishes, so the reconcile agent cannot tell a check that passed from one
// that never ran. Unstated, the document records a clean bill of health for checks that were
// never performed -- the precise failure ## Could Not Verify exists to prevent.
const COVERAGE = `

COVERAGE OF THIS AUDIT -- state it, do not infer it from the findings:
  verifiers reporting: ${alive.length}/${VERIFIERS.length}${dead ? `   NO REPORT FROM: ${deadKeys.join(', ')}` : ''}
  source supplied: ${SOURCE || 'NO -- every check needing a baseline was skipped or degraded'}
${dead
  ? `Whatever those verifier(s) cover is UNVERIFIED by this run. Add a Could Not Verify row
naming them and what they would have checked.`
  : ''}${SOURCE ? '' : `No baseline was supplied, so source fidelity and omission are UNCHECKED. Say so.`}`

if (findings.length === 0) {
  // Zero findings is NOT zero work. The ## Could Not Verify section still has to be
  // reconciled: claims this audit checked and confirmed must come OUT, and any coverage gap
  // must go IN. Returning straight from here left a clean audit invisible in the document --
  // the artifact went on listing as unverified exactly what had just been verified, which is
  // the one thing audit-as-a-separate-command exists to fix. Cheap pass: one edit, no
  // findings to weigh.
  const clean = await agent(
    `This audit of ${TRD} raised NO findings. Your only job is the ## Could Not Verify
section -- do not otherwise edit the document, and do not invent findings.
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
    trd: TRD, findings: 0, applied: 0, rejected: 0,
    still_unverified: ((clean && clean.could_not_verify_remaining) || []).length,
    verifiers_reporting: `${alive.length}/${VERIFIERS.length}`,
    incomplete_coverage: dead > 0,
    readout: `AUDIT: ${TRD}\nSOURCE: ${SOURCE || '(none supplied)'}\n\n` +
      `  NO ACTION — every objective traces to a source, every decision names one, every\n` +
      `  citation resolves.\n` +
      (dead > 0 ? `  CAVEAT — ${dead} verifier(s) failed to report (${deadKeys.join(', ')}); coverage is incomplete.\n` : ''),
  }
}

const readout = await agent(
  `Apply these audit findings to ${TRD}, then draft the readout.

SOURCE OF TRUTH for this artifact: ${SOURCE || '(none supplied)'}
${SCOPE}

You are charged below with REJECTING findings where a verifier missed a source
that does exist, or resolved a path against the wrong repository. You cannot do
either without the two facts above -- which is why they are here. Re-resolve a
disputed path yourself before accepting OR rejecting a finding about it.

FINDINGS (JSON):
${JSON.stringify(findings, null, 2)}

WHERE THESE FINDINGS CAME FROM, so you judge them correctly. Verifier agents read
${TRD} directly. To target their reads they were each handed an in-memory INDEX of the
artifact's own IDs -- a JSON script variable, NOT a document, NOT a separate provenance
file, and NOT something that exists on disk or can be opened, edited or cited. It is gone
the moment this workflow ends.

So when a finding does not match what ${TRD} actually says, there is exactly one
conclusion available: THE VERIFIER WAS WRONG. Reject it on that basis. Do NOT infer that
some other artifact carries the error, do NOT report an external index as needing repair,
and do NOT open a Could Not Verify row about being unable to inspect one. A previous run
invented exactly that artifact and logged it as an open item; the rejections were right and
the explanation described something that has never existed.

Apply each using Edit. Where a finding is WRONG — the verifier missed a source that does
exist, or resolved a path against the wrong repository — do not apply it, and say so in the
readout naming the file that refutes it. Rejecting a bad finding is as valuable as applying a
good one: in one run 6 of 9 findings were wrong because a verifier read the wrong repo's
constitution, five of them at high confidence.
${COVERAGE}${CNV}

EVERY READOUT LINE NAMES THE ACTION, NOT THE CLASSIFICATION. Readouts here have been rejected
repeatedly for being unreadable — "I DO NOT UNDERSTAND what action you expect me to take on
these?" Use exactly these headings, omitting empty ones:

  DELETE — nothing in the source asks for these
  LOWER TO THE CONSTITUTION FLOOR, or say why it's higher
  ADD BACK — in the source, missing from this artifact
  CANNOT BE BUILT AS WRITTEN
  PICK ONE — these contradict
  CONFIRM THESE ARE WANTED — invented machinery, no objective named
  FIX THE CITATION — referenced ID does not resolve
  THE DOC IS STALE — the artifact asserts something the code contradicts
  NO ACTION — sourced, listed for completeness

One screen. If there are 40 sourced objectives, print the COUNT as one line, not forty.`,
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
  source: SOURCE,
  findings: findings.length,
  applied: readout.applied.length,
  rejected: readout.rejected.length,
  still_unverified: (readout.could_not_verify_remaining || []).length,
  verifiers_reporting: `${alive.length}/${VERIFIERS.length}`,
  incomplete_coverage: dead > 0,
  readout: readout.readout,
}
