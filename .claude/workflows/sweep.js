export const meta = {
  name: 'sweep',
  description: 'Fix a list of small independent issues in parallel, each grounded and attested',
  phases: [
    { title: 'Triage', detail: 'sort the list into small-and-independent, and everything else' },
    { title: 'Fix', detail: 'one grounded agent per issue, regions in parallel' },
  ],
}

/*
 * sweep.js — the missing shape.
 *
 * WHY THIS EXISTS, measured.
 *
 * An owner walked an app, wrote down ~25 small issues, and asked for the quick wins. The
 * framework had exactly one shape for that: author a document about them. `/create-trd` ran
 * for 22.7 minutes on the list and was killed before finishing. The owner then said "begin
 * fixing these using our skills and subagents; the TRD process is overly burdensome for
 * quick wins", and four subagents dispatched in 39 seconds had the first fix reported back
 * 100 seconds later — the whole batch inside about 13 minutes.
 *
 * The ad-hoc path won on time and lost on rigour: no grounding, no record, no attestation.
 * The owner's own verdict was "almost certainly at less quality -- so this isn't the answer".
 * The answer is that shape WITH the discipline, which is what this is.
 *
 * WHAT IT IS NOT. Not a replacement for `/create-trd`. A TRD earns its cost when the work is
 * ONE change with internal dependencies — a design that has to hold together. This is for N
 * things that merely arrived on the same list. The triage stage below exists to tell those
 * apart and to refuse the second job, not to do it badly.
 *
 * REGIONS, not a full task graph. Two agents editing one file is a lost update that raises
 * no error, so triage groups issues by the rough area they touch; regions run in parallel and
 * issues inside a region run in order. That is deliberately cruder than `task-graph.js`'s
 * file partition, which needs grounding that has not happened yet. Crude and safe beats
 * precise and late here.
 */

function readArgs() {
  let a = typeof args === 'string' ? JSON.parse(args) : args || {}
  if (typeof a === 'string') a = JSON.parse(a)
  return a
}

const a = readArgs()
const SOURCE = a.source || ''
const PROJECT = a.project || ''
const SCOPE = PROJECT
  ? `\nSCOPE: work only inside ${PROJECT}. Paths outside it are out of bounds.\n`
  : ''
const MAX_PARALLEL_REGIONS = 6

if (!SOURCE) throw new Error('sweep: args.source is required — the issue list, verbatim')

// --------------------------------------------------------------------------- 1. TRIAGE

phase('Triage')

const triage = await agent(
  `Sort a list of reported issues into work that can be fixed independently right now, and
work that cannot.
${SCOPE}
THE LIST, VERBATIM:
${SOURCE}

For each issue decide:

  SMALL      -- a contained change: a label, a calculation, a missing guard, a wrong default.
                One or two files. No schema change, no new subsystem, no API contract.
  INDEPENDENT-- fixing it does not require another issue on this list to be fixed first.
  REGION     -- the rough area it touches, as a short slug ("web/offer-letter",
                "workers/reconcile"). Your best guess from the issue text; you have not read
                the code yet. Two issues in the same region will be fixed one after another,
                because two agents editing one file lose each other's work.

ANYTHING THAT IS NOT BOTH SMALL AND INDEPENDENT GOES IN \`deferred\`, WITH A REASON.
Do not attempt to make a large thing small by splitting it — that is a design decision and it
belongs in /create-prd. Getting this wrong in the permissive direction is the expensive
mistake: a schema change dispatched as a quick win damages a working tree.

An issue that is unclear rather than large is also deferred: say what you would need to know.

Zero deferrals is common and fine. So is deferring most of the list.`,
  {
    label: 'triage',
    phase: 'Triage',
    agentType: 'technical-architect',
    effort: 'low',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['fix', 'deferred'],
      properties: {
        fix: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'summary', 'region'],
            properties: {
              id: { type: 'string', description: 'short stable handle, e.g. "12" or "rate-box"' },
              summary: { type: 'string', description: 'the issue in one line, in the reporter\'s terms' },
              region: { type: 'string', description: 'rough area slug; same slug = fixed in sequence' },
            },
          },
        },
        deferred: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['summary', 'why'],
            properties: {
              summary: { type: 'string' },
              why: { type: 'string', description: 'too large, coupled to another issue, or unclear — and which' },
            },
          },
        },
      },
    },
  }
)

if (!triage) throw new Error('sweep: triage returned nothing')

const TO_FIX = triage.fix || []
const DEFERRED = triage.deferred || []
log(`triage: ${TO_FIX.length} to fix, ${DEFERRED.length} deferred`)

if (!TO_FIX.length) {
  return {
    fixed: [],
    deferred: DEFERRED,
    readout:
      `SWEEP: nothing to fix — ${DEFERRED.length} issue(s) all deferred\n` +
      DEFERRED.map((d) => `    ${d.summary} — ${d.why}`).join('\n') +
      `\n\n  These are not quick wins. Use /create-prd for the design ones, /investigate for a single defect.\n`,
  }
}

// --------------------------------------------------------------------------- 2. FIX

phase('Fix')

/* Group by region. Regions run in parallel; issues inside one run in order, because they are
 * the ones most likely to touch the same file. */
const byRegion = new Map()
for (const item of TO_FIX) {
  const key = item.region || item.id
  if (!byRegion.has(key)) byRegion.set(key, [])
  byRegion.get(key).push(item)
}
const regions = [...byRegion.entries()].slice(0, MAX_PARALLEL_REGIONS)
const overflow = [...byRegion.entries()].slice(MAX_PARALLEL_REGIONS)
if (overflow.length) {
  log(`WARNING: ${overflow.length} region(s) beyond the parallel cap will run after the first ${MAX_PARALLEL_REGIONS}`)
}

const fixPrompt = (item) =>
  `Fix ONE reported issue, grounded in the code that exists.
${SCOPE}
ISSUE ${item.id}: ${item.summary}

GROUND IT FIRST. Find the code that produces this behaviour. Read it. Do not fix from the
issue text alone — the reporter described a symptom, and the symptom is not always where the
cause is.

THEN MAKE THE SMALLEST CHANGE THAT FIXES IT. Match the conventions already in that file.

IF IT IS NOT SMALL, STOP AND SAY SO. Return \`status: "too-big"\` with what you found. Triage
judged this from the issue text without reading code; you have read the code and you are the
first one who can actually tell. A half-finished large change is worse than a deferred one.

IF IT IS ALREADY FIXED, SAY THAT. Return \`status: "already-fixed"\` and name the evidence.
That is a real and common result when working from a list written days earlier.

VERIFY WHAT YOU CHANGED. Run the narrowest check that covers it — the file's own tests, a
type check, the build. Report what you ran and what it said. Do not run the whole suite.

REPORT EVERY FILE YOU CHANGED, by path. It is checked against the disk afterwards: a claimed
file that does not exist fails this issue, however good the explanation.`

const fixSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'status', 'summary'],
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: ['fixed', 'already-fixed', 'too-big', 'failed'] },
    summary: { type: 'string', description: 'what you changed and why, one or two lines' },
    files_changed: { type: 'array', items: { type: 'string' } },
    verified: { type: 'string', description: 'the check you ran and its result' },
    detail: { type: 'string', description: 'for too-big or failed: what you found' },
  },
}

const regionResults = await parallel(
  regions.map(([region, items]) => async () => {
    const out = []
    for (const item of items) {
      const r = await agent(fixPrompt(item), {
        label: `fix:${item.id}`,
        phase: 'Fix',
        agentType: 'backend-implementer',
        effort: 'medium',
        schema: fixSchema,
      })
      out.push(r ? { ...r, region } : { id: item.id, status: 'failed', summary: item.summary, detail: 'the agent returned nothing', region })
    }
    return out
  })
)

const results = regionResults.filter(Boolean).flat()
const fixed = results.filter((r) => r.status === 'fixed')
const already = results.filter((r) => r.status === 'already-fixed')
const tooBig = results.filter((r) => r.status === 'too-big')
const failed = results.filter((r) => r.status === 'failed')

log(`${fixed.length} fixed, ${already.length} already fixed, ${tooBig.length} too big, ${failed.length} failed`)

const line = (r) => `    ${r.id} — ${r.summary}${r.verified ? ` [${r.verified}]` : ''}`

return {
  fixed: fixed.map((r) => ({ id: r.id, summary: r.summary, files_changed: r.files_changed || [], verified: r.verified || '' })),
  already_fixed: already.map((r) => ({ id: r.id, summary: r.summary })),
  too_big: tooBig.map((r) => ({ id: r.id, summary: r.summary, detail: r.detail || '' })),
  failed: failed.map((r) => ({ id: r.id, summary: r.summary, detail: r.detail || '' })),
  deferred: DEFERRED,
  regions: regions.length,
  readout:
    `SWEEP: ${fixed.length} fixed across ${regions.length} region(s) in parallel\n` +
    (fixed.length ? `\n  FIXED\n${fixed.map(line).join('\n')}\n` : '') +
    (already.length ? `\n  ALREADY FIXED — no change needed\n${already.map(line).join('\n')}\n` : '') +
    (tooBig.length ? `\n  NOT A QUICK WIN — needs its own design pass\n${tooBig.map((r) => `    ${r.id} — ${r.detail}`).join('\n')}\n` : '') +
    (failed.length ? `\n  FAILED — still broken\n${failed.map((r) => `    ${r.id} — ${r.detail}`).join('\n')}\n` : '') +
    (DEFERRED.length ? `\n  DEFERRED AT TRIAGE — not attempted\n${DEFERRED.map((d) => `    ${d.summary} — ${d.why}`).join('\n')}\n` : '') +
    `\n  NOT COMMITTED. Review the diff, then commit.\n`,
}
