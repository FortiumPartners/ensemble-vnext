'use strict';

/**
 * trd-parser.js — deterministic markdown -> records for TRD documents.
 *
 * No interpretation, no LLM-shaped guessing. Markdown in, records out. Ambiguity goes to
 * `warnings`, never to a silent default. See `docs/TRD/implement-trd-rework.md` §3.1 for the
 * binding spec and `docs/modernization/runs/item8/sunstone-read.md` for what was deliberately
 * NOT ported from the Sunstone reference implementation (checklist task shape, hard-coded
 * `TRD-` prefix, exact-match headings, synthetic "validation" tasks, "never throws").
 */

// ---------------------------------------------------------------------------
// Regexes
// ---------------------------------------------------------------------------

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;
const TABLE_ROW_RE = /^\s*\|(.*)\|\s*$/;
// A separator row is made only of pipes, dashes, colons and whitespace, e.g. `|---|:---:|`.
const SEPARATOR_ROW_RE = /^[\s|:-]+$/;
const PHASE_TEXT_RE = /Phase\s+(\d+)/i;
// Task-ID-shaped token: PREFIX-SUFFIX, optionally with a `..SUFFIX2` range tail
// (e.g. "DISC-P001..P004"). Deliberately not expanded — the range is captured as one token
// rather than fabricated into two, per the "no interpretation" rule.
const ID_TOKEN_RE = /[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+(?:\.\.[A-Za-z0-9]+)?/g;
const LIVE_MARKER_RE = /\[LIVE\]/;
const OWNER_ONLY_RE = /owner-only|owner ruling/i;
// The label may carry a parenthetical qualifier before its closing colon, e.g.
// "**Careful (delivery — now owned by ITR-B014, v1.1.0):**" — match past it, non-greedily.
const BULLET_FIELD_RE = /^\s*-\s+\*\*(Touches|Reuse|Replaces|Follow|Careful)[^*]*?:\*\*\s*(.*)$/i;
const ANY_BULLET_RE = /^\s*-\s+/;
const NUMBERED_SUBITEM_RE = /(?:^|\n)\s*\d+\.\s+/;

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------

/** Normalize CRLF/CR to LF. Every heading/table regex below is line-anchored ($-anchored via
 * trim), and a lone `\r` left in the buffer is invisible to `.` in a way that breaks matches
 * that otherwise look correct when trimmed — see sunstone-read.md's "Adopt" list. */
function normalizeLineEndings(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function headingLevel(line) {
  const m = HEADING_RE.exec(line);
  return m ? m[1].length : null;
}

function headingText(line) {
  const m = HEADING_RE.exec(line);
  return m ? m[2].trim() : null;
}

/** Loose heading match: text CONTAINS phrase, case-insensitive, at any heading level, with or
 * without a leading number/separator. Applied uniformly — including to the Master Task List
 * heading, which the Sunstone reference does not do (and is why it silently misparses its own
 * "## 2. Master Task List"-numbered TRDs). */
function headingContains(text, phrase) {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

/** Strip markdown emphasis/code markers from a cell of text: `**bold**`, `~~strike~~`, `` `code` ``. */
function stripMarkup(text) {
  return text.replace(/~~/g, '').replace(/\*\*/g, '').replace(/`/g, '').trim();
}

function isStruckThrough(rawCell) {
  const t = rawCell.trim();
  return /^~~.*~~$/.test(t);
}

/** Split a table row line into trimmed cell strings. Handles a leading/trailing pipe and
 * `\|` escaped pipes inside a cell. */
function splitRowCells(line) {
  const m = TABLE_ROW_RE.exec(line);
  const inner = m ? m[1] : line;
  const cells = [];
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && inner[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function splitLines(markdown) {
  return normalizeLineEndings(markdown).split('\n');
}

// ---------------------------------------------------------------------------
// Section / table extraction
// ---------------------------------------------------------------------------

/**
 * Find the first heading whose text loosely contains `phrase`, and the span of lines it owns
 * (up to, but not including, the next heading whose level is <= the found heading's level).
 * Returns null when no such heading exists.
 */
/**
 * `strategy: 'first'` (default) returns the first matching heading. `strategy: 'last'` returns
 * the last one — used for "Could Not Verify" / "Open Questions", which trd-authoring.md places
 * as terminal sections and which are also the two headings most likely to appear quoted inline
 * in prose describing this very matching rule (e.g. a line-wrapped `` `## Open Questions` ``
 * inside a sentence forms a syntactically real, but unintended, ATX heading — observed at
 * implement-trd-rework.md:85). Preferring the last match favours the canonical terminal section
 * over an accidental collision earlier in the document.
 */
function findSection(lines, phrase, { fromIndex = 0, strategy = 'first' } = {}) {
  let found = null;
  for (let i = fromIndex; i < lines.length; i++) {
    const lvl = headingLevel(lines[i]);
    if (lvl == null) continue;
    const text = headingText(lines[i]);
    if (text && headingContains(text, phrase)) {
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        const jLvl = headingLevel(lines[j]);
        if (jLvl != null && jLvl <= lvl) {
          end = j;
          break;
        }
      }
      const section = { headingIndex: i, level: lvl, text, start: i + 1, end };
      if (strategy === 'first') return section;
      found = section; // strategy === 'last': keep overwriting, return the final one found
    }
  }
  return found;
}

/**
 * Scan [start, end) for GFM-style tables: a `|`-delimited header row immediately followed by a
 * separator row, then data rows until a non-table line. Multiple tables in one span are all
 * returned, in document order.
 */
function findTables(lines, start, end) {
  const tables = [];
  let i = start;
  while (i < end) {
    const line = lines[i];
    if (
      TABLE_ROW_RE.test(line) &&
      i + 1 < end &&
      TABLE_ROW_RE.test(lines[i + 1]) &&
      SEPARATOR_ROW_RE.test(lines[i + 1])
    ) {
      const headerCells = splitRowCells(line);
      const headerLine = i;
      let j = i + 2;
      const dataRows = [];
      while (j < end && TABLE_ROW_RE.test(lines[j])) {
        dataRows.push({ line: j, cells: splitRowCells(lines[j]) });
        j++;
      }
      tables.push({ headerLine, headerCells, dataRows });
      i = j;
      continue;
    }
    i++;
  }
  return tables;
}

/** Is `header` an "ID" column? Deliberately narrow (`id` / `task id`, whole-word) rather than a
 * bare substring test — `.includes('id')` also matches inside "Provided", "evidence", "Rapid",
 * etc., which silently steals the id role from later, unrelated columns in some tables. */
function isIdHeader(header) {
  return /^(task\s+)?id$/i.test(header.trim());
}

/** Word-boundary substring test — avoids "verdict".includes(...) style false positives that a
 * bare `.includes()` on short keywords is prone to. */
function headerHasWord(header, word) {
  return new RegExp(`\\b${word}`, 'i').test(header);
}

/** Map a table's own header row to column roles. Column identity is keyed on THIS table's
 * header, not a fixed width or a fixed schema — a 5-column and a 6-column Master Task List
 * table are both valid, per §3.1's resolution of the discipline-judgment.md/implement-trd-rework.md
 * disagreement. First matching column wins each role; later columns never steal it. */
function mapTaskColumns(headerCells) {
  const roles = {};
  headerCells.forEach((raw, idx) => {
    const h = raw.toLowerCase();
    if (roles.id === undefined && isIdHeader(raw)) roles.id = idx;
    else if (roles.description === undefined && headerHasWord(h, 'description')) roles.description = idx;
    else if (roles.taskTitle === undefined && headerHasWord(h, 'task')) roles.taskTitle = idx;
    else if (roles.serves === undefined && headerHasWord(h, 'serves')) roles.serves = idx;
    else if (roles.skills === undefined && headerHasWord(h, 'skills')) roles.skills = idx;
    else if (roles.dependencies === undefined && headerHasWord(h, 'dependenc')) roles.dependencies = idx;
    else if (roles.acceptance === undefined && headerHasWord(h, 'acceptance')) roles.acceptance = idx;
  });
  return roles;
}

function mapOpenQuestionColumns(headerCells) {
  const roles = {};
  headerCells.forEach((raw, idx) => {
    if (roles.id === undefined && isIdHeader(raw)) roles.id = idx;
    else if (roles.question === undefined && headerHasWord(raw, 'question')) roles.question = idx;
  });
  // "assumed" column: prefer an explicit default/ships column, then a bare answer, then a verdict.
  const priorities = ['default', 'answer', 'verdict'];
  for (const p of priorities) {
    const idx = headerCells.findIndex((c) => headerHasWord(c, p));
    if (idx !== -1) {
      roles.assumed = idx;
      break;
    }
  }
  return roles;
}

function mapCouldNotVerifyColumns(headerCells) {
  const roles = {};
  headerCells.forEach((raw, idx) => {
    const h = raw.toLowerCase();
    if (roles.claim === undefined && headerHasWord(h, 'claim')) roles.claim = idx;
    else if (roles.check === undefined && (headerHasWord(h, 'why') || headerHasWord(h, 'how') || headerHasWord(h, 'check')))
      roles.check = idx;
  });
  // Fallback for a plain two-column table with no matching header text.
  if (roles.claim === undefined && headerCells.length >= 1) roles.claim = 0;
  if (roles.check === undefined && headerCells.length >= 2) roles.check = 1;
  return roles;
}

// ---------------------------------------------------------------------------
// Cell-level parsing
// ---------------------------------------------------------------------------

function parseCommaList(rawCell) {
  const cleaned = stripMarkup(rawCell);
  if (!cleaned) return [];
  return cleaned
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDependencies(rawCell) {
  const cleaned = stripMarkup(rawCell);
  if (!cleaned || /^none$/i.test(cleaned)) return [];
  const matches = cleaned.match(ID_TOKEN_RE);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

// ---------------------------------------------------------------------------
// Master Task List -> tasks + phases
// ---------------------------------------------------------------------------

function parseMasterTaskList(lines, warnings, filePath) {
  const section = findSection(lines, 'Master Task List');
  if (!section) {
    const where = filePath ? ` in ${filePath}` : '';
    throw new Error(`No "Master Task List" heading found${where}`);
  }

  // Split the section into phase spans. Phase headings are matched by TEXT ("Phase <n>"),
  // never by section number, and the separator between the number and the name is not fixed
  // (":" vs em-dash vs plain "-"). See §3.1.
  const phaseHeadings = [];
  for (let i = section.start; i < section.end; i++) {
    const lvl = headingLevel(lines[i]);
    if (lvl == null) continue;
    const text = headingText(lines[i]);
    const m = text && PHASE_TEXT_RE.exec(text);
    if (m) phaseHeadings.push({ index: i, level: lvl, num: Number(m[1]), text });
  }

  const phases = {};
  const phaseSpans = [];

  if (phaseHeadings.length === 0) {
    // No phase headings at all — single implicit phase covering the whole section. This is a
    // structural default (no content was guessed), not an interpretation of task content.
    phases[1] = null;
    phaseSpans.push({ num: 1, start: section.start, end: section.end });
    warnings.push(
      'No "Phase <n>" heading found in Master Task List section; all tasks assigned to phase 1'
    );
  } else {
    for (let k = 0; k < phaseHeadings.length; k++) {
      const ph = phaseHeadings[k];
      let end = section.end;
      for (let n = k + 1; n < phaseHeadings.length; n++) {
        if (phaseHeadings[n].level <= ph.level) {
          end = phaseHeadings[n].index;
          break;
        }
      }
      // Also stop at any non-phase heading of level <= this phase heading's level.
      for (let j = ph.index + 1; j < end; j++) {
        const jLvl = headingLevel(lines[j]);
        if (jLvl != null && jLvl <= ph.level) {
          end = j;
          break;
        }
      }
      if (!(ph.num in phases)) {
        // Name = whatever follows the "Phase <n>" token in the heading text, with its
        // separator stripped. Anything BEFORE "Phase <n>" (a section number like "4.2 ") is
        // discarded too — the section number is not part of the phase's name.
        const m = PHASE_TEXT_RE.exec(ph.text);
        const afterPhaseToken = m ? ph.text.slice(m.index + m[0].length) : ph.text;
        const name = afterPhaseToken.replace(/^\s*[:—–-]\s*/, '').trim();
        phases[ph.num] = name || null;
      }
      phaseSpans.push({ num: ph.num, start: ph.index + 1, end });
    }
  }

  const tasks = [];
  const seenIds = new Map(); // id -> true, first occurrence wins

  for (const span of phaseSpans) {
    const tables = findTables(lines, span.start, span.end);
    for (const table of tables) {
      const roles = mapTaskColumns(table.headerCells);
      if (roles.id === undefined) continue; // not a task table (no ID-shaped column)
      const expectedCols = table.headerCells.length;

      for (const row of table.dataRows) {
        if (row.cells.length !== expectedCols) {
          warnings.push(
            `Malformed table row (expected ${expectedCols} columns, got ${row.cells.length}) at line ${
              row.line + 1
            }`
          );
          continue;
        }

        const rawId = row.cells[roles.id];
        if (isStruckThrough(rawId)) continue; // retirement record, not a live task

        const id = stripMarkup(rawId);
        if (!id) continue;

        if (seenIds.has(id)) {
          warnings.push(`Duplicate task id: ${id} (kept first occurrence, ignored row at line ${row.line + 1})`);
          continue;
        }
        seenIds.set(id, true);

        const descriptionCell = roles.description !== undefined ? row.cells[roles.description] : '';
        const taskTitleCell = roles.taskTitle !== undefined ? row.cells[roles.taskTitle] : '';
        let description;
        if (taskTitleCell && descriptionCell) {
          description = `${stripMarkup(taskTitleCell)}: ${stripMarkup(descriptionCell)}`;
        } else if (descriptionCell) {
          description = stripMarkup(descriptionCell);
        } else {
          description = stripMarkup(taskTitleCell);
        }

        const rawDescriptionForLiveCheck = `${taskTitleCell} ${descriptionCell}`;

        tasks.push({
          id,
          description,
          serves: roles.serves !== undefined ? parseCommaList(row.cells[roles.serves]) : [],
          skills: roles.skills !== undefined ? parseCommaList(row.cells[roles.skills]) : [],
          dependencies:
            roles.dependencies !== undefined ? parseDependencies(row.cells[roles.dependencies]) : [],
          acceptance: roles.acceptance !== undefined ? stripMarkup(row.cells[roles.acceptance]) : '',
          phase: span.num,
          live: LIVE_MARKER_RE.test(rawDescriptionForLiveCheck),
        });
      }
    }
  }

  // Unknown dependency IDs -> warning, not fatal. The graph module decides whether it matters.
  // Range-notation tokens (e.g. "DISC-P001..P004") are not individually verifiable and are
  // skipped rather than flagged as unknown.
  const knownIds = new Set(tasks.map((t) => t.id));
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (dep.includes('..')) continue;
      if (dep === task.id) continue;
      if (!knownIds.has(dep)) {
        warnings.push(`Task ${task.id} depends on unknown task id: ${dep}`);
      }
    }
  }

  return { tasks, phases };
}

// ---------------------------------------------------------------------------
// Task Grounding (§10 of trd-authoring.md; "## 9. Task Grounding" in practice)
// ---------------------------------------------------------------------------

const GROUNDING_FIELD_KEYS = {
  touches: 'touches',
  reuse: 'reuse',
  replaces: 'replaces',
  follow: 'follow',
  careful: 'careful',
};

function splitGroundingFieldBody(label, body) {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (label === 'touches') {
    const backticked = trimmed.match(/`([^`]+)`/g);
      if (backticked) {
        // Not every backticked span in a Touches body is a path. Grounding prose carries
        // evidence markers and symbol names in the same code spans -- [ran cmp] and
        // smoke_write_trd() both surfaced as "files" before this filter, which fabricates
        // conflict edges: task-graph.js then serializes two tasks that share nothing. A false
        // conflict costs parallelism silently, which is the harder failure to notice.
        const isPathLike = (t) => t.includes('/') || /\.[A-Za-z0-9]{1,6}$/.test(t);
        return Array.from(
          new Set(backticked.map((s) => s.replace(/`/g, '').trim()))
        ).filter((t) => t && isPathLike(t));
      }
    return trimmed
      .split(',')
      .map((s) => stripMarkup(s))
      .filter(Boolean);
  }
  if (NUMBERED_SUBITEM_RE.test(trimmed)) {
    return trimmed
      .split(NUMBERED_SUBITEM_RE)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [trimmed];
}

function parseGrounding(lines, tasks, warnings) {
  const grounding = {};
  const section = findSection(lines, 'Task Grounding');
  if (!section) return grounding;

  // Per-task grounding blocks are subheadings within the section, one per task ID, e.g.
  // "### ITR-B001 — `packages/core/lib/trd-parser.js`".
  const blocks = [];
  for (let i = section.start; i < section.end; i++) {
    const lvl = headingLevel(lines[i]);
    if (lvl == null) continue;
    const text = headingText(lines[i]);
    if (!text) continue;
    const m = /^`?([A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+)`?/.exec(text);
    if (!m) continue;
    let end = section.end;
    for (let j = i + 1; j < section.end; j++) {
      const jLvl = headingLevel(lines[j]);
      if (jLvl != null && jLvl <= lvl) {
        end = j;
        break;
      }
    }
    blocks.push({ id: m[1], start: i + 1, end });
  }

  for (const block of blocks) {
    if (grounding[block.id]) continue; // first occurrence wins

    const fields = { touches: [], reuse: [], replaces: [], follow: [], careful: [] };
    let currentLabel = null;
    let currentBody = '';

    const flush = () => {
      if (!currentLabel) return;
      const key = GROUNDING_FIELD_KEYS[currentLabel.toLowerCase()];
      // A label (e.g. "Careful") may appear more than once in one block — append rather than
      // overwrite, so a second occurrence doesn't silently discard the first.
      fields[key] = fields[key].concat(splitGroundingFieldBody(key, currentBody));
      currentLabel = null;
      currentBody = '';
    };

    for (let i = block.start; i < block.end; i++) {
      const line = lines[i];
      const fieldMatch = BULLET_FIELD_RE.exec(line);
      if (fieldMatch) {
        flush();
        currentLabel = fieldMatch[1];
        currentBody = fieldMatch[2];
        continue;
      }
      if (currentLabel) {
        if (ANY_BULLET_RE.test(line) && !/^\s{2,}/.test(line)) {
          // A new, unrecognized top-level bullet ends the current field's body.
          flush();
          continue;
        }
        currentBody += '\n' + line;
      }
    }
    flush();

    const result = {};
    for (const key of Object.keys(fields)) {
      if (fields[key].length > 0) result[key] = fields[key];
    }
    if (!result.touches) {
      warnings.push(`Grounding block for ${block.id} is missing the mandatory Touches field`);
      result.touches = [];
    }
    grounding[block.id] = result;
  }

  return grounding;
}

// ---------------------------------------------------------------------------
// Open Questions
// ---------------------------------------------------------------------------

function parseOpenQuestions(lines, warnings) {
  const section = findSection(lines, 'Open Questions', { strategy: 'last' });
  if (!section) return [];

  const results = [];
  const tables = findTables(lines, section.start, section.end);
  for (const table of tables) {
    const roles = mapOpenQuestionColumns(table.headerCells);
    if (roles.id === undefined) continue;

    // Which heading (if any) most closely precedes this table, to inherit an owner-only marker
    // stated only in the subsection heading rather than in the row text itself.
    let headingForTable = '';
    for (let j = table.headerLine; j >= section.start; j--) {
      const lvl = headingLevel(lines[j]);
      if (lvl != null) {
        headingForTable = headingText(lines[j]) || '';
        break;
      }
    }

    for (const row of table.dataRows) {
      if (row.cells.length !== table.headerCells.length) {
        warnings.push(
          `Malformed Open Questions row (expected ${table.headerCells.length} columns, got ${
            row.cells.length
          }) at line ${row.line + 1}`
        );
        continue;
      }
      const id = stripMarkup(row.cells[roles.id]);
      if (!id) continue;
      const question = roles.question !== undefined ? stripMarkup(row.cells[roles.question]) : '';
      const assumed = roles.assumed !== undefined ? stripMarkup(row.cells[roles.assumed]) : '';
      const rawRowText = row.cells.join(' ');
      const ownerOnly = OWNER_ONLY_RE.test(rawRowText) || OWNER_ONLY_RE.test(headingForTable);
      results.push({ id, question, assumed, ownerOnly });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Could Not Verify
// ---------------------------------------------------------------------------

function parseCouldNotVerify(lines, warnings) {
  const section = findSection(lines, 'Could Not Verify', { strategy: 'last' });
  if (!section) return [];

  const results = [];
  const tables = findTables(lines, section.start, section.end);
  for (const table of tables) {
    const roles = mapCouldNotVerifyColumns(table.headerCells);
    if (roles.claim === undefined || roles.check === undefined) continue;
    for (const row of table.dataRows) {
      if (row.cells.length !== table.headerCells.length) {
        warnings.push(
          `Malformed Could Not Verify row (expected ${table.headerCells.length} columns, got ${
            row.cells.length
          }) at line ${row.line + 1}`
        );
        continue;
      }
      const claim = stripMarkup(row.cells[roles.claim]);
      const check = stripMarkup(row.cells[roles.check]);
      if (!claim && !check) continue;
      results.push({ claim, check });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {string} markdown  full TRD text
 * @param {{path?: string}} [opts]
 * @returns {{
 *   tasks: object[],
 *   phases: Object<number,string|null>,
 *   grounding: Object<string,object>,
 *   couldNotVerify: {claim:string, check:string}[],
 *   openQuestions: {id:string, question:string, assumed:string, ownerOnly:boolean}[],
 *   warnings: string[]
 * }}
 */
function parseTrd(markdown, opts = {}) {
  const warnings = [];
  const lines = splitLines(markdown);

  const { tasks, phases } = parseMasterTaskList(lines, warnings, opts.path);

  if (tasks.length === 0) {
    warnings.push(
      'Master Task List section found but zero tasks were parsed from it — check for a table shape this parser does not recognize (e.g. a bullet-list task format)'
    );
  }

  const grounding = parseGrounding(lines, tasks, warnings);
  const couldNotVerify = parseCouldNotVerify(lines, warnings);
  const openQuestions = parseOpenQuestions(lines, warnings);

  return {
    tasks,
    phases,
    grounding,
    couldNotVerify,
    openQuestions,
    warnings,
  };
}

module.exports = {
  parseTrd,
  normalizeLineEndings,
  headingContains,
  findSection,
  findTables,
  splitRowCells,
};

// Manual smoke-check entry point: `node packages/core/lib/trd-parser.js <file.md>`.
if (require.main === module) {
  const fs = require('fs');
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node trd-parser.js <path-to-trd.md>');
    process.exit(1);
  }
  const markdown = fs.readFileSync(path, 'utf8');
  const result = parseTrd(markdown, { path });
  console.log(
    JSON.stringify(
      {
        path,
        taskCount: result.tasks.length,
        phases: result.phases,
        groundingCount: Object.keys(result.grounding).length,
        openQuestionCount: result.openQuestions.length,
        couldNotVerifyCount: result.couldNotVerify.length,
        warnings: result.warnings,
      },
      null,
      2
    )
  );
}
