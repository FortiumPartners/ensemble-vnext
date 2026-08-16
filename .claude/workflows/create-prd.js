export const meta = {
  name: 'create-prd',
  description: 'Author a PRD from a verbatim source package, inheriting decisions from the existing design corpus',
  whenToUse: 'Invoked by /create-prd. Indexes the existing design corpus for provenance, then authors one PRD in a fresh product-manager that sees the source VERBATIM. Verification is a separate command: /audit-prd.',
  phases: [
    { title: 'Corpus', detail: 'cheap index of related design docs — provenance, not fact' },
    { title: 'Author', detail: 'one product-manager, fresh context, sees the source verbatim' },
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
const PROJECT = a.project || ''
// Corpus and code both live in the PROJECT under design, which is NOT always the repo this
// workflow runs from -- designing for repo B while sitting in repo A is a normal case. Left
// unscoped, the corpus stage indexes the AUTHORING repo's design docs and hands the author
// another project's decisions as if they were its own.
const CORPUS_ROOT = PROJECT ? (PROJECT.replace(/\/+$/, '') + '/') : ''
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

// What this PRD is accountable to. Recorded in the readout and handed to /audit-prd, which
// checks fidelity against THIS -- the source document itself, never a summary of it.
// Auditing a PRD against a brief would only prove it faithful to a summary, and would
// CERTIFY anything the brief already dropped or invented.
const BASELINE = SOURCE || BRIEF

// --------------------------------------------------------------------------- 0.5 CORPUS
// Design documents are a valuable source and an UNRELIABLE one: most PRDs and TRDs stop
// being maintained the moment implementation starts. The corpus is used for PROVENANCE --
// what was decided, why, what conventions exist -- and never as a statement of current
// fact. Checking current fact is /audit-prd's job, and it reads code to do it.
//
// Cost control: ONE cheap agent producing a compact INDEX, handed to the author via a
// script variable. It does NOT read documents end to end, and the author never opens the
// corpus itself.
phase('Corpus')

const corpus = await agent(
  `Index the existing design corpus so the PRD author can inherit decisions instead of
re-deciding them. You are producing a MAP, not a summary.

Look in ${CORPUS_ROOT}docs/PRD/ and ${CORPUS_ROOT}docs/TRD/ (and any sibling location that
project actually uses -- check before assuming; do NOT assume a layout). For each document that plausibly relates to "${FEATURE}" by subject:

  - its path and title
  - the decisions it records: grep its decisions table, any "Decisions" or "Rejected"
    section, and any supersession banner. Capture the CHOICE and the ID, not the rationale.
  - REJECTED alternatives specifically -- these are the highest-value entries. A rejection
    nobody recorded is a dead end the next author walks into again.
  - whether anything marks it superseded, and by what

Then note conventions visible ACROSS documents: ID prefixes in use, recurring product
decisions, recurring non-goals.

READ DISCIPLINE -- this is the whole point of doing it as one cheap pass. Grep for headings
and table rows. Do NOT read documents end to end. If a repo has 30 PRDs you should be
reading a few hundred lines total, not thirty documents.

Return at most 40 entries. If more relate, return the closest 40 by subject and say how many
you skipped -- a truncated index that says so is useful; a silent one is not.`,
  {
    label: 'corpus-index',
    phase: 'Corpus',
    effort: 'low',
    model: 'haiku',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['documents', 'conventions'],
      properties: {
        documents: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['path', 'subject'],
            properties: {
              path: { type: 'string' }, subject: { type: 'string' },
              decisions: { type: 'array', items: { type: 'string' }, description: 'ID + choice, terse' },
              rejected: { type: 'array', items: { type: 'string' } },
              superseded_by: { type: 'string' },
            },
          },
        },
        conventions: { type: 'array', items: { type: 'string' } },
        skipped_count: { type: 'number' },
        note: { type: 'string' },
      },
    },
  }
)
required(corpus, 'Corpus')
log(`corpus: ${corpus.documents.length} related documents, ${corpus.conventions.length} conventions${corpus.skipped_count ? `, ${corpus.skipped_count} skipped` : ''}`)

const CORPUS_BLOCK = corpus.documents.length
  ? `
EXISTING DESIGN CORPUS -- PROVENANCE ONLY (index, not fact):
${JSON.stringify({ documents: corpus.documents, conventions: corpus.conventions }, null, 1)}

THE CORPUS STATES INTENT. THE CODE STATES FACT. These documents tell you what was decided
and why. They do NOT tell you what is built -- most stopped being maintained when
implementation started. Inherit decisions, conventions and REJECTIONS from them so you do
not re-litigate settled ground or re-propose a rejected alternative. Do NOT assert that
anything described here exists; if that matters, say so in ## Could Not Verify and let
/audit-prd check it against the code.

HOW TO INHERIT A CLAIM ABOUT BUILT BEHAVIOUR -- this has a measured failure behind it.
A PRD inherited "sanitize_error_detail() sanitizes every log write" from a design document
that showed it as a code sample. The function has never existed: zero hits in src/ and
tests/, five in docs/. Two review passes missed it, because both checked the QUOTE against
the design document instead of the SUBJECT against the code.

So, whenever you are about to state that something IS built, works, or behaves a given way:
  - Cite a SOURCE FILE you opened -- path, and the symbol or literal string you saw there.
  - A design-document reference is NEVER sufficient evidence for that class of claim, no
    matter how specific the document is or how confidently it reads.
  - If you did not open a source file, do not make the claim. Put it in ## Could Not Verify
    with the grep that would settle it.
Verifying a citation's ACCURACY is not verifying its SUBJECT. A perfectly accurate quote
from a document that describes something unbuilt is exactly the failure above.`
  : `
No related design documents were found in the corpus. Treat this as genuinely new ground.`

// --------------------------------------------------------------------------- 1. AUTHOR

phase('Author')

const authored = await agent(
  `You are the product-manager authoring a Product Requirements Document.

Read .claude/contracts/prd-authoring.md first. It is the complete binding instruction set
for this job. Do NOT read .claude/commands/create-prd.md -- it carries orchestration detail
you do not need and would re-cache on every turn.

${SOURCE_PACKAGE}
${CORPUS_BLOCK}

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
      // LEVER 2. Return the RECORDS so verifiers get them inline and never re-read the PRD.
      required: ['prd_path', 'requirements'],
      properties: {
        prd_path: { type: 'string' },
        requirements: {
          type: 'array',
          description: 'every requirement and NFR, with where it came from',
          items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'statement', 'source'],
            properties: {
              id: { type: 'string' }, statement: { type: 'string' },
              source: { type: 'string', description: 'the source text it traces to, or "domain-derived: <reasoning>"' },
              severity_note: { type: 'string' },
            },
          },
        },
        empty_sections: { type: 'array', items: { type: 'string' } },
        beliefs: { type: 'array', items: { type: 'string' } },
      },
    },
  }
)

required(authored, 'Author')
if (authored.prd_path && authored.prd_path !== PRD) {
  log(`WARNING: author wrote ${authored.prd_path}, not ${PRD} — downstream stages target ${PRD}`)
}
log(`authored ${authored.requirements.length} requirements`)

// ---------------------------------------------------------------------------
// create stops here. The verification wave lives in /audit-prd, which runs against ANY PRD
// -- this one, or one written months ago by hand. Splitting it that way means create is
// 2 agents instead of 5, and audit can be run more than once, later, by someone else.

return {
  prd: PRD,
  feature: FEATURE,
  source: BASELINE,
  requirements: authored.requirements.length,
  corpus_documents: corpus.documents.length,
  next: `/audit-prd ${PRD}`,
  readout:
    `PRD: ${PRD}    SOURCE: ${BASELINE}\n` +
    `  ${authored.requirements.length} requirements` +
    `${corpus.documents.length ? `, inheriting from ${corpus.documents.length} corpus documents` : ''}\n` +
    `\n  NOT YET VERIFIED. Run  /audit-prd ${PRD}  to check source fidelity in both\n` +
    `  directions, whether any of it is already built, and conformance.\n`,
}
