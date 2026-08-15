export const meta = {
  name: 'create-prd',
  description: 'Author a PRD from a verbatim source package, verify it against source, emit the readout',
  whenToUse: 'Invoked by the /create-prd command. Authors one PRD in a fresh product-manager, runs three read-only verifiers against the SOURCE (never a summary of it), returns a readout.',
  phases: [
    { title: 'Author', detail: 'one product-manager, fresh context, sees the source verbatim' },
    { title: 'Verify', detail: 'three read-only verifiers, findable-only mandates' },
    { title: 'Reconcile', detail: 'apply findings, draft the action-register readout' },
  ],
}

// ---------------------------------------------------------------------------
// args: { source, brief, prd, feature }
//   source   VERBATIM source document path (ticket/spec/story), or ''
//   brief    docs/PRD/<feature>.brief.md, only when defined in-session, or ''
//   prd      path the PRD should be written to
// ---------------------------------------------------------------------------

// `args` may arrive as a JSON-encoded STRING rather than an object when a caller passes it
// stringified. Left unhandled, every field reads as undefined and the script dies with a
// misleading "required arg missing" -- pointing at the caller's payload instead of its shape.
function readArgs(raw) {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch (e) {
      throw new Error(
        'workflow args arrived as a string and is not valid JSON. Pass args as an actual ' +
        'JSON object in the tool call, not a JSON-encoded string.'
      )
    }
  }
  return raw || {}
}

const a = readArgs(args)
const SOURCE = a.source || ''
const BRIEF = a.brief || ''
const PRD = a.prd
const FEATURE = a.feature || 'feature'

if (!PRD) throw new Error('create-prd workflow: args.prd (output path) is required')
if (!SOURCE && !BRIEF) throw new Error('create-prd workflow: one of args.source / args.brief is required')

// A stage that dies returns null (documented agent() behaviour). Dereferencing it yields an
// opaque TypeError; worse, the reconcile stage dies AFTER it has already edited the artifact
// on disk, discarding the readout and leaving a mutated document with no record of why.
function required(value, stage) {
  if (value === null || value === undefined) {
    throw new Error(
      `${stage} stage returned no result (the agent died or was skipped). ` +
      `Nothing downstream can run without it. Re-run, or run the command's prose fallback.`
    )
  }
  return value
}


// Distillation is a LOSSY transform. A source document is passed through verbatim; a brief
// exists only where nothing else can carry the information (defined live in session), and
// it is an authoring input and a checkable claim about the transcript -- never the baseline.
const SOURCE_PACKAGE = [
  SOURCE ? `VERBATIM SOURCE DOCUMENT (read it whole; it has not been summarised): ${SOURCE}` : '',
  BRIEF ? `SESSION BRIEF (in-session delta only; NOT the baseline): ${BRIEF}` : '',
].filter(Boolean).join('\n')

// The baseline every verifier checks against. Verifying a PRD against the brief would only
// prove the PRD is faithful to a summary, and would CERTIFY anything the brief already
// dropped or invented.
const BASELINE = SOURCE || BRIEF
const BASELINE_NOTE = SOURCE
  ? `Verify against ${SOURCE} -- the source document itself, never a summary of it.`
  : `Verify against ${BRIEF}. NOTE: this is a distilled brief, the only carrier for ` +
    `in-session requirements. Treat a mismatch as a finding about the PRD, but flag any ` +
    `place the brief itself looks lossy.`

// --------------------------------------------------------------------------- 1. AUTHOR

phase('Author')

const authored = await agent(
  `You are the product-manager authoring a Product Requirements Document.

Read .claude/commands/create-prd.md first -- specifically "What a PRD may contain" and
"PRD Document Structure". Those are binding; apply them rather than restating them.

${SOURCE_PACKAGE}

Write the PRD to ${PRD} using the Write tool. Do not return its content as text.

Binding constraints:
  1. Every requirement traces to the source above, a measurement you cite, or a named
     constraint in stack.md / constitution.md. A requirement tracing only to "products like
     this usually have one" does not belong in the PRD.
  2. NEVER invent a number. No latency, uptime, throughput or coverage figure unless it was
     stated, documented, or measured. An example value is an anchor and anchors get adopted.
  3. Source the SEVERITY, not just the requirement. "Must be fast" becoming "p95 < 200ms" is
     an invention even when "must be fast" was real. Mark aspirational figures as targets.
  4. An empty section is a CORRECT outcome. Most features have no non-functional requirement
     anyone asked for. There is no diagram quota.
  5. Nothing the source asks for may be silently dropped -- anything out of scope goes under
     Non-Goals explicitly. Dropping is the commoner failure.
  6. Record rejected alternatives with a REVISIT CONDITION. A rejection with no revisit
     condition reads as permanent and gets re-litigated the moment circumstances change.
  7. Label unverified claims "Belief, not fact" and name what would settle them.

Return ONLY a JSON object describing what you wrote.`,
  {
    label: 'author:product-manager',
    phase: 'Author',
    agentType: 'product-manager',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['prd_path', 'requirement_ids'],
      properties: {
        prd_path: { type: 'string' },
        requirement_ids: { type: 'array', items: { type: 'string' } },
        nfr_ids: { type: 'array', items: { type: 'string' } },
        empty_sections: { type: 'array', items: { type: 'string' } },
        beliefs: {
          type: 'array',
          items: { type: 'string' },
          description: 'claims labelled "Belief, not fact", with what would settle each',
        },
      },
    },
  }
)

required(authored, 'Author')
if (authored.prd_path && authored.prd_path !== PRD) {
  log(`WARNING: author wrote ${authored.prd_path}, not ${PRD} — downstream stages target ${PRD}`)
}
log(`authored ${authored.requirement_ids.length} requirements`)

// --------------------------------------------------------------------------- 2. VERIFY
// Runs on EVERY invocation. No complexity threshold: a threshold is itself an unsourced
// requirement, and it would skip verification exactly when a one-line prompt got elaborated
// into something large. Verifiers return empty quickly on a small draft.

phase('Verify')

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        // id/line omitted for omission findings — see create-trd.js for the reasoning.
        required: ['check', 'why', 'confidence'],
        properties: {
          id: { type: 'string', description: "the PRD's own ID; omit for omission findings" },
          source_ref: { type: 'string', description: 'for omission findings: where in the SOURCE it is stated' },
          check: { type: 'string', enum: ['provenance', 'severity', 'omission', 'grounding', 'conformance'] },
          line: { type: 'string', description: 'the text as written; omit for omission findings' },
          why: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          action: { type: 'string', enum: ['delete', 'add-back', 'record-rejection', 'lower', 'check-reasoning'] },
        },
      },
    },
  },
}

const FINDABLE_ONLY = `
FINDABLE ONLY. Every finding names a source, a contradiction, or a failed lookup, and is
checkable in seconds.

  - "REQ-4 traces to nothing in the source" is checkable and permitted.
  - "I think REQ-4 is unnecessary" is manufactured and FORBIDDEN.

A challenger fills the role it was handed exactly as an author does, and striking a real
requirement is harder to detect than adding a fake one. Do NOT propose new requirements.
If your finding asserts severity, that assertion carries the same sourcing burden as a
requirement. Zero findings is a legitimate result.
`

const VERIFIERS = [
  {
    key: 'source-fidelity',
    effort: 'high',
    prompt: `Check ${PRD} against the SOURCE in BOTH directions. ${BASELINE_NOTE}

  source -> PRD:  which requirements, decisions and REJECTIONS in the source never made it
                  into the PRD, and are not listed under Non-Goals? Dropping is the commoner
                  failure -- do this direction FIRST and thoroughly.
  PRD -> source:  which requirements in the PRD trace to nothing in the source?

Also flag any number in the PRD that does not appear in the source and is not attributed to
a measurement -- a figure that appeared during authoring is an invention even when the
underlying need was real.`,
  },
  {
    key: 'grounding',
    // High: 'does this already exist / contradict the codebase' is §9.1's second-largest
    // category (~45 hits) and needs real repository reading, not a skim.
    effort: 'high',
    prompt: `Check ${PRD} against the codebase and existing docs.

  - Does any of this ALREADY EXIST? Name the file.
  - Does any requirement CONTRADICT how the system currently works?
  - Does it duplicate an existing PRD or TRD? Search docs/PRD/ and docs/TRD/.

Report what you find with paths. Do not propose requirements.`,
  },
  {
    key: 'conformance',
    effort: 'low',
    prompt: `Check ${PRD} against .claude/rules/stack.md and .claude/rules/constitution.md.

Report anything violating a stated constraint -- a technology outside the declared stack, a
prohibited pattern, a gate below a stated floor.`,
  },
]

const waves = await parallel(
  VERIFIERS.map((v) => () =>
    agent(`${v.prompt}\n${FINDABLE_ONLY}`, {
      label: `verify:${v.key}`,
      phase: 'Verify',
      effort: v.effort,
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

if (findings.length === 0) {
  return {
    prd: PRD,
    findings: 0,
    verifiers_reporting: `${alive.length}/${VERIFIERS.length}`,
    readout:
      `PRD: ${PRD}\nSOURCE: ${BASELINE}\n\n` +
      `  NO ACTION — every requirement traces to the source, and nothing the source asks ` +
      `for is missing.\n` +
      (dead > 0 ? `  CAVEAT — ${dead} verifier(s) failed to report; coverage is incomplete.\n` : ''),
  }
}

const readout = await agent(
  `Apply these verifier findings to ${PRD}, then draft the readout.

FINDINGS (JSON):
${JSON.stringify(findings, null, 2)}

Apply each using Edit. Where a finding is wrong -- the verifier missed a source that does
exist -- do not apply it, and say so in the readout naming the source you found.

EVERY LINE NAMES THE ACTION, NOT THE CLASSIFICATION. Use exactly these headings, omitting
empty ones, in this order -- missing requirements FIRST, because dropping one is commoner
than inventing one:

  ADD BACK — in the source, missing from this PRD
  RECORD THIS REJECTION — decided in the source, not written down
  DELETE — nothing in the source asks for these
  LOWER — the requirement is real, the strictness is not
  CHECK THE REASONING — derived, not stated
  NO ACTION — sourced, listed for completeness

One screen. If there are 40 sourced requirements, print the COUNT as one line, not forty.`,
  {
    label: 'reconcile',
    phase: 'Reconcile',
    // High: edits the artifact and drafts the only output the user reads.
    effort: 'high',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['readout', 'applied', 'rejected'],
      properties: {
        readout: { type: 'string' },
        applied: { type: 'array', items: { type: 'string' } },
        rejected: { type: 'array', items: { type: 'string' } },
      },
    },
  }
)

required(readout, 'Reconcile')

return {
  prd: PRD,
  feature: FEATURE,
  findings: findings.length,
  applied: readout.applied.length,
  rejected: readout.rejected.length,
  verifiers_reporting: `${alive.length}/${VERIFIERS.length}`,
  incomplete_coverage: dead > 0,
  readout: readout.readout,
}
