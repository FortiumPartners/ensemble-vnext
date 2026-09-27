'use strict';

/**
 * discovered.js — the channel for work a run FINDS but was not asked to do.
 *
 * WHY THIS EXISTS
 *
 * `/implement-trd` computes its task graph once, before any agent runs
 * (`trd-parser.js` → `task-graph.js`), and `implement-phase.js` iterates a fixed
 * `waves` array. That is deliberate: the orchestrator owns the plan, and a task
 * set that mutates mid-dispatch is a task set nothing can reason about.
 *
 * But real implementation discovers things. An implementer hits a bug outside its
 * scope. A reviewer finds something non-trivial it will not guess a fix for.
 * `/audit-build` reports a traceability gap. Before this module, every one of those
 * went the same way: into a PHASE banner or a commit message, as prose, and died
 * there. The command had no channel for "this run found work it did not do", so the
 * only mechanism was a human reading a commit and remembering.
 *
 * This is that channel. Append-only JSONL beside the rest of the run's state, read
 * by the command at each phase boundary and again at completion.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does NOT add tasks to the running graph. A discovery lands as a RECORD, and
 * what happens next is the orchestrator's decision at a boundary — report it, or
 * write it into the TRD so the next `--resume` picks it up through the normal
 * parse→graph→dispatch path. Nothing here reaches into a dispatch that is already
 * in flight, and nothing here edits the TRD. Both of those belong to the command.
 *
 * The failure this shape avoids: a mid-flight task injection means the wave
 * partition, the file-conflict serialization and the phase gate were all computed
 * against a task set that no longer exists.
 */

const fs = require('fs');
const path = require('path');

/** Keep one appended line under PIPE_BUF (4096) so concurrent O_APPEND writes from
 *  parallel implementers cannot interleave. Same bound, same reason, as
 *  hooks/lib/dispatch-ledger.js. */
const MAX_LINE_BYTES = 2048;

const KINDS = ['bug', 'scope-conflict', 'stale-grounding', 'gap', 'risk'];

// A verification-outcome record (a functional-verification criterion, recorded through this
// same channel) carries a `status` alongside the usual fields. Only these ever promote --
// `met` and `not_verifiable` are deliberately absent below.
const VERIFICATION_STATUSES = ['met', 'not_met', 'not_verifiable', 'unbuilt', 'stalled'];
const PROMOTABLE_STATUSES = ['not_met', 'stalled', 'unbuilt'];

/**
 * The discoveries that should become TRD tasks, and nothing else.
 *
 * Three filters, all deliberately mechanical so the answer is checkable rather than argued:
 *  - `blocksFeature === true`  -- the objectives are not met while this stands
 *  - kind is not 'risk'        -- a risk is a thing to watch, not a thing to build
 *  - a `status` of `not_verifiable` never promotes -- that criterion FAILED TO RUN, it did
 *    not fail. The blocker is environmental (no environment listed covers it, tooling isn't
 *    installed), and promoting it mints a task meaning "go deploy this," which no implementer
 *    can action. `not_met`, `stalled` and `unbuilt` all name something to BUILD, so they still
 *    promote; a record with no `status` at all (an ordinary bug/gap discovery) is unaffected.
 *
 * Everything else is reported and left alone. The orchestrator still decides whether to act;
 * this only narrows what it is deciding about, so an unrelated bug found while reading a file
 * cannot quietly become scope.
 */
/**
 * D5's identity pre-pass: for rows carrying a `ref` (a criterion id, or `plan:<blocker id>`),
 * keep only the LATEST row per ref (by `ts`), so a later `met` observation retires an earlier
 * failure entirely -- not just from promotion, from every reader of `promotable()`'s output.
 * Rows with no `ref` pass through completely unaffected, in their original relative order.
 *
 * Runs as a pre-pass, before the three mechanical filters below: a superseded row must not
 * survive just because the LATEST row for its ref happens to fail one of those filters (e.g.
 * the latest is `met`, which promotable() would drop anyway -- the point is the earlier
 * `not_met` row disappears too, rather than being reported as if it still stood).
 */
function latestPerRef(rows) {
  const latestByRef = new Map();
  for (const r of rows) {
    if (!r || !r.ref) continue;
    const cur = latestByRef.get(r.ref);
    // A row with no `ts` (hand-written into the ledger; record() always stamps one) must not
    // out-rank a timestamped one -- String(undefined) is "undefined", which sorts above every
    // ISO timestamp and would make an undated row the "latest" observation of its ref.
    if (!cur || String(r.ts ?? '') >= String(cur.ts ?? '')) latestByRef.set(r.ref, r);
  }
  return rows.filter((r) => !r || !r.ref || latestByRef.get(r.ref) === r);
}

function promotable(rows) {
  if (!Array.isArray(rows)) return [];
  return latestPerRef(rows).filter((r) => {
    if (!r || r.blocksFeature !== true || r.kind === 'risk') return false;
    if (r.status && !PROMOTABLE_STATUSES.includes(r.status)) return false;
    return true;
  });
}

/**
 * Write promotable discoveries into a TRD's Master Task List as real tasks.
 *
 * THE MISSING LINK, and it was missing for an hour after the rule that depends on it shipped.
 * The in-flight carve-out (router.py) tells an agent that an issue in the running feature's
 * path is "an AMENDMENT to this TRD -- record it and let `/implement-trd --reconcile` pick it
 * up". But `--reconcile` picks up tasks ALREADY IN THE TRD, and until this function nothing
 * put them there. `promotable()` had zero consumers. The instruction was a promise the
 * mechanism did not keep -- the ninth instance in this repo of a rule whose executing path is
 * exempt from it, and the author had catalogued the other eight an hour earlier.
 *
 * Appends rows to the EXISTING table rather than rewriting it: a TRD is the owner's document
 * and an amendment is an addition, never an edit of what they wrote. Ids are suffixed so a
 * promoted task is visibly not one the architect planned.
 *
 * @param {string} trdPath
 * @param {Array} rows            discoveries, typically promotable(readAll(stateDir))
 * @param {{idPrefix?: string, now?: string}} [opts]
 * @returns {{added: string[], skipped: number}}
 */
function promoteToTrd(trdPath, rows, opts = {}) {
  const added = [];
  const promo = promotable(rows);
  if (!promo.length) return { added, skipped: 0 };

  let text;
  try { text = fs.readFileSync(trdPath, 'utf-8'); } catch { return { added, skipped: promo.length }; }

  const lines = text.split('\n');
  const prefix = opts.idPrefix || 'AMEND';

  /* Anchor on the LAST task table, not the first.
   *
   * A phased TRD has one `| Task ID |` table per phase -- this repo's own
   * autonomy-judge-command-scope.md has four. Anchoring on the first put every amendment
   * into Phase 1, so an amendment to phase-3 work was scheduled before the work it
   * amends, and `--phase 1` runs picked up tasks belonging to a later phase. The last
   * table is the right default: an amendment is found during or after the work it
   * follows. */
  const headIdxs = [];
  lines.forEach((l, i) => { if (/^\|\s*Task ID\s*\|/i.test(l)) headIdxs.push(i); });
  if (!headIdxs.length) return { added, skipped: promo.length };
  const headIdx = headIdxs[headIdxs.length - 1];

  /* Build the row from THAT table's header, never from a hardcoded column count.
   *
   * `trd-parser.js` maps columns by header name and warns "Malformed table row (expected
   * N columns, got M)" on any mismatch, so a row emitted with the canonical 6-column
   * shape is DROPPED by the parser on the 5-column TRDs half this repo uses. The row has
   * to match the table it is being appended to. */
  const headerCells = lines[headIdx].split('|').slice(1, -1).map((c) => c.trim());
  const roleOf = (words) => headerCells.findIndex((h) => words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(h)));
  const col = {
    id: roleOf(['task id', 'id']),
    desc: roleOf(['description']),
    serves: roleOf(['serves']),
    deps: roleOf(['dependencies', 'depends']),
    ac: roleOf(['acceptance']),
  };

  let lastRow = headIdx + 1; // the |---| separator
  while (lastRow + 1 < lines.length && /^\|/.test(lines[lastRow + 1])) lastRow++;

  const allRowIds = lines
    .filter((l) => /^\|/.test(l))
    .map((l) => (l.split('|')[1] || '').trim());
  const existing = new Set(allRowIds);

  /* Number from the highest existing id, never from 1.
   *
   * Restarting at 1 each call was a silent data-loss bug, reproduced 2026-09-20: run 1
   * promotes discovery A as AMEND-001; run 2 over a ledger holding A and B collides on
   * AMEND-001, hits `continue`, and returns `added: []`. B never becomes a task and never
   * can, because every later run repeats the collision -- and `--reconcile` re-reads the
   * append-only ledger on EVERY run, so this is the normal path, not an edge case. The
   * caller only logs counts, so the loss is invisible. */
  const idRe = new RegExp(`^${prefix}-(\\d+)$`);
  let n = allRowIds.reduce((max, id) => {
    const m = idRe.exec(id);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);

  /* Dedupe on the summary itself, held in a set that also grows as this call adds rows.
   *
   * The previous predicate conjoined two unrelated operands -- `id.startsWith(prefix) &&
   * text.includes(slug)` never compared `id` to `slug`, so it was really "does any AMEND
   * row exist AND does this text appear anywhere in the document", which both re-added
   * discoveries before the first amendment landed and skipped genuinely new ones whose
   * first 60 characters happened to occur in unrelated prose. */
  const seen = new Set();
  const norm = (sry) => String(sry).trim().replace(/\s+/g, ' ').toLowerCase();
  /* Parallel to `seen`, but keyed for `ref`-carrying rows (D5): the observation key
   * `<ref>@<ts>` embedded at the end of a promoted row's description (`[<ref> @ <ts>]`)
   * says this exact observation was already promoted -- re-running `--fix` over the same
   * ledger (or the same plan, provided the caller records its blockers with the plan's
   * `**Written**` timestamp as `nowIso`, §3.2 -- record() otherwise stamps a fresh `ts` every
   * run) must not re-add it.
   * `refToId` says which task id a `ref` was last promoted as, for two things: a second,
   * still-open observation of the same ref becomes a follow-up depending on that id, and a
   * plan blocker's `after` list resolves to the ids of the refs it names. Both are read from
   * rows ALREADY in the document (scanned once here, before this call's own rows exist) and
   * then kept current as this call promotes its own ref-carrying rows below. */
  const existingObsKeys = new Set();
  const refToId = new Map();
  const OBS_MARKER_RE = /\[(\S+) @ (\S+)\]\s*$/;
  // Split on UNESCAPED pipes only, keeping `\|` as written: a promoted summary is stored with
  // its pipes escaped (below), and a naive split would cut its description cell short, lose
  // the trailing `[<ref> @ <ts>]` marker, and re-promote the same observation on every run.
  const splitCells = (l) => l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
  for (const l of lines) {
    if (!/^\|/.test(l)) continue;
    const cells = splitCells(l);
    if (col.desc >= 0 && cells[col.desc]) {
      const descCell = cells[col.desc];
      seen.add(norm(descCell.split(' — promoted from')[0]));
      const m = OBS_MARKER_RE.exec(descCell);
      if (m) {
        const [, ref, ts] = m;
        existingObsKeys.add(`${ref}@${ts}`);
        if (col.id >= 0 && cells[col.id]) refToId.set(ref, cells[col.id]);
      }
    }
  }

  const newRows = [];
  // Parallel to `newRows`/`added`: what each promoted task's grounding block should say.
  // Built here, alongside the row, so a row and its grounding can never drift apart --
  // one that ADD-ed a row and skipped the block (or vice versa) is exactly the defect this
  // function exists to close.
  const groundingEntries = [];
  for (const r of promo) {
    // A record may implicate more than one file (`files`, in addition to the primary
    // `file`) -- e.g. a discovery found while touching a 12-file amendment. Collapse
    // both into one deduped list so Touches names every file the record actually
    // implicates, not just the first one it happened to carry.
    const allFiles = Array.from(new Set(
      [r.file, ...(Array.isArray(r.files) ? r.files : [])].filter(Boolean)
    ));
    const where = allFiles.length ? ` (${allFiles.map((f) => `\`${f}\``).join(', ')})` : '';
    const escapedSummary = String(r.summary).replace(/\|/g, '\\|');
    const summary = `${escapedSummary}${where}`;

    // D5: a ref-carrying row dedupes on its own observation key, in parallel with (never
    // replacing) the summary-based dedupe above, which stays the sole mechanism for rows
    // with no ref. `earlierId` -- the id this ref was last promoted as, if any -- is read
    // BEFORE this row is added to `refToId` below, so it names the row this one follows up,
    // never itself.
    let earlierId;
    if (r.ref) {
      const obsKey = `${r.ref}@${r.ts}`;
      if (existingObsKeys.has(obsKey)) continue;
      earlierId = refToId.get(r.ref);
    } else {
      if (seen.has(norm(summary))) continue;
      seen.add(norm(summary));
    }

    do { n += 1; } while (existing.has(`${prefix}-${String(n).padStart(3, '0')}`));
    const id = `${prefix}-${String(n).padStart(3, '0')}`;
    existing.add(id);

    const cells = new Array(headerCells.length).fill('');
    if (col.id >= 0) cells[col.id] = id;
    if (col.desc >= 0) {
      if (r.ref) {
        // A still-open second observation of the same ref reads as a follow-up naming the
        // row it did not close; a ref with no earlier promotion reads like any other
        // promoted discovery, just carrying its `[<ref> @ <ts>]` marker for future runs.
        cells[col.desc] = earlierId
          ? `${summary} — follow-up to ${earlierId}, which did not close it [${r.ref} @ ${r.ts}]`
          : `${summary} — promoted from a ${r.kind} discovery found by ${r.foundBy} [${r.ref} @ ${r.ts}]`;
      } else {
        cells[col.desc] = `${summary} — promoted from a ${r.kind} discovery found by ${r.foundBy}`;
      }
    }
    /* `Serves` is mandatory and machine-readable, and a promoted discovery genuinely has no
     * objective to point at -- nothing in the ledger records one. Writing a plausible `O1`
     * would be manufacturing the provenance this framework exists to prevent, so the
     * honest value is the marker, and `/audit-trd` surfacing it is the correct outcome:
     * the owner points it at an objective, or decides it does not belong in this TRD.
     * `opts.serves` lets a caller that DOES know supply it, and (§3.2) still wins even over
     * a ref-derived value. */
    if (col.serves >= 0) {
      const refServes = r.ref
        ? (r.ref.startsWith('plan:') ? `plan blocker ${r.ref.slice(5)}` : `criterion ${r.ref}`)
        : null;
      cells[col.serves] = opts.serves || refServes || 'amendment — no objective recorded';
    }
    // Dependencies are resolved after the loop (below), once every row in this call has an
    // id: a blocker's `after` may name a sibling that appears LATER in the ledger.
    if (col.deps >= 0) cells[col.deps] = 'None';
    /* A generic "the discovery no longer reproduces" is unfalsifiable -- it reads the
     * same for every promoted row regardless of what the row actually claims, so nothing
     * can check it against the row's own evidence. Anchor it to the specific summary
     * (and evidence, when the record carried one) so the criterion names the concrete
     * claim a verifier or reviewer can actually check. */
    if (col.ac >= 0) {
      const evidence = r.evidence ? String(r.evidence).replace(/\|/g, '\\|') : null;
      cells[col.ac] = evidence
        ? `${escapedSummary} no longer reproduces: ${evidence}`
        : `${escapedSummary} no longer reproduces`;
    }
    newRows.push({ cells, after: r.after, ref: r.ref, earlierId });
    added.push(id);
    groundingEntries.push({ id, files: allFiles });
    if (r.ref) {
      existingObsKeys.add(`${r.ref}@${r.ts}`);
      refToId.set(r.ref, id);
    }
  }
  if (!newRows.length) return { added, skipped: promo.length };

  if (col.deps >= 0) {
    for (const row of newRows) {
      const ids = [];
      if (Array.isArray(row.after)) {
        // `after` (plan blockers only) names sibling refs, resolved to promoted ids --
        // including one promoted anywhere in this same call. A plan's `After` column names
        // blockers by bare id (`B1`), so a plan row also tries `plan:<id>` before giving up.
        for (const a of row.after) {
          const hit = refToId.get(a)
            || (row.ref && row.ref.startsWith('plan:') && !String(a).startsWith('plan:')
              ? refToId.get(`plan:${a}`) : undefined);
          if (hit && !ids.includes(hit)) ids.push(hit);
        }
      }
      if (row.earlierId && !ids.includes(row.earlierId)) ids.push(row.earlierId);
      if (ids.length) row.cells[col.deps] = ids.join(', ');
    }
  }

  lines.splice(lastRow + 1, 0, ...newRows.map((row) => `| ${row.cells.join(' | ')} |`));
  // Grounding is inserted AFTER the row splice, and re-locates its section from scratch on
  // the now-mutated `lines` — never reuses `headIdx`/`lastRow`, which point at the task
  // table and are meaningless once used as an index into the Task Grounding section.
  insertGroundingBlocks(lines, groundingEntries);
  try { fs.writeFileSync(trdPath, lines.join('\n'), 'utf-8'); } catch { return { added: [], skipped: promo.length }; }
  return { added, skipped: promo.length - added.length };
}

// ---------------------------------------------------------------------------
// Grounding emission for promoted tasks
// ---------------------------------------------------------------------------

/** Same heading regex trd-parser.js uses (`^(#{1,6})\s+(.*?)\s*$`), duplicated rather than
 *  imported: this module has no other dependency on trd-parser.js and pulling one in just
 *  for a one-line regex would make a promote-time write depend on a parse-time module. */
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;

/**
 * Find the LAST heading whose text contains `phrase` (case-insensitive), and the line span
 * it owns — mirrors trd-parser.js's `findSection(..., {strategy: 'last'})`, which is what
 * `Task Grounding` is matched with there too (see its comment: prefer the last match over an
 * accidental earlier collision). Returns null when no such heading exists.
 */
function findLastSectionByPhrase(lines, phrase) {
  let found = null;
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const lvl = m[1].length;
    const text = m[2].trim();
    if (!text.toLowerCase().includes(phrase.toLowerCase())) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const jm = HEADING_RE.exec(lines[j]);
      if (jm && jm[1].length <= lvl) { end = j; break; }
    }
    found = { headingIndex: i, level: lvl, start: i + 1, end };
  }
  return found;
}

/**
 * Render one `### <id>` grounding block for a promoted task, in the exact bolded shape
 * `trd-parser.js`'s `BULLET_FIELD_RE` requires (`- **Touches:** ...`) — an unbolded
 * `- Touches:` parses as nothing and ships a grounding-less task with only a warning, which
 * is the defect this whole function exists to close.
 *
 * When at least one file is known, that is the entire protection `buildGraph` needs: a
 * `Touches` entry lets `computeFilePartition` see the overlap and serialize two promoted
 * tasks that land on the same file. A record naming several files (an amendment that
 * touched more than one) gets all of them on one comma-separated line -- `trd-parser.js`
 * already splits a Touches body on every backticked span, so this is not a new parsing
 * mode, just this function finally emitting what it already accepts. When NO file is
 * known, emitting a fabricated path would be worse than emitting nothing — `task-graph.js`'s
 * partition is keyed on literal path equality, so an invented placeholder would either
 * silently conflict-edge unrelated tasks (if two records happened to share the same
 * placeholder text) or just be dead weight. Instead the block is still written — so the
 * task is not invisible to `/audit-trd` or a human reading the TRD — but with no `Touches`
 * field at all, which trips trd-parser.js's own "missing the mandatory Touches field"
 * warning. That warning IS the visible absence this function is asked to produce, not a
 * decorative fallback string that would only be scraped into `touches` as a bogus
 * non-path entry.
 *
 * @param {string} id
 * @param {string[]} [files]
 * @returns {string[]} lines to splice in, including the heading and trailing blank line
 */
function groundingBlockLines(id, files) {
  const out = [`### ${id}`, ''];
  const list = Array.isArray(files) ? files.filter(Boolean) : (files ? [files] : []);
  if (list.length) {
    out.push(`- **Touches:** ${list.map((f) => `\`${f}\``).join(', ')}`);
  } else {
    out.push(
      '- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is ' +
      'written here — the file-conflict guard in `task-graph.js` cannot protect this task ' +
      'from a concurrent one until an owner fills in `Touches` by hand. Until then this task ' +
      'has no inferred conflict edges and may be scheduled alongside anything.'
    );
  }
  out.push('');
  return out;
}

/**
 * Insert grounding blocks for newly-promoted tasks into the TRD's `Task Grounding` section,
 * creating that section at the end of the document if none exists yet.
 *
 * @param {string[]} lines                  the TRD, already split on '\n' (mutated in place)
 * @param {Array<{id: string, files?: string[]}>} entries
 */
function insertGroundingBlocks(lines, entries) {
  if (!entries.length) return;
  const blockLines = [];
  for (const { id, files } of entries) blockLines.push(...groundingBlockLines(id, files));

  const section = findLastSectionByPhrase(lines, 'Task Grounding');
  if (section) {
    let at = section.end;
    if (at > 0 && lines[at - 1].trim() !== '') {
      lines.splice(at, 0, '');
      at += 1;
    }
    lines.splice(at, 0, ...blockLines);
  } else {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push('## Task Grounding', '', ...blockLines);
  }
}

function ledgerPath(stateDir) {
  return path.join(stateDir, 'discovered.jsonl');
}

/**
 * Append one discovery. Returns true if written.
 *
 * Swallows its own errors: a run must never fail because it could not record a
 * side-finding. A lost discovery costs a note; a thrown error costs the phase.
 */
function record(stateDir, entry, nowIso) {
  if (!stateDir || !entry || !entry.summary) return false;
  try {
    fs.mkdirSync(stateDir, { recursive: true });
  } catch {
    return false;
  }

  const row = {
    ts: nowIso || new Date().toISOString(),
    kind: KINDS.includes(entry.kind) ? entry.kind : 'gap',
    // Which task was running when this surfaced. The single most useful field for a
    // human triaging later, and the one an agent is most likely to omit.
    foundBy: String(entry.foundBy || 'unknown').slice(0, 60),
    phase: Number.isInteger(entry.phase) ? entry.phase : null,
    summary: String(entry.summary).slice(0, 400),
  };
  // RELEVANCE. The counterfactual, answered at record time by whoever found it: would the
  // TRD's objectives be satisfied with this left alone? A discovery that BLOCKS is work this
  // feature cannot ship without, and is promotable to a task. One that does not is a genuine
  // finding to report and nothing more.
  //
  // This exists because "layer in whatever we found" is how a fix becomes a feature. The
  // same rule governs /plan section 2f ("the test is dependency, not tidiness"), and
  // the measured failure there was absorbing an audit's corrections as scope until a 2-task
  // fix sized 4 and escalated. Default FALSE: a discovery is a note unless someone says
  // otherwise, because the expensive mistake is promoting an unrelated bug into the plan.
  row.blocksFeature = entry.blocksFeature === true;
  if (entry.file) row.file = String(entry.file).slice(0, 200);
  // `files` is the escape hatch for a discovery that implicates more than the one path
  // `file` carries -- an amendment touching several files at once. Optional, capped so a
  // careless caller cannot blow the MAX_LINE_BYTES budget below.
  if (Array.isArray(entry.files) && entry.files.length) {
    row.files = entry.files.map((f) => String(f).slice(0, 200)).slice(0, 20);
  }
  if (entry.evidence) row.evidence = String(entry.evidence).slice(0, 400);
  if (VERIFICATION_STATUSES.includes(entry.status)) row.status = entry.status;
  // D5: the criterion id (or `plan:<blocker id>`) this record is an observation OF. Optional
  // -- an ordinary bug/gap discovery carries none of this. Added here, before the truncation
  // ladder below, so both fields count toward MAX_LINE_BYTES like `file`/`files` do; like
  // those two, they are never dropped by the ladder, only `evidence` and `summary` are.
  if (entry.ref) row.ref = String(entry.ref).slice(0, 80);
  // `after` -- refs this row's plan blocker follows -- is the escape hatch for blocker
  // ordering (plan blockers only), mirroring `files`' cap-and-slice shape.
  if (Array.isArray(entry.after) && entry.after.length) {
    row.after = entry.after.map((a) => String(a).slice(0, 80)).slice(0, 20);
  }

  let line = JSON.stringify(row);
  if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
    delete row.evidence;
    line = JSON.stringify(row);
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      row.summary = row.summary.slice(0, 200);
      line = JSON.stringify(row);
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) return false;
    }
  }

  try {
    fs.appendFileSync(ledgerPath(stateDir), line + '\n');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read every discovery. A malformed line is skipped rather than throwing — a
 * truncated final line from a killed run must not blind the reader to the rest.
 */
function readAll(stateDir) {
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath(stateDir), 'utf-8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row === 'object' && row.summary) rows.push(row);
    } catch {
      /* skip */
    }
  }
  return rows;
}

/**
 * Render for a PHASE banner or the completion report.
 *
 * Returns '' when there is nothing — an empty section in a banner reads as "checked,
 * found none" when in fact nothing was recorded, and those are different claims.
 */
function render(stateDir, { phase = null } = {}) {
  const rows = readAll(stateDir).filter((r) => phase === null || r.phase === phase);
  if (rows.length === 0) return '';

  const byKind = {};
  for (const r of rows) (byKind[r.kind] = byKind[r.kind] || []).push(r);

  // NOT "this run" — the ledger is append-only across every invocation of this feature's
  // implement loop, so a completion-time call with no `phase` filter renders everything ever
  // recorded, including items from weeks-old runs. The header used to claim "this run found",
  // which reads as a fresh count and was wrong by construction: there is no per-run or
  // resolved/unresolved distinction here to filter on (a promoted discovery is never marked
  // back in this ledger), so all recorded items still show until someone acts on them.
  const lines = [`DISCOVERED — ${rows.length} item(s) recorded for this feature, not yet acted on:`];
  for (const kind of KINDS) {
    for (const r of byKind[kind] || []) {
      const where = r.file ? ` (${r.file})` : '';
      lines.push(`  [${kind}] ${r.foundBy}${where}: ${r.summary}`);
    }
  }
  lines.push('  These are RECORDS, not tasks. To act on one, add it to the TRD and');
  lines.push('  re-run with --resume; the graph is rebuilt from the TRD every invocation.');
  return lines.join('\n');
}

module.exports = {
  promotable,
  promoteToTrd, record, readAll, render, ledgerPath, KINDS, MAX_LINE_BYTES,
  VERIFICATION_STATUSES, PROMOTABLE_STATUSES };
