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

// The typing rule and the content rules live in .claude/commands/create-trd.md and in
// the technical-architect agent definition. Agents are told to read them rather than having
// them restated here -- one copy, in markdown, reviewable in a diff.
const MANDATE = `
Read .claude/commands/create-trd.md first -- specifically the sections
"The typing rule: invent the HOW, never the HOW WELL" and "TRD Document Structure".
Those are binding. Do not restate them back to me; apply them.
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
      required: ['trd_path', 'task_ids', 'objective_ids', 'decision_ids'],
      properties: {
        trd_path: { type: 'string' },
        task_ids: { type: 'array', items: { type: 'string' } },
        objective_ids: { type: 'array', items: { type: 'string' } },
        decision_ids: { type: 'array', items: { type: 'string' } },
        empty_sections: {
          type: 'array',
          items: { type: 'string' },
          description: 'Sections deliberately left empty because nothing sourced belonged there',
        },
      },
    },
  }
)

required(authored, 'Author')
if (authored.trd_path && authored.trd_path !== TRD) {
  log(`WARNING: author wrote ${authored.trd_path}, not ${TRD} — downstream stages target ${TRD}`)
}
log(`authored ${authored.task_ids.length} tasks, ${authored.objective_ids.length} objectives, ${authored.decision_ids.length} decisions`)

// --------------------------------------------------------------------------- 2. GROUND
// Sequential and alone: this stage is GENERATIVE (it writes task context), and the rule
// that fan-out is for verification only applies to it. Four grounding agents in parallel
// would produce four opinions about which code to reuse. It runs after decisions exist,
// because grounding a decision that has not been made is meaningless.

phase('Ground')

const grounded = await agent(
  `You are grounding an already-authored TRD against the code that actually exists.

TRD: ${TRD}
Tasks needing grounding: ${authored.task_ids.join(', ')}

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
rather than padding it.`,
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
      required: ['grounded_task_ids', 'replaces_found'],
      properties: {
        grounded_task_ids: { type: 'array', items: { type: 'string' } },
        replaces_found: {
          type: 'array',
          items: { type: 'string' },
          description: 'Things the plan makes unreachable, named for deletion',
        },
        greenfield_task_ids: { type: 'array', items: { type: 'string' } },
      },
    },
  }
)

required(grounded, 'Ground')
log(`grounded ${grounded.grounded_task_ids.length} tasks; ${grounded.replaces_found.length} things named for deletion`)

// --------------------------------------------------------------------------- 3. VERIFY
// Findings live in script variables. They never enter the orchestrator's context -- which
// is why the command's findings-to-disk contract is unnecessary here.

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
        // id/line are NOT required: an omission finding's whole content is that no
        // TRD id and no TRD line exist. Requiring them would force the highest-value
        // verifier to fabricate an ID the reconcile stage would then try to Edit.
        required: ['check', 'why', 'confidence'],
        properties: {
          id: { type: 'string', description: "the TRD's own ID; omit for omission findings" },
          source_ref: { type: 'string', description: 'for omission findings: where in the SOURCE the missing objective is stated' },
          check: {
            type: 'string',
            enum: ['provenance', 'severity', 'omission', 'buildability', 'consistency', 'derivation', 'grounding', 'citation', 'conformance'],
          },
          line: { type: 'string', description: 'the text as written; omit for omission findings' },
          why: { type: 'string', description: 'the source, contradiction, or mechanism failure' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          action: {
            type: 'string',
            enum: ['delete', 'lower-to-floor', 'add-back', 'unbuildable', 'pick-one', 'confirm-wanted', 'check-reasoning', 'fix-citation'],
          },
        },
      },
    },
  },
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

// ---------------------------------------------------------------------------
// Per-verifier READ DISCIPLINE.
//
// Measured on the A/B run: 6 parallel verifiers drove 49.2M cache reads against the old
// single-agent path's 3.3M -- 15x. Fan-out multiplies context loading and nothing here
// amortized it: every verifier loaded the whole TRD and the whole PRD regardless of what
// it needed. The script cannot pre-slice files (workflow scripts have no filesystem
// access), so the lever is telling each verifier what NOT to read.
//
// This narrows HOW a verifier reads, never WHAT it is asked to find.
// ---------------------------------------------------------------------------
const READ_DISCIPLINE = {
  'objective-audit': `
READ DISCIPLINE. You need the objectives, not the whole document. Grep for tables and lines
stating what must be true (acceptance criteria, quality gates, NFRs, anything with a
threshold) and read those sections. Read the PRD's requirement sections to check provenance.
Do NOT read architecture, task list or grounding sections end to end.`,
  'design-audit': `
READ DISCIPLINE. You need the decisions, the task list and the grounding section -- read
those fully, and read the actual code a decision depends on before judging it constructible.
You do NOT need the PRD's prose beyond resolving a decision's stated objective.`,
  'derivation-audit': `
READ DISCIPLINE. You need the task table's Serves column, the Key Technical Decisions table,
and any section proposing delivery machinery. Grep for flags, rollout, migration, gates and
guards rather than reading linearly. Check the PRD only to confirm a named objective exists
-- grep it by ID, do not read it whole.`,
  'omission-audit': `
READ DISCIPLINE. Your traversal starts at the SOURCE. Read the PRD's objectives fully --
that is your checklist -- then grep the TRD for each by ID and subject. Do NOT read the TRD
linearly; "is this present" is a lookup per source item, not a full read.`,
  citations: `
READ DISCIPLINE. Do not read either document linearly. Grep the TRD for citation-shaped
strings (IDs, section refs, file:line), then grep each referenced ID in its live target.
This is a series of lookups; whole-document reads cost more than the check is worth.`,
  conformance: `
READ DISCIPLINE. Read stack.md and constitution.md -- short, and your baseline. Then grep
the TRD for what they constrain (technologies, coverage figures, prohibited patterns,
architectural invariants). Do NOT read the TRD end to end.`,
}

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

const VERIFIERS = [
  {
    key: 'objective-audit',
    effort: 'high',
    prompt: `Audit every OBJECTIVE in ${TRD} for PROVENANCE and SEVERITY.
${SOURCES}
Type by nature, not by section -- a measurable threshold is an objective wherever it appears,
including inside a specification section.

  provenance: does it trace to a named source, a measurement, or an explicit instruction?
  severity:   is the STRICTNESS sourced, not just the requirement's existence? Any number
              exceeding a .claude/rules/constitution.md floor must state why, inline.

"Zero tolerance" and "<=1 per run" are different requirements; the gap between them is where
unexamined severity hides.`,
  },
  {
    key: 'design-audit',
    effort: 'high',
    prompt: `Audit the DECISIONS and TASKS in ${TRD} for:

  buildability: can each decision be built AS SPECIFIED, given how the mechanism it governs
                actually works? Check the mechanism -- read the code, read the docs. Do not
                assume it works the way the TRD says.
  consistency:  does any decision or task contradict a sibling, or a document that supersedes
                this one?
  grounding:    does every task carry a grounding block? And -- the valuable half -- does
                anything the plan replaces go unnamed, left orphaned?

Buildability is the cheapest check and the one never performed. "Can this be built as
written?" costs one agent and has historically saved a whole task plus a wrong deferral.`,
  },
  {
    key: 'derivation-audit',
    // High, not medium: C2 targets §9.1's LARGEST category -- invented delivery machinery,
    // ~55 hits, >4x requirement invention. Effort was originally set by how familiar the
    // check felt rather than by measured frequency.
    effort: 'high',
    prompt: `For every TASK and every piece of DELIVERY MACHINERY in ${TRD} -- feature flags,
rollout phases, migration paths, guard infrastructure, eval gates, config toggles, staged
enablement -- check that it names the objective it serves.

A task or a flag that serves nothing is work nobody asked for. This is the largest single
category of wasted implementation effort in this framework: machinery added because it is how
one normally ships, which then gets built and deployed dark.

Report anything whose 'Serves' column is empty, or whose named objective does not exist.`,
  },
  {
    key: 'omission-audit',
    // High, not medium: §9.2 measured dropping requirements (~20) as commoner than
    // inventing them (~12), and §3.3 established omission is structurally invisible to
    // every artifact->source check. This is the only pass that can see it.
    effort: 'high',
    prompt: `Traverse SOURCE -> TRD, not TRD -> source.

Enumerate every objective stated in ${PRD} (and in stack.md / constitution.md where they bind
this feature). For each one, assert that it either appears in ${TRD} or is explicitly listed
under Non-Goals.

A per-line audit of the TRD cannot find a line that is not there. Dropping a requirement is
commoner than inventing one, and silent narrowing -- reproducing seven of eight metrics and
dropping the eighth without comment -- has no other check that can see it.

Report each source objective that is neither present nor non-goaled.`,
  },
  {
    key: 'citations',
    // The one stage where a cheaper model is clearly correct: grep an ID in a target file
    // and report misses. Deterministic, no judgment. Every other stage inherits the
    // session model deliberately.
    effort: 'low',
    model: 'haiku',
    prompt: `For every cross-artifact citation in ${TRD} -- any reference to an ID in another
document (AC-F1.1, NFR-2, PRD §5.1, another TRD's task ID) -- grep the referenced ID in the
LIVE target document and confirm it resolves.

Report every citation that does not resolve, with the ID and the target file searched. This
check is deterministic: a miss is a miss.`,
  },
  {
    key: 'conformance',
    effort: 'low',
    prompt: `Check ${TRD} against .claude/rules/stack.md and .claude/rules/constitution.md.

Report anything that violates a stated constraint: a technology outside the declared stack, a
pattern the constitution prohibits, a quality gate below a stated floor, an architectural
invariant contradicted.`,
  },
]

const waves = await parallel(
  VERIFIERS.map((v) => () =>
    agent(`${v.prompt}\n${READ_DISCIPLINE[v.key] || ''}\n${FINDABLE_ONLY}`, {
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
