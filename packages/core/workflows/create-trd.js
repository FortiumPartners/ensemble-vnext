export const meta = {
  name: 'create-trd',
  description: 'Author a TRD from a PRD, ground it in the codebase, verify it, and emit the readout',
  whenToUse: 'Invoked by the /create-trd command. Authors one TRD, grounds it against the existing code, runs the verification wave, and returns a reconciled readout.',
  phases: [
    { title: 'Author', detail: 'one technical-architect, fresh context, types every line' },
    { title: 'Ground', detail: 'reconcile the plan against the codebase; emit Task Grounding' },
    { title: 'Verify', detail: 'six read-only verifiers, findable-only mandates' },
    { title: 'Reconcile', detail: 'apply findings, draft the action-register readout' },
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
const EXTRA = a.transcript ? `\nSession-derived additions: ${a.transcript}` : ''

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
  - .claude/rules/stack.md
  - .claude/rules/constitution.md
  - the codebase itself${EXTRA}

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

// --------------------------------------------------------------------------- 1. AUTHOR

phase('Author')

const authored = await agent(
  `You are the technical-architect authoring a Technical Requirements Document.

${MANDATE}
${SOURCES}

Write the TRD to ${TRD} using the Write tool. Do not return its content as text.

Binding constraints, in priority order:
  1. Every OBJECTIVE (anything asserting what must be true and HOW WELL) traces to the PRD,
     to stack.md/constitution.md, to a measurement you cite, or to an explicit user
     instruction. You may not invent one. Label genuinely domain-derived objectives as
     'domain-derived' with the reasoning.
  2. Read the coverage floors from .claude/rules/constitution.md and use those numbers.
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

READ THE CODE. Grep for the functions, modules and patterns this plan touches. This stage is
worthless if written from assumption.

Reconcile on four axes and emit a "## Task Grounding" section into the TRD (Write/Edit),
one block per task ID, exactly as specified in .claude/commands/create-trd.md:

  Touches   (mandatory) files this task will modify
  Reuse     existing code it must NOT reimplement
  Replaces  what this makes UNREACHABLE -- name it and instruct its deletion
  Follow    an existing pattern in this repo it should match
  Careful   contracts, callers, constraints

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

// --------------------------------------------------------------------------- 3. VERIFY
// Findings live in script variables. They never enter the orchestrator's context -- which
// is why the command's findings-to-disk contract is unnecessary here.

phase('Verify')

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: { findings: FINDING_ITEMS },
}

// Every mandate below is FINDABLE-ONLY. A verifier may not invent an objective or strike one
// on judgment: that is the manufactured-objection failure, and in a TRD it deletes real
// acceptance criteria. The severity rule (§9.3) applies to the verifiers' own findings.
const FINDABLE_ONLY = `
FINDABLE ONLY. Every finding must name a source, a contradiction, or a specific mechanism
failure, and be checkable in seconds.

  - "A5 traces to nothing in ${PRD}" is checkable and permitted.
  - "I think A5 is unnecessary" is manufactured and FORBIDDEN.

Do NOT propose new requirements. Do NOT strike a requirement on judgment. If your finding
asserts severity ("this will regress checkout", "this needs a guard"), that assertion carries
the same sourcing burden as an objective -- source it or drop it. Reviewers inflating
severity is the observed failure here, far more than reviewers striking valid requirements.

Returning zero findings is a legitimate result. Do not manufacture findings to look thorough.
`


// Model tiers. Measured on the A/B run: 93.6% of billed cost is CACHE WRITE (context
// establishment), only 6.3% is output. So model choice acts almost entirely on the bulk of
// context each agent loads, and the verifiers are the many-agents half.
//
// Verifiers run findable-only checks -- grep an ID in a target file, compare a figure
// against a rule file, confirm a threshold names a source. Mechanical enough for Sonnet.
// The AUTHOR stays on its own frontmatter model (Opus): it is one agent, it produces the
// document everything else audits, and architecture/decomposition quality is the one
// dimension the findable-only wave structurally cannot backstop.
const VERIFIER_MODEL = 'sonnet'

// LEVER 2 (CORRECTED) + 4. Three verifiers, not six. `design-audit` moved into the
// grounding stage (it had already read the code); `citations` and `conformance` merged
// into one deterministic pass.
//
// The first version of lever 2 handed verifiers the author's structured RETURN and let
// them audit that. It cut cost 26% and broke verification: findings quoted a JSON
// `"serves"` field the markdown TRD does not contain, and cited an ID (`OBJ-CMD-STATUS`)
// with zero hits repo-wide -- fabricated inside the finding's own quoted line. Findings
// fell 16 -> 2 and both were wrong. That is the manufactured-findings failure this design
// exists to prevent, introduced in the name of saving tokens.
//
// The records are an INDEX, not the subject. They say what exists and where to look, which
// still avoids a linear read of a 25.8k-token document. But the audit runs against the
// artifact text, because that is what implementers read and what ships.
const OBJ = JSON.stringify(authored.objectives, null, 1)
const DEC = JSON.stringify(authored.decisions, null, 1)
const TSK = JSON.stringify(authored.tasks, null, 1)

const BATCH = `
BATCH YOUR READS. Every tool call re-caches your entire context, so turn count costs as
much as context size. Prefer one grep over five. Do not re-open a file you have read.`

const VERIFIERS = [
  {
    key: 'objective-audit',
    effort: 'high',
    prompt: `Audit these objectives for PROVENANCE and SEVERITY. They are given to you in
full below -- you do NOT need to open ${TRD}.

OBJECTIVES:
${OBJ}

${SOURCES}

  provenance: does each trace to a named source, a measurement, or an explicit instruction?
              An objective labelled "domain-derived" is permitted -- check the reasoning is
              stated and holds.
  severity:   is the STRICTNESS sourced, not just the requirement's existence? Read the
              coverage floors in .claude/rules/constitution.md; any figure above a floor
              must carry a severity_note saying why. "Zero tolerance" and "<=1 per run" are
              different requirements.

Verify claimed sources by checking the PRD and the rule files. A source that does not say
what the objective claims is a finding.

GROUNDING RULE -- NON-NEGOTIABLE. The records above are an INDEX telling you what exists and
roughly where. They are NOT the artifact. The artifact is ${TRD}, and it is Markdown.

  - Use the index to target your reads. Do not read the document linearly.
  - Before reporting ANY finding, grep ${TRD} for the exact text you are about to quote and
    confirm it is there. Quote the document's own words, not the index's field names.
  - If the index and the document disagree, THAT is the finding -- report the disagreement
    with both versions, and do not audit the index as though it were the document.
  - A finding citing an ID or a field that does not appear in ${TRD} is a fabrication. This
    has happened: a previous run reported a JSON "serves" field against a document made of
    Markdown tables, and quoted an ID with zero hits anywhere in the repository.`,
  },
  {
    key: 'derivation-audit',
    effort: 'high',
    prompt: `Check that every task and every piece of delivery machinery names the objective
it serves. Both lists are given in full -- you do NOT need to open ${TRD}.

TASKS:
${TSK}

DECISIONS:
${DEC}

  - Any task whose 'serves' is empty, or names an ID absent from the objectives/decisions?
  - Any DECISION that is really delivery machinery -- feature flags, rollout phases,
    migration paths, guard infrastructure, eval gates, config toggles -- serving no
    objective? That is the largest category of wasted implementation work in this
    framework: machinery added because it is how one normally ships, then built and
    deployed dark.

Check the PRD only to confirm a named objective exists -- grep it by ID, do not read it whole.

GROUNDING RULE -- NON-NEGOTIABLE. The records above are an INDEX telling you what exists and
roughly where. They are NOT the artifact. The artifact is ${TRD}, and it is Markdown.

  - Use the index to target your reads. Do not read the document linearly.
  - Before reporting ANY finding, grep ${TRD} for the exact text you are about to quote and
    confirm it is there. Quote the document's own words, not the index's field names.
  - If the index and the document disagree, THAT is the finding -- report the disagreement
    with both versions, and do not audit the index as though it were the document.
  - A finding citing an ID or a field that does not appear in ${TRD} is a fabrication. This
    has happened: a previous run reported a JSON "serves" field against a document made of
    Markdown tables, and quoted an ID with zero hits anywhere in the repository.`,
  },
  {
    key: 'omission-audit',
    effort: 'high',
    prompt: `Traverse SOURCE -> TRD. Read ${PRD} fully; its objectives are your checklist.

The TRD's objectives are given below in full, so you do NOT need to open ${TRD}:

${OBJ}

For every objective the PRD states, assert it either appears above or is explicitly listed
under Non-Goals in the TRD (grep the TRD for "Non-Goal" only -- do not read it through).

A per-line audit of the TRD cannot see a line that is not there. Dropping a requirement is
commoner than inventing one, and silent narrowing -- reproducing seven of eight metrics and
dropping the eighth without comment -- has no other check that can catch it.

GROUNDING RULE -- NON-NEGOTIABLE. The records above are an INDEX telling you what exists and
roughly where. They are NOT the artifact. The artifact is ${TRD}, and it is Markdown.

  - Use the index to target your reads. Do not read the document linearly.
  - Before reporting ANY finding, grep ${TRD} for the exact text you are about to quote and
    confirm it is there. Quote the document's own words, not the index's field names.
  - If the index and the document disagree, THAT is the finding -- report the disagreement
    with both versions, and do not audit the index as though it were the document.
  - A finding citing an ID or a field that does not appear in ${TRD} is a fabrication. This
    has happened: a previous run reported a JSON "serves" field against a document made of
    Markdown tables, and quoted an ID with zero hits anywhere in the repository.`,
  },
  {
    key: 'deterministic',
    effort: 'low',
    model: 'haiku',
    prompt: `Two mechanical checks over ${TRD}. Do NOT read it linearly -- both are lookups.

  CITATIONS: grep the TRD for citation-shaped strings (IDs, section refs, file:line), then
  grep each referenced ID in its live target file. Report every one that does not resolve,
  naming the ID and the file searched.

  CONFORMANCE: read .claude/rules/stack.md and .claude/rules/constitution.md -- both short
  -- then grep the TRD for what they constrain: technologies outside the declared stack,
  coverage figures below a stated floor, prohibited patterns, contradicted architectural
  invariants.

Both are pass/fail per item. A miss is a miss; do not interpret.`,
  },
]

const waves = await parallel(
  VERIFIERS.map((v) => () =>
    agent(`${v.prompt}\n${FINDABLE_ONLY}`, {
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

// --------------------------------------------------------------------------- 4. RECONCILE

phase('Reconcile')

if (findings.length === 0) {
  return {
    trd: TRD,
    findings: 0,
    verifiers_reporting: `${alive.length}/${VERIFIERS.length}`,
    readout:
      `TRD: ${TRD}\nSOURCE: ${PRD} + stack.md + constitution.md\n\n` +
      `  NO ACTION — every objective traces to a source, every decision names one, ` +
      `every task is grounded.\n` +
      (dead > 0 ? `  CAVEAT — ${dead} verifier(s) failed to report; coverage is incomplete.\n` : ''),
  }
}

const readout = await agent(
  `Apply these verifier findings to ${TRD}, then draft the readout.

FINDINGS (JSON):
${JSON.stringify(findings, null, 2)}

Apply each finding to the TRD using Edit. Where a finding is wrong -- the verifier missed a
source that does exist -- do not apply it, and say so in the readout with the source you found.

Then draft the readout. EVERY LINE NAMES THE ACTION, NOT THE CLASSIFICATION. Readouts in this
project have been rejected repeatedly for being unreadable: "I read your full response but come
away not knowing what ACTUAL action should I be taking next." A heading like "Unsourced
severities" tells the reader nothing to do.

Use exactly these headings, omitting any that are empty:

  DELETE — nothing in the source asks for these
  LOWER TO THE CONSTITUTION FLOOR, or say why it's higher
  ADD BACK — in the source, missing from this TRD
  CANNOT BE BUILT AS WRITTEN
  PICK ONE — these contradict
  CONFIRM THESE ARE WANTED — invented machinery, no objective named
  CHECK THE REASONING — derived from the domain, not from a document
  FIX THE CITATION — referenced ID does not resolve
  NO ACTION — sourced, listed for completeness

One screen. If there are 40 sourced objectives, print the COUNT as one line, not forty.
Ordered by how expensive the failure is to discover later.`,
  {
    label: 'reconcile',
    phase: 'Reconcile',
    // High: this stage EDITS the artifact and drafts the only output the user reads. It
    // must also correctly reject findings that are themselves wrong -- see the prompt.
    effort: 'high',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['readout', 'applied', 'rejected'],
      properties: {
        readout: { type: 'string', description: 'the one-screen readout, action register' },
        applied: { type: 'array', items: { type: 'string' } },
        rejected: {
          type: 'array',
          items: { type: 'string' },
          description: 'findings NOT applied, each with the source that refutes it',
        },
      },
    },
  }
)

required(readout, 'Reconcile')

return {
  trd: TRD,
  feature: FEATURE,
  findings: findings.length,
  applied: readout.applied.length,
  rejected: readout.rejected.length,
  verifiers_reporting: `${alive.length}/${VERIFIERS.length}`,
  incomplete_coverage: dead > 0,
  readout: readout.readout,
}
