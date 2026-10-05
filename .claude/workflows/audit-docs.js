export const meta = {
  name: 'audit-docs',
  description: 'Score, route and review one batch of documentation files against the code as built',
  whenToUse: 'Invoked by /audit-docs, once per batch. Scores each PRD/TRD, routes it to an Opus, Sonnet or no review by score, reviews it, and returns one record per document. Everything deterministic (class, batches, windows, applying removals, commits) is done by the docs-audit libraries, not here.',
  phases: [
    { title: 'Score', detail: 'one Haiku agent per PRD/TRD returns a 0-100 drift score' },
    { title: 'Review', detail: 'per document: Opus three verifiers then one apply agent, or one Sonnet agent, or nothing' },
  ],
}

// ---------------------------------------------------------------------------
// One batch in, one record per document out (TRD docs-as-built D5, D7, D16, D18).
//
// args: { runId, mode, repo, assemblyPath, contractPath, thresholds: {high, medium},
//         window?: { commits: <int> },
//         batch: { key, chunk, docs: [{ path, class, text }] } }
//
//   window.commits  light runs only: how many commits the marker..HEAD window holds. Zero means
//                   nothing changed since the last run, so nothing is scored or reviewed.
//
// The script opens no file and runs no shell. Agents are handed PATHS (assemblyPath,
// contractPath) and read them with their own tools. Class comes from args and is never
// re-decided here; depth is a pure function of score, thresholds and mode.
// ---------------------------------------------------------------------------

function readArgs(raw) {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch (e) {
      throw new Error('workflow args arrived as a string and is not valid JSON. Pass args as an actual JSON object.')
    }
  }
  return raw || {}
}

const a = readArgs(args)
if (!a.batch || !Array.isArray(a.batch.docs)) throw new Error('audit-docs: args.batch.docs (the documents in this batch) is required')
if (!a.assemblyPath) throw new Error('audit-docs: args.assemblyPath is required')

const MODE = a.mode === 'comprehensive' ? 'comprehensive' : 'light'
const REPO = a.repo || ''
const ASSEMBLY = a.assemblyPath
const CONTRACT = a.contractPath || '.claude/contracts/docs-audit.md'
const HIGH = a.thresholds && a.thresholds.high
const MEDIUM = a.thresholds && a.thresholds.medium
const DOCS = a.batch.docs
const BATCH_KEY = a.batch.key
const BATCH_CHUNK = a.batch.chunk
const EMPTY_LIGHT_WINDOW = MODE === 'light' && !!a.window && a.window.commits === 0

if (!Number.isInteger(HIGH) || !Number.isInteger(MEDIUM)) {
  throw new Error('audit-docs: args.thresholds.high and .medium must be integers (the command validates them before dispatch)')
}

// ---- Route: a pure function, no agent -------------------------------------------------------

function route(score) {
  if (score === null || score === undefined) return 'sonnet' // an unscored doc is never skipped (D5)
  if (score >= HIGH) return 'opus'
  if (score >= MEDIUM) return 'sonnet'
  return MODE === 'comprehensive' ? 'sonnet' : 'none' // comprehensive raises none to Sonnet
}

// ---- Shared prompt parts --------------------------------------------------------------------

const SCOPE = `
SCOPE. The repository is ${REPO || 'the current directory'}; every relative path resolves against it. The assembly
file ${ASSEMBLY} lists many documents: use ONLY the entry for the one document you are given. You
may read any source file to check a claim, but you may edit ONLY the one document named below.
Never delete a file. Never run a git write command (commit, add, rm, checkout, reset, stash).
Follow ${CONTRACT} -- read it first; it holds the correct-or-cut rule, the procedures for each
document class, the code-map format and the cross-repo rule.`

const ENTRY = (doc) => `The document is ${doc.path} (class: ${doc.class}). Its record is the entry in ${ASSEMBLY} -> files[] whose path is exactly "${doc.path}".`

const FINDABLE_ONLY = `
FINDABLE ONLY. Every finding names a claim in the document and the code that contradicts it (or the
search that found nothing). An absence claim must exhibit the search. Zero findings is a legitimate
result -- do not manufacture findings.`

// ---- Schemas --------------------------------------------------------------------------------

const SCORE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['score', 'reason'],
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    reason: { type: 'string' },
  },
}

const FINDING_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['section', 'claim', 'why'],
        properties: {
          section: { type: 'string' },
          claim: { type: 'string', description: "the document's words, as written" },
          why: { type: 'string', description: 'what the code shows instead, or the search that found nothing' },
          action: { type: 'string', enum: ['correct', 'cut', 'unbuilt', 'behaviour', 'non-goal', 'cross-repo', 'status', 'remove-doc'] },
        },
      },
    },
  },
}

const OUTCOMES = ['unchanged', 'edited', 'remove-proposed', 'kept']
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['outcome'],
  properties: {
    outcome: { type: 'string', enum: OUTCOMES },
    corrections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['section', 'what'], properties: { section: { type: 'string' }, what: { type: 'string' } } } },
    cuts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['section', 'why'], properties: { section: { type: 'string' }, why: { type: 'string' } } } },
    unbuilt: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'statement'], properties: { id: { type: 'string' }, statement: { type: 'string' } } } },
    behaviourChanges: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'was', 'now'], properties: { id: { type: 'string' }, was: { type: 'string' }, now: { type: 'string' } } } },
    brokenNonGoals: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['statement', 'evidence'], properties: { statement: { type: 'string' }, evidence: { type: 'string' } } } },
    statusCorrection: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: { type: 'string' }, to: { type: 'string' } } }] },
    crossRepo: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['claim', 'path'], properties: { claim: { type: 'string' }, path: { type: 'string' } } } },
    removeReason: { type: ['string', 'null'] },
    mapWritten: { type: 'boolean' },
  },
}

// ---- Score ----------------------------------------------------------------------------------

const ANCHORS = `
Anchors for the 0-100 score (how likely this document now misdescribes the code):
  0-20   nothing in the changes touches what the document describes.
  21-40  changes touch nearby code; the document's claims very probably still hold.
  41-70  changes touch code the document names or describes; some claims may have drifted.
  71-100 changes rewrite, move or remove code the document describes; it is very likely stale.
Return an integer and a one-line reason.`

function scorePrompt(doc) {
  const window = MODE === 'light'
    ? `The change window is the top-level "window" object in ${ASSEMBLY} (commits since the last run: sha, subject, changed paths).`
    : `The change window is this document's own "docWindow" (commits since the document last changed) in its entry.`
  return `Score how far ${doc.path} has drifted from the code as built.
${ENTRY(doc)}
${window}
If the entry has a code map ("map"), use its directories to judge overlap; if not, judge from the document's own text. Read the document, then compare what it describes with what the window changed.
${ANCHORS}
${SCOPE}
Do not edit anything.`
}

async function scoreDoc(doc) {
  const r = await agent(scorePrompt(doc), {
    label: `score:${doc.path}`,
    agentType: 'code-reviewer',
    phase: 'Score',
    model: 'haiku',
    effort: 'low',
    schema: SCORE_SCHEMA,
  })
  return r && Number.isInteger(r.score) ? { score: r.score, reason: r.reason || '' } : { score: null, reason: null }
}

// ---- Review: Opus (three verifiers then one apply agent) -------------------------------------

const VERIFIERS = {
  prd: [
    { key: 'requirements', prompt: 'For every requirement and acceptance criterion in the PRD, decide whether the code as built delivers it. A requirement that is not built is reported with action "unbuilt" (it stays in the document); one the code contradicts is "correct" when only the mechanism differs, or "behaviour" when a user would see a different result (the writer records it as a changelog row). A non-goal the code contradicts is "non-goal" (reported, never edited).' },
    { key: 'sections', prompt: 'Walk the PRD section by section (goals, scope, constraints, decisions, status text). Report each section whose claims no longer describe the system, as "correct" when it can be fixed or "cut" when nothing valid is left in it.' },
    { key: 'paths', prompt: 'Check every file path, command, symbol and name the PRD cites. Use the missing-path history in the entry: a path that was removed is "correct" or "cut"; a path that NEVER existed in this repository and reads as belonging to another repository is "cross-repo" (left as written).' },
  ],
  trd: [
    { key: 'tasks', prompt: 'Check each task row and the TRD Status field against the code and the delivered state. Report a task whose described work is not what was built as "correct" or "cut"; report a Status value that disagrees with what was delivered as "status".' },
    { key: 'sections', prompt: 'Walk the TRD section by section (specifications, decisions, interfaces, data flow). Report each section whose claims no longer describe the system, as "correct" when it can be fixed or "cut" when nothing valid is left in it. Content describing something never built is "cut".' },
    { key: 'paths', prompt: 'Check every file path, command, symbol and name the TRD cites. Use the missing-path history in the entry: a path that was removed is "correct" or "cut"; a path that NEVER existed in this repository and reads as belonging to another repository is "cross-repo" (left as written).' },
  ],
}

function dispatchVerifier(doc, v) {
  return agent(`You are one read-only verifier of ${doc.path}. ${v.prompt}
${ENTRY(doc)}
${SCOPE}
You are READ-ONLY: do not edit any file.
${FINDABLE_ONLY}`, {
    label: `verify:${v.key}:${doc.path}`,
    agentType: 'code-reviewer',
    phase: 'Review',
    model: 'opus',
    effort: 'high',
    schema: FINDING_SCHEMA,
  }).then((r) => (r ? { verifier: v.key, findings: r.findings || [] } : null))
}

async function reviewOpus(doc) {
  const set = VERIFIERS[doc.class] || VERIFIERS.prd
  const waves = await parallel(set.map((v) => () => dispatchVerifier(doc, v)))
  const alive = waves.filter(Boolean)
  const missing = set.filter((v) => !alive.some((w) => w.verifier === v.key)).map((v) => v.key)

  const findings = alive.map((w) => `VERIFIER ${w.verifier}: ${JSON.stringify(w.findings)}`).join('\n')
  const missingNote = missing.length
    ? `\nThese verifiers returned nothing: ${missing.join(', ')}. Leave the ground they covered UNCHANGED, and do not guess at it.`
    : ''
  return agent(`You are the only writer for ${doc.path}. Three independent verifiers have checked it; their findings follow. Re-check each one against the code before acting (a finding is a claim, not a fact), then apply the contract's correct-or-cut rule to the document: correct what can be corrected, cut what has nothing valid left, surface (do not cut) unbuilt PRD requirements, and leave cross-repo claims as written. For a PRD, follow the contract's PRD procedure: a "behaviour" finding is corrected and recorded in behaviourChanges plus one changelog row (no banner word in it), and a "non-goal" finding is left unedited and returned in brokenNonGoals. Write or update the document's code map in the contract's format. If nothing valid is left in the whole document, do not edit it; propose its removal with outcome "remove-proposed" and a removeReason.
${ENTRY(doc)}

${findings}${missingNote}
${SCOPE}
Return the record of what you changed.`, {
    label: `apply:${doc.path}`,
    agentType: 'backend-implementer',
    phase: 'Review',
    model: 'opus',
    effort: 'high',
    schema: REVIEW_SCHEMA,
  })
}

// ---- Review: Sonnet (one agent) ---------------------------------------------------------------

function reviewSonnet(doc) {
  const loose = doc.class === 'loose'
  const textRule = loose && doc.text === false
    ? `This is a non-text file (read it with the Read tool if it is an image). Do NOT edit it. Return outcome "kept", or "remove-proposed" with a removeReason when nothing valid depends on it.`
    : loose
      ? `This is a loose document. If it describes the system, apply the contract's correct-or-cut procedure and write a code map; if it is only a report or log of past work, check it only for claims about the current system.`
      : `Read the document, check it against the code, and apply the contract's procedure for a ${doc.class.toUpperCase()}: correct what can be corrected, cut what has nothing valid left, surface (do not cut) unbuilt PRD requirements, for a PRD record a requirement changed in a way a user would see as a behaviour change (behaviourChanges plus a changelog row) and report a contradicted non-goal in brokenNonGoals without editing it, leave cross-repo claims as written, correct a TRD Status field that disagrees with what was delivered, and write or update the code map.`
  return agent(`Review ${doc.path} against the code as built and apply the result yourself.
${ENTRY(doc)}
${textRule}
If nothing valid is left in the whole document, do not edit it; return outcome "remove-proposed" with a removeReason.
${SCOPE}
${FINDABLE_ONLY}
Return the record of what you changed.`, {
    label: `review:${doc.path}`,
    agentType: 'backend-implementer',
    phase: 'Review',
    model: 'sonnet',
    effort: 'medium',
    schema: REVIEW_SCHEMA,
  })
}

// ---- Records --------------------------------------------------------------------------------

function baseRecord(doc, depth, scored) {
  return {
    path: doc.path, class: doc.class, depth,
    score: scored ? scored.score : null,
    scoreReason: scored ? scored.reason : null,
    outcome: 'not-reviewed',
    corrections: [], cuts: [], unbuilt: [], behaviourChanges: [], brokenNonGoals: [], statusCorrection: null, crossRepo: [],
    removeReason: null, mapWritten: false,
  }
}

function withResult(rec, doc, r) {
  if (!r) return { ...rec, outcome: 'failed' }
  let outcome = r.outcome
  // A non-text file can only be kept or proposed for removal: an agent cannot edit it.
  if (doc.class === 'loose' && doc.text === false && outcome !== 'kept' && outcome !== 'remove-proposed') outcome = 'kept'
  return {
    ...rec,
    outcome,
    corrections: r.corrections || [],
    cuts: r.cuts || [],
    unbuilt: doc.class === 'prd' ? (r.unbuilt || []) : [],
    behaviourChanges: doc.class === 'prd' ? (r.behaviourChanges || []) : [],
    brokenNonGoals: doc.class === 'prd' ? (r.brokenNonGoals || []) : [],
    statusCorrection: doc.class === 'trd' ? (r.statusCorrection || null) : null,
    crossRepo: r.crossRepo || [],
    removeReason: outcome === 'remove-proposed' ? (r.removeReason || null) : null,
    mapWritten: !!r.mapWritten,
  }
}

// ---- Run ------------------------------------------------------------------------------------

const dead = []

async function handle(doc) {
  const isLoose = doc.class === 'loose'
  // Loose docs are never scored: Sonnet once-over (comprehensive runs only reach this script).
  const scored = isLoose ? null : await scoreDoc(doc)
  const depth = isLoose ? 'sonnet' : route(scored.score)
  const rec = baseRecord(doc, depth, scored)
  if (depth === 'none') return rec
  const r = depth === 'opus' ? await reviewOpus(doc) : await reviewSonnet(doc)
  if (!r) dead.push(doc.path)
  return withResult(rec, doc, r)
}

let records
if (EMPTY_LIGHT_WINDOW) {
  log(`audit-docs ${BATCH_KEY}: the light window holds no commits; nothing scored or reviewed`)
  records = DOCS.map((doc) => baseRecord(doc, 'none', null))
} else {
  // Each doc's thunk scores then reviews on its own clock, so the two phases overlap across
  // docs; the phase titles mark what this batch is about to do, not a barrier between them.
  if (DOCS.some((d) => d.class !== 'loose')) phase('Score')
  phase('Review')
  records = await parallel(DOCS.map((doc) => () => handle(doc)))
}

for (const p of dead) log(`audit-docs ${BATCH_KEY}: review agent returned nothing for ${p}`)

return { batch: { key: BATCH_KEY, chunk: BATCH_CHUNK }, records, dead }
