export const meta = {
  name: 'create-trd',
  description: 'Author a TRD from a PRD and ground it in the codebase that already exists',
  whenToUse: 'Invoked by /create-trd. Indexes the design corpus for provenance, authors one TRD in a fresh technical-architect, then grounds every task against real code. Verification is a separate command: /audit-trd.',
  phases: [
    { title: 'Corpus', detail: 'cheap index of related design docs — provenance, not fact' },
    { title: 'Author', detail: 'one technical-architect, fresh context, types every line' },
    { title: 'Ground', detail: 'reconcile the plan against the codebase; emit Task Grounding' },
  ],
}

// ---------------------------------------------------------------------------
// args: { prd, trd, feature, stack, constitution, transcript }
//   prd          path to the source PRD (or the plan item / transcript when there is none)
//   trd          path the TRD should be written to
//   feature      short slug, used only for labels
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
const TRD = a.trd
const FEATURE = a.feature || 'feature'
// Target project root. Case 3 measured the cost of not having this: 6 of 9 findings were
// wrong because a verifier resolved .claude/rules against the AUTHORING repo instead of the
// project being designed for, and five were reported at HIGH confidence. A TRD authored in
// repo A about project B is a legitimate and common case; nothing told the verifiers which
// repo a relative path meant.
const PROJECT = a.project || ''
// Corpus and code both live in the PROJECT under design, which is NOT always the repo this
// workflow runs from. Left unscoped, the corpus stage indexes the AUTHORING repo's design
// docs and hands the author another project's decisions as if they were its own -- and the
// Ground stage, whose entire job is reading real code, greps the wrong tree.
const PROJECT_ROOT = PROJECT ? (PROJECT.replace(/\/+$/, '') + '/') : ''
// Every stage that resolves a path gets this. Ground is the one that matters most: a
// grounding block written against the authoring repo's code is confidently, uniformly wrong.
const SCOPE = PROJECT
  ? `
PATH SCOPING. The project under design is ${PROJECT}. Every source, test, config and
.claude/rules/* path resolves against THAT project, not against the repository this session
runs in. Read and grep code there. A path resolved against the wrong repository invents
things that do not exist and misses things that do.`
  : ''

if (!TRD) throw new Error('create-trd workflow: args.trd (output path) is required')

// No placeholder default for the source. A prose stand-in would be spliced into the
// omission-audit's enumeration target and into the user-facing readout's SOURCE: line,
// degrading the run into a verification pass with no baseline -- silently.
if (!a.prd && !a.transcript) {
  throw new Error(
    'create-trd workflow: a source is required — pass args.prd (a PRD path) or ' +
    'args.transcript (a session transcript path). Verification has no baseline without one.'
  )
}
const PRD = a.prd || a.transcript
// Only an ADDITION when there is something to add to. With no PRD the transcript IS the
// baseline (PRD, above), and listing it twice told the author it had two sources and made
// the readout claim a transcript supplemented itself.
const EXTRA = a.prd && a.transcript ? `\nSession-derived additions: ${a.transcript}` : ''

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

const SOURCES = `
SOURCE OF TRUTH for every objective in this TRD:
  - PRD: ${PRD}
  - ${PROJECT_ROOT}.claude/rules/stack.md
  - ${PROJECT_ROOT}.claude/rules/constitution.md
  - the codebase itself${PROJECT ? ` (in ${PROJECT})` : ''}${EXTRA}

If the PRD carries a supersession marker, resolve what supersedes it and treat that as the
in-scope source. A TRD verified against a retired PRD certifies a retired design.
`

// LEVER 1. The author reads the compact authoring contract, NOT the whole command file.
// Measured: create-trd.md is ~10.5k tokens and the author re-cached it on all ~17 of its
// turns (~180k), including the verification-wave spec, the readout format and the fallback
// path -- none of which an author uses. The contract is ~5.9k and is only what it needs.
// Still one copy in markdown, just split by audience.
const MANDATE = `
Read .claude/contracts/trd-authoring.md first. It is the complete binding instruction set
for this job -- the typing rule and the document structure. Do NOT read
.claude/commands/create-trd.md; it carries orchestration detail you do not need and would
pay for on every turn. Do not restate the contract back to me; apply it.
`

// --------------------------------------------------------------------------- 0.5 CORPUS
// Design documents are a valuable source and an UNRELIABLE one: most PRDs and TRDs stop
// being maintained the moment implementation starts. So the corpus is used for PROVENANCE
// -- what was decided, why, and what conventions exist -- and never as a statement of
// current fact. The Ground stage checks the CODE (see CORPUS_RULE below, which it carries;
// /audit-trd's verifiers carry their own copy).
//
// Cost control: this is one cheap agent producing a compact INDEX, passed to the author via
// a script variable. It does NOT read documents end to end, and the author never opens the
// corpus itself. Same shape as the records-as-index change, for the same reason -- a full
// corpus read would give back the planning savings measured at -21%.
phase('Corpus')

const corpus = await agent(
  `Index the existing design corpus so the TRD author can inherit decisions instead of
re-deciding them. You are producing a MAP, not a summary.

Look in ${PROJECT_ROOT}docs/PRD/ and ${PROJECT_ROOT}docs/TRD/ (and any sibling location that
project actually uses -- check before assuming; do NOT assume a layout). For each document that plausibly relates to "${FEATURE}" by subject:

  - its path and title
  - the decisions it records: grep its Key Technical Decisions table, any "Decisions" or
    "Rejected" section, and any supersession banner. Capture the CHOICE and the ID, not the
    rationale prose.
  - whether anything marks it superseded, and by what

Then, separately, note conventions visible ACROSS documents: ID prefixes in use, recurring
architectural choices, testing conventions.

READ DISCIPLINE -- this is the whole point of doing it as one cheap pass. Grep for headings
and table rows. Do NOT read documents end to end. If a repo has 30 TRDs you should be
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

// The rule every agent that asserts a fact about the built system carries. In this workflow
// that is the Ground stage -- the only one that reads code and writes claims about it.
const CORPUS_RULE = `
THE CORPUS STATES INTENT. THE CODE STATES FACT.

Existing PRDs and TRDs are provenance -- they tell you what was decided and why. They are
NOT a description of the current system: most stop being maintained the moment
implementation begins, so a design document and the code it describes routinely disagree,
and the code is what is true.

  - You may cite a design document as the SOURCE of a decision or a convention.
  - You may NOT cite one as evidence that something is built, works, or behaves a given way.
    For that, read the code.
  - If a document and the code disagree, the code wins and the disagreement is a finding
    worth reporting -- it means a design doc has gone stale.

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

// --------------------------------------------------------------------------- 1. AUTHOR

phase('Author')

const authored = await agent(
  `You are the technical-architect authoring a Technical Requirements Document.

${MANDATE}
${SOURCES}
${SCOPE}

EXISTING DESIGN CORPUS (provenance -- inherit from it, do not re-decide):
${JSON.stringify(corpus, null, 1)}

Use this to reuse decisions and follow conventions already established in this repository.
Where you deliberately depart from a prior decision, say so and say why -- an unexplained
divergence from a sibling TRD is how a schema ends up flapping across three documents.
Treat these as statements of INTENT, not of what is currently built: check the code before
asserting anything exists.

Write the TRD to ${TRD} using the Write tool. Do not return its content as text.

Binding constraints, in priority order:
  1. Every OBJECTIVE (anything asserting what must be true and HOW WELL) traces to the PRD,
     to stack.md/constitution.md, to a measurement you cite, or to an explicit user
     instruction. You may not invent one. Label genuinely domain-derived objectives as
     'domain-derived' with the reasoning.
  2. Read the coverage floors from ${PROJECT_ROOT}.claude/rules/constitution.md and use those numbers.
     Any objective exceeding a constitution floor must state why, inline.
  3. Every DECISION is free to be invented -- that is your job -- but must name the
     objective it serves in the Key Technical Decisions table's 'Serves Objective' column,
     and record its alternatives with a revisit condition.
  4. Every TASK populates its 'Serves' column with the objective or decision ID it serves.
  5. Delivery machinery (flags, rollout phases, migration paths, guard infra, eval gates)
     is a decision and owes a named objective. If the honest answer is "this is just how
     we'd normally ship", leave it out.
  6. Sections are containers, not quotas. An empty section is a correct outcome. No diagram
     quota. Never invent a number to make a table look complete.
  7. DO NOT write the "Task Grounding" section. A later stage owns it, and it reads the
     codebase properly to do so. Grounding decisions you have not finished making is
     premature, and writing it here means the work is done twice with two sources of truth.
     Leave it out entirely -- do not stub it, do not add a placeholder heading.

Return ONLY a JSON object describing what you wrote.`,
  {
    label: 'author:technical-architect',
    phase: 'Author',
    agentType: 'technical-architect',
    // Overrides the agent's own `effort: xhigh` frontmatter, deliberately, and ONLY here.
    //
    // A direct Agent call to technical-architect has no safety net, so xhigh is right there.
    // In THIS pipeline the author is followed by six verifiers and a reconcile stage. The
    // first live run (23 min, 1.02M tokens) spent 634s of 1357s wall-clock -- 47% -- in this
    // one stage, and every checkable defect it produced was caught downstream: six citation
    // errors (five stale line numbers), four omissions. Those are exactly the classes a
    // lower-effort author produces more of, and exactly what the wave is built to find.
    //
    // What the wave CANNOT see is architecture and decomposition quality -- no verifier
    // mandate permits "this decomposition is wrong". That is the real risk of this change,
    // and the reason it is a measured hypothesis rather than a settled call: re-run the same
    // PRD and compare the architecture sections, not the finding counts.
    effort: 'high',
    schema: {
      type: 'object',
      additionalProperties: false,
      // LEVER 2. Return the RECORDS, not just the IDs. Workflow results live in script
      // variables, so these can be interpolated into verifier prompts -- which means three
      // of the four verifiers never open the TRD at all. Measured: the TRD is ~25.8k tokens
      // and was being re-cached by every downstream agent on every turn.
      required: ['trd_path', 'objectives', 'decisions', 'tasks'],
      properties: {
        trd_path: { type: 'string' },
        objectives: {
          type: 'array',
          description: 'EVERY line asserting what must be true and how well -- acceptance criteria, NFRs, thresholds, quality gates, coverage targets. Typed by nature, not by section.',
          items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'statement', 'source'],
            properties: {
              id: { type: 'string' },
              statement: { type: 'string' },
              source: { type: 'string', description: 'PRD line, stack.md, constitution.md, a measurement, an explicit user instruction, or "domain-derived: <reasoning>"' },
              severity_note: { type: 'string', description: 'why any figure exceeding a constitution floor is higher; omit if at or below' },
              section: { type: 'string' },
            },
          },
        },
        decisions: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'choice', 'serves'],
            properties: {
              id: { type: 'string' }, choice: { type: 'string' },
              serves: { type: 'string', description: 'the objective ID this exists to satisfy' },
              alternatives: { type: 'string' }, revisit_when: { type: 'string' },
            },
          },
        },
        tasks: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'description', 'serves'],
            properties: {
              id: { type: 'string' }, description: { type: 'string' },
              serves: { type: 'string', description: 'objective or decision ID' },
              depends_on: { type: 'array', items: { type: 'string' } },
              acceptance: { type: 'string' },
            },
          },
        },
        empty_sections: { type: 'array', items: { type: 'string' } },
      },
    },
  }
)

required(authored, 'Author')
if (authored.trd_path && authored.trd_path !== TRD) {
  log(`WARNING: author wrote ${authored.trd_path}, not ${TRD} — downstream stages target ${TRD}`)
}
log(`authored ${authored.tasks.length} tasks, ${authored.objectives.length} objectives, ${authored.decisions.length} decisions`)

// Shared finding shape. Used by the grounding stage (which now also reports design
// findings) and by every verifier, so the reconcile stage sees one uniform record.
// id/line are NOT required: an omission finding's whole content is that no TRD id and no
// TRD line exist, and requiring them would force the highest-value check to fabricate one.
const FINDING_ITEMS = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['check', 'why', 'confidence'],
    properties: {
      check: { type: 'string', enum: ['provenance','severity','omission','buildability','consistency','derivation','grounding','citation','conformance'] },
      why: { type: 'string', description: 'the source, contradiction, or mechanism failure' },
      confidence: { type: 'string', enum: ['high','medium','low'] },
      id: { type: 'string', description: "the TRD's own ID; omit for omission findings" },
      line: { type: 'string', description: 'the text as written; omit for omission findings' },
      source_ref: { type: 'string', description: 'for omission findings: where in the SOURCE it is stated' },
      action: { type: 'string', enum: ['delete','lower-to-floor','add-back','unbuildable','pick-one','confirm-wanted','check-reasoning','fix-citation'] },
    },
  },
}

// --------------------------------------------------------------------------- 2. GROUND
// Sequential and alone: this stage is GENERATIVE (it writes task context), and the rule
// that fan-out is for verification only applies to it. Four grounding agents in parallel
// would produce four opinions about which code to reuse. It runs after decisions exist,
// because grounding a decision that has not been made is meaningless.

phase('Ground')

const grounded = await agent(
  `You are grounding an already-authored TRD against the code that actually exists.

TRD: ${TRD}
Tasks needing grounding: ${authored.tasks.map((t) => t.id).join(', ')}
${SCOPE}
READ THE CODE${PROJECT ? ` IN ${PROJECT}` : ''}. Grep for the functions, modules and patterns
this plan touches. This stage is worthless if written from assumption.
${CORPUS_RULE}

Reconcile on four axes and emit a "## Task Grounding" section into the TRD (Write/Edit), one
block per task ID, exactly as specified in .claude/contracts/trd-authoring.md, "Section 10:
Task Grounding" (read that section only -- do NOT read .claude/commands/create-trd.md, which
carries orchestration detail you do not need and would re-cache on every turn):

  Touches   (mandatory) files this task will modify
  Reuse     existing code it must NOT reimplement
  Replaces  what this makes UNREACHABLE -- name it and instruct its deletion
  Follow    an existing pattern in this repo it should match
  Careful   contracts, callers, constraints

MARK HOW YOU KNOW. Every factual claim in a grounding block carries one of:
  [read]     -- you opened the file and saw it
  [ran]      -- you executed it and observed the result
  [inferred] -- you reasoned it from something you read, but did not confirm directly

ANCHOR ON SOMETHING GREPPABLE, NOT ONLY A LINE NUMBER. Measured: grounding cited
cli.py:2437 and :2477 where the truth was :2444 and :2473, and a later audit had to correct
seven such anchors. A reader following a drifted line number lands in the middle of a
DIFFERENT branch and reads the wrong code with no signal that anything is off -- worse than
having no anchor at all. So cite the symbol, signature or literal string you actually
matched (the def line, the exact quoted token), and give the line number as a convenience
beside it. Symbols survive edits; line numbers rot immediately.

An implementer told us why this matters: "Precision that isn't uniformly earned is worse
than vagueness, because it stops the implementer checking." A block that cites line numbers
uniformly looks uniformly verified. In one run a test file was quoted as a passing
regression guard when it had not run in months, and the one claim asserting something was
SAFE was the one that was wrong. Unmarked claims will be treated as [read] and trusted.

'Replaces' is the highest-value line and the one nobody writes. For every task ask: what
does this make unreachable? A superseded thing that still exists still looks live.

An empty grounding block is a legitimate result for genuinely greenfield work -- say so
rather than padding it.

---

SECOND JOB, same context: you have now read the code, so you are the ONLY agent positioned
to judge these. Report them as findings; do not fix them yourself.

  BUILDABILITY -- can each decision be built AS SPECIFIED, given how the mechanism it
  governs actually works? Check the mechanism; do not assume it works the way the TRD says.
  This is the cheapest check in the wave and historically the one never performed.

  CONSISTENCY -- does any decision or task contradict a sibling, or a document that
  supersedes this one?

  GROUNDING COMPLETENESS -- does every task carry a block, and does anything the plan
  replaces go unnamed and orphaned?

FINDABLE ONLY: every finding names a file, a line, a contradiction or a mechanism. No
opinions, no proposed new requirements, nothing struck on judgment. If a finding asserts
severity, source that assertion or drop it. Zero findings is legitimate.

BATCH YOUR READS. Prefer one grep over five; prefer reading a file once over returning to
it. Each tool call re-caches your whole context, so turn count is a real cost.`,
  {
    label: 'ground:brownfield',
    phase: 'Ground',
    // High: this is the only GENERATIVE stage after authoring, and its output is piped
    // straight into implementer prompts. Weak grounding is how reimplementation happens --
    // §9.1's second-largest category at ~45 hits.
    effort: 'high',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['grounded_task_ids', 'replaces_found', 'findings'],
      properties: {
        grounded_task_ids: { type: 'array', items: { type: 'string' } },
        replaces_found: { type: 'array', items: { type: 'string' } },
        greenfield_task_ids: { type: 'array', items: { type: 'string' } },
        findings: FINDING_ITEMS,
      },
    },
  }
)

required(grounded, 'Ground')
log(`grounded ${grounded.grounded_task_ids.length} tasks; ${grounded.replaces_found.length} named for deletion; ${(grounded.findings || []).length} design findings`)

// ---------------------------------------------------------------------------
// create stops here. The verification wave lives in /audit-trd, which runs against ANY
// TRD -- this one, or one written months ago by hand. Splitting it that way means create
// is 3 agents instead of 9, and audit can be run more than once, later, by someone else.
//
// Grounding's findings are REPORTED, not applied: the stage that found them is generative
// (it wrote the grounding blocks), and a generative agent applying its own findings blurs
// the line this pipeline depends on. /audit-trd is what applies findings.

const gf = grounded.findings || []
const gfLines = gf.length
  ? '\n  NOTED BY GROUNDING — not applied. Run /audit-trd to verify and apply:\n' +
    gf.map((f) => `    [${f.check}] ${f.id ? f.id + ': ' : ''}${f.why}`).join('\n') + '\n'
  : ''

// The handoff carries the SOURCE and the PROJECT. Without --source, audit-trd's
// omission-audit reports "no source supplied" as its single finding and stops, and the
// objective-audit falls back to the artifact's own claims -- so the two checks this readout
// promises are exactly the two that would not run. Without --project, its verifiers resolve
// every path against the wrong repository; that has already cost 6 of 9 findings once.
const NEXT = `/audit-trd ${TRD} --source ${PRD}` + (PROJECT ? ` --project ${PROJECT}` : '')

return {
  trd: TRD,
  feature: FEATURE,
  tasks: authored.tasks.length,
  objectives: (authored.objectives || []).length,
  grounded_tasks: grounded.grounded_task_ids.length,
  replaces_found: grounded.replaces_found.length,
  grounding_findings: gf.length,
  next: NEXT,
  readout:
    `TRD: ${TRD}    SOURCE: ${PRD}${EXTRA ? ' + session transcript' : ''}\n` +
    `  ${authored.tasks.length} tasks, ${(authored.objectives || []).length} objectives\n` +
    `  grounded ${grounded.grounded_task_ids.length} tasks; ` +
    `${grounded.replaces_found.length} things named for deletion\n` +
    gfLines +
    `\n  NOT YET VERIFIED. Run  ${NEXT}\n` +
    `  to check provenance, derivation, omission and citations, and to apply what survives.\n`,
}
