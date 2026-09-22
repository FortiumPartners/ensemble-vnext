export const meta = {
  name: 'create-prd',
  description: 'Author a PRD from a verbatim source package, inheriting decisions from the existing design corpus',
  whenToUse: 'Invoked by /create-prd. Indexes the existing design corpus for provenance, then authors one PRD in a fresh product-manager that sees the source VERBATIM. Verification is a separate command: /audit-prd.',
  phases: [
    { title: 'Corpus', detail: 'cheap index of related design docs — provenance, not fact' },
    { title: 'Conflicts', detail: 'does the source contradict a documented decision? asked BEFORE authoring' },
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
// another project's decisions as if they were its own, and the author's "cite a source file
// you opened" rule resolves against the wrong tree -- which manufactures both false
// already-exists claims and false does-not-exist ones.
const PROJECT_ROOT = PROJECT ? (PROJECT.replace(/\/+$/, '') + '/') : ''
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

// Handed to every stage that resolves a path. Without it, an agent designing for repo B
// while running in repo A greps repo A -- the measured failure behind --project.
const SCOPE = PROJECT
  ? `
PATH SCOPING. The project under design is ${PROJECT}. Every source, test, config and
.claude/rules/* path resolves against THAT project, not against the repository this session
runs in. Read and grep code there. A claim resolved against the wrong repository is worthless
in both directions -- it invents things that do not exist and misses things that do.`
  : ''

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

Look in ${PROJECT_ROOT}docs/PRD/ and ${PROJECT_ROOT}docs/TRD/ (and any sibling location that
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

THE CORPUS STATES INTENT. THE CODE STATES FACT. THE OWNER, IN THIS SESSION, STATES WHAT IS
TRUE NOW. These documents tell you what was decided and why. They do NOT tell you what is
built -- most stopped being maintained when implementation started. Inherit decisions,
conventions and REJECTIONS from them so you do not re-litigate settled ground or re-propose
a rejected alternative. Do NOT assert that anything described in the index exists; if
that matters, say so in ## Could Not Verify and let /audit-prd check it against the code.

PRECEDENCE. "Settled ground" means settled by the OWNER, not settled in a document. Where
the SESSION BRIEF above -- the owner speaking now -- conflicts with a corpus decision, THE
OWNER GOVERNS, however well documented, well argued or recently written that decision is. A
documented decision may be stale, may never have been implemented, or may have answered a
narrower question than the one you are being asked. You cannot tell which from an index.

This applies to the OWNER, not to every input. A VERBATIM SOURCE DOCUMENT is just another
document: a ticket written in March does not outrank a TRD revised last week. Weigh those
two normally -- later wins, narrower scope loses, unimplemented loses -- which is what
create-prd.md already says ("the refinement usually overrides the ticket. Treat neither as
automatically winning"). And a brief line with no locator is a finding, not an authority:
it is a claim about the transcript that nobody has checked.

Do NOT resolve an owner-vs-corpus conflict silently in the corpus's favour. Record it in
the supersedes field of your return, and state it in the PRD. A measured case: a PRD
inherited a three-month-old TRD's decision that read as settled architecture. That TRD had
no implementation state on disk and its own scope section limited it to a narrower class of
object than the PRD was about -- so it was a true statement about a smaller question. The
owner had settled the broader question an hour earlier in session. The author cited the
decision correctly and was wrong anyway, because nothing told it which input wins.

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

// --------------------------------------------------------------------------- 0.75 CONFLICTS
//
// Asked as its own question, BEFORE authoring, with a mandate that is the INVERSE of the
// author's. The author is trying to write a coherent PRD and will resolve a corpus-vs-source
// conflict as a side effect of that -- quietly, in whichever direction reads better. This
// stage does nothing but look for the conflict, so noticing it is the whole job rather than
// a distraction from one.
//
// The measured failure: a PRD inherited a three-month-old TRD's decision that contradicted
// what the owner had settled in session an hour earlier. The author cited the decision
// correctly and was wrong anyway. Nobody had asked "do these disagree?" as a question.
//
// Two independent passes over the same material by the same model correlate almost
// completely and prove nothing. What makes this pass worth its cost is the DIFFERENT
// MANDATE, not the second look.
const conflicts = corpus.documents.length && SOURCE_PACKAGE
  ? await (async () => {
      phase('Conflicts')
      const found = await agent(
        `Compare a design source against an index of existing design documents and report
ONLY where they DISAGREE. You are not writing anything and not resolving anything.

${SOURCE_PACKAGE}

INDEXED DECISIONS FROM EXISTING DOCUMENTS:
${JSON.stringify({ documents: corpus.documents }, null, 1)}
${SCOPE}

For each disagreement: which document, what it decided, what the source says instead.

A disagreement is a DIFFERENT ANSWER TO THE SAME QUESTION. These are not disagreements:
  - the source is silent on something a document decided (silence is not contradiction)
  - a document is more specific about something the source states generally
  - they use different words for the same choice

Judge the SCOPE of the documented decision honestly. A decision that answers a narrower
question than the source is asking is not in conflict -- it is a true statement about a
smaller question, and saying so is more useful than calling it a contradiction. The
measured case: a TRD scoped explicitly to "Disney-FASTPASS-mapped rows" was cited against a
PRD about cross-type scheduling. Both were right; they were not answering the same question.

Where you can cheaply check, say whether the documented decision was ever IMPLEMENTED --
.trd-state/<slug>/implement.json existing at all is the signal. A decision frozen at
"approved" three months ago with no implementation state is weaker evidence than its
confident prose suggests, and the index cannot show you that.

Return an empty array if they agree. Empty is the common and correct answer.`,
        {
          label: 'conflict-scan',
          phase: 'Conflicts',
          agentType: 'product-manager',
          schema: {
            type: 'object', additionalProperties: false, required: ['conflicts'],
            properties: {
              conflicts: {
                type: 'array',
                items: {
                  type: 'object', additionalProperties: false,
                  required: ['document', 'decision', 'source_says', 'same_question'],
                  properties: {
                    document: { type: 'string' },
                    decision: { type: 'string' },
                    source_says: { type: 'string' },
                    same_question: {
                      type: 'boolean',
                      description: 'true = a genuine contradiction; false = the document answers a narrower question',
                    },
                    implemented: { type: 'string', description: 'yes | no | unknown' },
                  },
                },
              },
            },
          },
        }
      )
      const list = (found && found.conflicts) || []
      log(`conflict-scan: ${list.length} disagreement(s) with the corpus`)
      for (const c of list) {
        log(`  ${c.same_question ? 'CONTRADICTS' : 'narrower'} ${c.document}: ${c.decision} vs ${c.source_says}`)
      }
      return list
    })()
  : []

/* Only SAME-QUESTION conflicts can be superseded. `CONFLICT_BLOCK` tells the author that
 * `same_question: false` entries — a corpus document answering a NARROWER or adjacent
 * question — "are not overridden and do not belong in supersedes". Counting every conflict
 * alike made the readout's warning fire on runs whose scan returned only those, accusing a
 * PRD of silently siding with a document when it had followed the instruction exactly. */
const sameQuestion = conflicts.filter((c) => c && c.same_question === true);

const CONFLICT_BLOCK = conflicts.length
  ? `
CONFLICTS ALREADY FOUND between the source and the corpus. A separate pass looked for these
so you would not have to notice them while writing:
${JSON.stringify(conflicts, null, 1)}

Entries with same_question:true are genuine contradictions and THE SOURCE GOVERNS -- carry
each one into your supersedes array. Entries with same_question:false are documents
answering a narrower question; they are not overridden and do not belong in supersedes.
This list is a starting point, not a ceiling: report anything further you find.`
  : ''

phase('Author')

const authored = await agent(
  `You are the product-manager authoring a Product Requirements Document.

Read .claude/contracts/prd-authoring.md first. It is the complete binding instruction set
for this job. Do NOT read .claude/commands/create-prd.md -- it carries orchestration detail
you do not need and would re-cache on every turn.

${SOURCE_PACKAGE}
${CORPUS_BLOCK}
${CONFLICT_BLOCK}
${SCOPE}

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
        // Corpus decisions this PRD overrides because the source says otherwise. OPTIONAL and
        // normally empty -- most PRDs contradict nothing. It exists because the failure is
        // SILENT: a PRD that quietly sides with a stale document reads as well-grounded, cites
        // a real decision ID, and looks more rigorous than one that does not. Without a field
        // the author has nowhere to report a conflict it noticed -- additionalProperties:false
        // would reject it -- so the only available record was PRD prose, where no downstream
        // stage can find it.
        supersedes: {
          type: 'array',
          description:
            'corpus decisions the source overrides. Each: what the document decided, what the source says instead, and why the source governs (stale, unimplemented, narrower scope, simply later).',
          items: {
            type: 'object', additionalProperties: false,
            required: ['document', 'decision', 'source_says', 'why'],
            properties: {
              document: { type: 'string' }, decision: { type: 'string' },
              source_says: { type: 'string' }, why: { type: 'string' },
            },
          },
        },
      },
    },
  }
)

required(authored, 'Author')
if (authored.prd_path && authored.prd_path !== PRD) {
  log(`WARNING: author wrote ${authored.prd_path}, not ${PRD} — downstream stages target ${PRD}`)
}
log(`authored ${authored.requirements.length} requirements`)
for (const sup of authored.supersedes || []) {
  log(`SUPERSEDES: ${sup.document} — ${sup.decision} → ${sup.source_says} (${sup.why})`)
}

// ---------------------------------------------------------------------------
// create stops here. The verification wave lives in /audit-prd, which runs against ANY PRD
// -- this one, or one written months ago by hand. Splitting it that way means create is
// 2 agents instead of 5, and audit can be run more than once, later, by someone else.

// The handoff carries the BASELINE and the PROJECT. Without --source, audit-prd's
// source-fidelity verifier has no baseline and reports that as its single finding: the
// check this readout promises is exactly the one that would not run. Without --project, its
// verifiers resolve every path against the wrong repository.
/* DID THE PRD DRIFT FROM WHAT WAS ASKED FOR?
 *
 * This is the half that was missing, and it is the half that matters. `/create-trd` judges
 * size AFTER a TRD exists, which is downstream of where scope actually expands. Measured: an
 * owner's "moderate change touching a lot of callers" arrived at implementation as 17 tasks
 * across two deploy cycles and a 6.42-hour run — and the growth had already happened in an
 * 85KB PRD with 37 requirements, before any TRD was written.
 *
 * It runs LAST and alone, because it needs the authored PRD and nothing can overlap it. That
 * costs this command time it did not spend before. The trade is deliberate: roughly a minute
 * to catch a scope expansion that otherwise surfaces six hours later, in code.
 *
 * It compares against SOURCE_PACKAGE -- the owner's words, verbatim, which this workflow
 * already holds. The question is never "is this big"; a large ask honestly translated is
 * fine. The question is whether the document grew things the ask did not contain. */
// No `SOURCE_PACKAGE ?` guard: this workflow already refuses to start unless one of
// args.source / args.brief is present, so there is always a request to compare against.
// A conditional here would read as a real branch while being unreachable.
const drift = await agent(
      `Compare an authored PRD against the request it came from, and report DRIFT only.

PRD: ${PRD}
${SCOPE}
THE REQUEST, VERBATIM:
${SOURCE_PACKAGE}

Read both. Then answer one question: does the PRD ask for things the request did not?

Report as drift:
  - a capability the request never mentions, however sensible it looks
  - infrastructure the request did not ask for -- a migration, a rename sweep, CI enforcement,
    a classification document -- added to make the real ask safer or tidier
  - a requirement whose only source is the PRD's own reasoning

NOT drift, and do not report it:
  - detail the request implies but did not spell out; that is the job
  - a constraint the codebase imposes
  - anything the request states in other words

THEN SAY WHETHER THE REQUESTER WOULD RECOGNISE THIS. If you read them the PRD's summary in
their own vocabulary, is it the thing they asked for, or that thing plus a programme of work?

Zero drift is the common and correct answer. A PRD that faithfully expands a large request is
not drifting. Do not manufacture findings to look thorough -- a false drift report sends
someone to delete requirements that were legitimately derived.`,
      {
        label: 'drift',
        phase: 'Author',
        agentType: 'product-manager',
        effort: 'low',
        schema: {
          type: 'object', additionalProperties: false,
          required: ['recognisable', 'drift'],
          properties: {
            recognisable: { type: 'boolean', description: 'would the requester recognise this as what they asked for' },
            drift: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false, required: ['requirement', 'why'],
                properties: {
                  requirement: { type: 'string', description: 'the added thing, in plain words' },
                  why: { type: 'string', description: 'what in the request it does not trace to' },
                },
              },
            },
          },
        },
  }
)

const driftLines = (() => {
  if (!drift) return ''
  const items = drift.drift || []
  if (drift.recognisable && !items.length) return '\n  SCOPE — matches the request\n'
  let out = `\n  SCOPE GREW BEYOND THE REQUEST${drift.recognisable ? '' : ' — the requester would not recognise this'}\n`
  for (const d of items) out += `    ${d.requirement} — ${d.why}\n`
  out += `    Cut these, or say why they are needed, before /create-trd turns them into tasks.\n`
  return out
})()

const NEXT = `/audit-prd ${PRD}` +
  (BASELINE ? ` --source ${BASELINE}` : '') +
  (PROJECT ? ` --project ${PROJECT}` : '')

return {
  prd: PRD,
  feature: FEATURE,
  source: BASELINE,
  requirements: authored.requirements.length,
  corpus_documents: corpus.documents.length,
  // Finding 1 of the review on this very change: the field was log()ed and nothing more, so
  // it reached neither the readout nor /audit-prd -- reproducing the exact "no downstream
  // stage can find it" failure the change was written to fix.
  supersedes: authored.supersedes || [],
  // Reported separately from `supersedes`: the scan's view (what disagrees) and the author's
  // view (what it overrode) should MATCH, and a gap between them is the interesting signal --
  // a contradiction found before authoring that the PRD then did not carry.
  conflicts_found: conflicts.length,
  scope_recognisable: drift ? drift.recognisable : null,
  scope_drift: drift ? (drift.drift || []).map((d) => d.requirement) : [],
  conflicts_same_question: sameQuestion.length,
  next: NEXT,
  readout:
    `PRD: ${PRD}    SOURCE: ${BASELINE}\n` +
    `  ${authored.requirements.length} requirements` +
    `${corpus.documents.length ? `, inheriting from ${corpus.documents.length} corpus documents` : ''}\n` +
    driftLines +
    `${sameQuestion.length && !(authored.supersedes || []).length
        ? `\n  WARNING: the conflict scan found ${sameQuestion.length} disagreement(s) on the SAME\n` +
          `  question as the corpus, but the PRD recorded no supersession. Check it did not\n` +
          `  silently side with a document.\n`
        : ''}` +
    `${(authored.supersedes || []).length
        ? `\n  OVERRIDES ${authored.supersedes.length} documented decision(s):\n` +
          authored.supersedes.map((x) => `    ${x.document}: ${x.decision} -> ${x.source_says} (${x.why})`).join('\n') + '\n'
        : ''}` +
    `\n  NOT YET VERIFIED. Run  ${NEXT}\n` +
    `  to check source fidelity in both directions, whether any of it is already built,\n` +
    `  and conformance.\n`,
}
