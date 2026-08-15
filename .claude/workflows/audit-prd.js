export const meta = {
  name: 'audit-prd',
  description: 'Verify an existing PRD against its source, the corpus and the code',
  whenToUse: "Invoked by /audit-prd. Runs the verification wave over any PRD — one this pipeline authored, or one written months ago by anyone. Applies what survives checking and rewrites the artifact's Could Not Verify section.",
  phases: [
    { title: 'Index', detail: 'derive requirements/decisions from the document itself' },
    { title: 'Verify', detail: 'parallel read-only verifiers, findable-only mandates' },
    { title: 'Reconcile', detail: 'apply what survives, rewrite Could Not Verify' },
  ],
}

// audit is SELF-CONTAINED -- it re-derives its index from the document rather than consuming
// create's structured return, so it works on a PRD create never touched. See audit-trd.js.
//
// args: { prd, source, project }

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
const PRD = a.prd
const SOURCE = a.source || ''
const PROJECT = a.project || ''
if (!PRD) throw new Error('audit-prd: args.prd (the artifact to audit) is required')

const SCOPE = `
PATH SCOPING. ${PROJECT
  ? `The project under design is ${PROJECT}. Every source, test, config and .claude/rules/*
path resolves against THAT project, not against the repository holding the PRD document.
Resolve a path there before reporting that anything does not exist.`
  : `Relative paths resolve against the repository containing the PRD.`}
A "does not exist" finding resolved against the wrong repository is a false positive.`

const CORPUS_RULE = `
THE CORPUS STATES INTENT. THE CODE STATES FACT. Design documents are provenance -- they say
what was decided. They are not a description of the current system: most stop being
maintained the moment implementation starts. Cite a document as the SOURCE of a decision;
never as evidence something is built. Where a document and the code disagree, the code wins
and the disagreement is itself a finding.`

const FINDABLE_ONLY = `
FINDABLE ONLY. Every finding names a source, a contradiction, or a specific mechanism
failure, and is checkable in seconds.
  - "REQ-4 traces to nothing in the source" is checkable and permitted.
  - "I think REQ-4 is unnecessary" is manufactured and FORBIDDEN.
Do NOT propose new requirements. Do NOT strike one on judgment -- striking a real requirement
is harder to detect than adding a fake one. A finding asserting severity carries the same
sourcing burden as a requirement. Zero findings is a legitimate result.`

const BATCH = `
BATCH YOUR READS. Every tool call re-caches your whole context, so turn count costs as much
as context size. Prefer one grep over five. Do not re-open a file you have read.`

// --------------------------------------------------------------------------- 1. INDEX

phase('Index')

const index = await agent(
  `Index ${PRD} so the verifiers can target their reads. You are producing a MAP, not a
review. Do not evaluate anything.

Type every line by NATURE, not by section heading:
  REQUIREMENT - what the product must do, and any threshold stating how well. A measurable
                number is a requirement wherever it appears, including inside prose.
  DECISION    - a product choice made, especially one with a rejected alternative.

For each, capture its ID, its statement, the source it claims (verbatim, if it names one),
and roughly where in the document it sits.

MANDATORY -- do not skip and do not return empty without checking. Grep the document for
"## Could Not Verify" and "## Open Questions" and capture EVERY row of each, verbatim: the ## Could Not Verify and ## Open Questions sections.
Both may be absent -- older artifacts will not have them.

BATCH YOUR READS. Grep for the tables and headings; do not read the document linearly.`,
  {
    label: 'index',
    phase: 'Index',
    effort: 'low',
    model: 'haiku',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['requirements', 'decisions'],
      properties: {
        requirements: {
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
              rejected: { type: 'string' }, section: { type: 'string' },
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
log(`indexed ${index.requirements.length} requirements, ${index.decisions.length} decisions` +
    `${(index.could_not_verify || []).length ? `; ${index.could_not_verify.length} unverified claims declared` : ''}`)

// --------------------------------------------------------------------------- 2. VERIFY

phase('Verify')

const FINDING_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['check', 'why', 'confidence'],
        properties: {
          check: { type: 'string', enum: ['provenance','severity','omission','grounding','conformance','stale-doc','citation'] },
          why: { type: 'string' },
          confidence: { type: 'string', enum: ['high','medium','low'] },
          id: { type: 'string' },
          line: { type: 'string' },
          source_ref: { type: 'string' },
          action: { type: 'string', enum: ['delete','lower-to-floor','add-back','already-exists','pick-one','confirm-wanted','fix-citation'] },
        },
      },
    },
  },
}

const REQ = JSON.stringify(index.requirements, null, 1)
const DEC = JSON.stringify(index.decisions, null, 1)

const GROUNDING_RULE = `
GROUNDING RULE -- NON-NEGOTIABLE. The records above are an INDEX telling you what exists and
roughly where. The artifact is ${PRD}, and it is Markdown.
  - Use the index to target reads. Do not read the document linearly.
  - Before reporting ANY finding, grep ${PRD} for the exact text you will quote and confirm
    it is there. Quote the document's words, not the index's field names.
  - If index and document disagree, THAT is the finding. Report both versions.
  - A finding citing an ID or field absent from ${PRD} is a fabrication. This has happened.`

const VERIFIERS = [
  {
    key: 'source-fidelity', effort: 'high',
    prompt: `Check ${PRD} against its source in BOTH directions. ${SOURCE
      ? `The source is ${SOURCE}. Read it fully -- it is the baseline and the only thing this check runs against.`
      : `NO SOURCE WAS SUPPLIED. Report that as your single finding and stop. A fidelity pass without a baseline cannot run, and inferring what the source said would manufacture exactly the findings this check exists to catch.`}

REQUIREMENTS (index):
${REQ}

DECISIONS (index):
${DEC}

  source -> PRD: which requirements, decisions and REJECTIONS in the source are missing here?
                 A rejection dropped silently is a real loss: the next author re-proposes the
                 same dead end.
  PRD -> source: which requirements trace to nothing in the source? Check the STRICTNESS too,
                 not just the requirement's existence -- an unsourced threshold on a sourced
                 requirement is the commonest invention, and it looks legitimate because the
                 requirement itself is real.

If the source is a session brief, note that a brief is DERIVED. Where it makes a claim about
what was settled, the claim is checkable against the transcript; treat an uncheckable brief
line as a finding rather than as a baseline.`,
  },
  {
    key: 'grounding', effort: 'high',
    prompt: `Does what ${PRD} asks for ALREADY EXIST, or contradict the code?

REQUIREMENTS (index):
${REQ}

Read real code in ${PROJECT || 'this repository'}. For each requirement, check whether the
capability is already built -- fully, partly, or in a form that would be replaced.

  already-exists: the capability is there. Name the file and line. A PRD asking for something
                  already shipped costs an entire implementation cycle to discover.
  stale-doc:      the PRD asserts something about the system that the code contradicts.
                  Measured instance: a PRD cited an env-var mechanism as its verification
                  path whose only occurrences anywhere were two design documents describing
                  it as something to be built -- zero hits in src/ or tests/.`,
  },
  {
    key: 'conformance', effort: 'low', model: 'haiku',
    prompt: `Two mechanical checks over ${PRD}. Both are lookups -- do NOT read it linearly.

  CONFORMANCE: read ${PROJECT || 'this repository'}'s .claude/rules/stack.md and
  .claude/rules/constitution.md -- both short -- then grep ${PRD} for what they constrain:
  technologies outside the declared stack, figures below a stated floor, prohibited patterns,
  contradicted invariants.

  CITATIONS: grep for citation-shaped strings (IDs, section refs, file:line), then grep each
  referenced ID in its live target file. Report every one that does not resolve, naming the
  ID and the file searched.

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
const dead = VERIFIERS.length - alive.length
if (dead > 0) log(`WARNING: ${dead} verifier(s) returned nothing — coverage is incomplete for this run`)
log(`${findings.length} findings from ${alive.length}/${VERIFIERS.length} verifiers`)

// --------------------------------------------------------------------------- 3. RECONCILE

phase('Reconcile')

const CNV = `

REWRITE THE ## Could Not Verify SECTION. This is what makes the artifact carry its own
verification state, and it is the reason audit exists as a separate command.

READ THE SECTION FROM THE DOCUMENT YOURSELF -- grep ${PRD} for "## Could Not Verify" and
read what is actually there. Do NOT rely on the index for this. The index is a cheap pass and
has been observed returning an EMPTY list for a document that carried four populated rows; a
reconcile that trusted it would have silently deleted every one of them while believing it
was rewriting an empty section.

For reference only, the index reported (which may be wrong, and may be empty):
${JSON.stringify(index.could_not_verify || [], null, 1)}

Replace that section with what is true AFTER this audit:
  - Checked and confirmed: remove -- no longer unverified.
  - Checked and found false: those are findings, not entries.
  - Not checked by this audit: keep, and say why it was out of scope.
  - Unresolvable (a verifier died, no source supplied): add it.

If the artifact has no such section, add one. A reader must be able to open this document and
see what has been verified and what has not, without running anything.`

if (findings.length === 0) {
  return {
    prd: PRD, findings: 0, applied: 0, rejected: 0,
    verifiers_reporting: `${alive.length}/${VERIFIERS.length}`,
    incomplete_coverage: dead > 0,
    readout: `AUDIT: ${PRD}\nSOURCE: ${SOURCE || '(none supplied)'}\n\n` +
      `  NO ACTION — every requirement traces to the source, nothing is already built,\n` +
      `  every citation resolves.\n` +
      (dead > 0 ? `  CAVEAT — ${dead} verifier(s) failed to report; coverage is incomplete.\n` : ''),
  }
}

const readout = await agent(
  `Apply these audit findings to ${PRD}, then draft the readout.

FINDINGS (JSON):
${JSON.stringify(findings, null, 2)}

Apply each using Edit. Where a finding is WRONG — the verifier missed a source that does
exist, or resolved a path against the wrong repository — do not apply it, and say so in the
readout naming the file that refutes it. Rejecting a bad finding is as valuable as applying a
good one: in one measured run 6 of 9 findings were wrong because a verifier read the wrong
repository's constitution, five of them at high confidence.
${CNV}

EVERY READOUT LINE NAMES THE ACTION, NOT THE CLASSIFICATION. Use exactly these headings,
omitting empty ones:

  DELETE — nothing in the source asks for these
  LOWER TO THE CONSTITUTION FLOOR, or say why it's higher
  ADD BACK — in the source, missing from this PRD
  ALREADY BUILT — name the file; decide whether the requirement survives
  PICK ONE — these contradict
  CONFIRM THESE ARE WANTED — no source names them
  FIX THE CITATION — referenced ID does not resolve
  THE DOC IS STALE — the PRD asserts something the code contradicts
  NO ACTION — sourced, listed for completeness

One screen. If there are 40 sourced requirements, print the COUNT as one line, not forty.`,
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
  prd: PRD,
  source: SOURCE,
  findings: findings.length,
  applied: readout.applied.length,
  rejected: readout.rejected.length,
  still_unverified: (readout.could_not_verify_remaining || []).length,
  verifiers_reporting: `${alive.length}/${VERIFIERS.length}`,
  incomplete_coverage: dead > 0,
  readout: readout.readout,
}
