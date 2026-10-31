#!/usr/bin/env node
/**
 * trd-grounding.js -- put grounding blocks and the Deferred-by-design table into a TRD with
 * deterministic code, then report what is on disk.
 *
 * Why this exists (GitHub #49): the /create-trd workflow used to ask a model agent to paste
 * grounding blocks into the TRD, and then counted what agents CLAIMED. An agent that wrote
 * nothing looked identical to one that worked. Now each grounding agent writes its blocks to
 * its own `blocks-*.md` file in a scratch directory, the sizing agent writes `sizing.json`
 * there, and this helper does the TRD write and parses the result back.
 *
 * CLI (both print one JSON object; exit 0 unless the TRD cannot be read or written):
 *
 *   node trd-grounding.js assemble --trd <path> --dir <grounding_dir>
 *   node trd-grounding.js report   --trd <path>
 *
 * Output: { trd, written, blocksFound, grounded, ungrounded, unknown, deferred, sizing }
 *   - written      true only when the TRD file's bytes changed
 *   - blocksFound  `### <TASK-ID>` blocks found across the block files (null for `report`)
 *   - grounded / ungrounded  Master Task List ids with / without a block, from a parse of the
 *                  TRD ON DISK after the write
 *   - unknown      block ids that are not in the Master Task List (dropped by `assemble`)
 *   - deferred     ids in the TRD's Deferred-by-design table
 *   - sizing       "ok" | "missing" | "invalid" (null for `report`). Absence is never read as
 *                  "nothing deferred": "missing" and "invalid" leave the TRD's table alone.
 *
 * Block files: every `*.md` in --dir whose name starts with `blocks-`, read in name order;
 * each holds one or more `### <TASK-ID>` blocks. A task id seen twice keeps its first block.
 * `assemble` is idempotent: running it twice gives a byte-identical TRD.
 *
 * Example:
 *   node .claude/lib/trd-grounding.js assemble --trd docs/TRD/x.md \
 *     --dir .trd-state/x/findings/grounding/20261030T101500Z
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseTrd,
  maskFencedLines,
  findSection,
  normalizeLineEndings,
} = require('./trd-parser');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BLOCK_FILES = 1000;
const GROUNDING_HEADING = '## 9. Task Grounding';
const DEFERRED_TITLE = 'Deferred by design';
// Same id shape trd-parser's parseGrounding accepts for a block heading.
const BLOCK_HEADING_RE = /^(#{1,6})\s+`?([A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+)`?/;
const ANY_HEADING_RE = /^(#{1,6})\s+\S/;
const INSERT_BEFORE = ['open questions', 'could not verify', 'appendices', 'appendix'];

function level(line) {
  const m = ANY_HEADING_RE.exec(line);
  return m ? m[1].length : null;
}

/** Read the `### <ID>` blocks out of one file's text. Returns [{ id, text }]. */
function parseBlocks(text) {
  const lines = normalizeLineEndings(text).split('\n');
  const masked = maskFencedLines(lines);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const m = BLOCK_HEADING_RE.exec(masked[i]);
    if (!m || m[1].length !== 3) {
      i++;
      continue;
    }
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const l = level(masked[j]);
      if (l != null && l <= 3) {
        end = j;
        break;
      }
    }
    blocks.push({ id: m[2], text: lines.slice(i, end).join('\n').replace(/\s+$/, '') });
    i = end;
  }
  return blocks;
}

/** Collect blocks from every `blocks-*.md` in dir (name order). First block per id wins. */
function readBlocks(dir) {
  const byId = new Map();
  let found = 0;
  let names = [];
  try {
    names = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith('blocks-') && n.endsWith('.md'))
      .sort()
      .slice(0, MAX_BLOCK_FILES);
  } catch (_) {
    return { byId, found };
  }
  for (const name of names) {
    const file = path.join(dir, name);
    let st;
    try {
      st = fs.lstatSync(file);
    } catch (_) {
      continue;
    }
    if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;
    for (const b of parseBlocks(fs.readFileSync(file, 'utf8'))) {
      found++;
      if (!byId.has(b.id)) byId.set(b.id, b.text);
    }
  }
  return { byId, found };
}

/** Read sizing.json. Returns { status, deferred: [{id, why}] }. */
function readSizing(dir) {
  const file = path.join(dir, 'sizing.json');
  let raw;
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) return { status: 'missing', deferred: [] };
    if (st.size > MAX_FILE_BYTES) return { status: 'invalid', deferred: [] };
    raw = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return { status: 'missing', deferred: [] };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return { status: 'invalid', deferred: [] };
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.deferred)) {
    return { status: 'invalid', deferred: [] };
  }
  const seen = new Set();
  const deferred = [];
  for (const d of data.deferred) {
    const id = d && typeof d.id === 'string' ? d.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deferred.push({ id, why: typeof d.why === 'string' ? d.why : '' });
  }
  return { status: 'ok', deferred };
}

/**
 * First section (outside fences) whose heading TITLE starts with `phrase`, ignoring a leading
 * section number and markup: "## 9. Task Grounding" matches "Task Grounding", while
 * "### Why Task Grounding moves to code" does not. Deliberately narrower than findSection's
 * contains-match: this is used to DELETE sections, and deleting a prose section that merely
 * mentions the phrase loses the owner's text.
 */
function findOwnSection(lines, phrase) {
  const want = phrase.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const lvl = level(lines[i]);
    if (lvl == null) continue;
    const title = lines[i]
      .replace(/^#+\s*/, '')
      .replace(/[*`_]/g, '')
      .replace(/^[\d.]+\s*/, '')
      .trim()
      .toLowerCase();
    if (!title.startsWith(want)) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const l = level(lines[j]);
      if (l != null && l <= lvl) {
        end = j;
        break;
      }
    }
    return { headingIndex: i, level: lvl, end };
  }
  return null;
}

/** Remove every section whose heading title is `phrase` (outside fences). */
function removeSections(lines, phrase) {
  let out = lines;
  let firstIndex = null;
  for (;;) {
    const sec = findOwnSection(maskFencedLines(out), phrase);
    if (!sec) return { lines: out, index: firstIndex };
    if (firstIndex == null) firstIndex = sec.headingIndex;
    out = out.slice(0, sec.headingIndex).concat(out.slice(sec.end));
  }
}

/** Insert `section` (heading..blank) at idx, keeping one blank line before it. */
function insertSection(lines, idx, section) {
  let out = lines.slice();
  let at = idx;
  if (at >= out.length) {
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    at = out.length;
  }
  const pre = at > 0 && out[at - 1].trim() !== '' ? [''] : [];
  out = out.slice(0, at).concat(pre, section, out.slice(at));
  return out;
}

/** Index just past the Master Task List section, plus its heading level. With no Master Task
 * List the end of the document, never index 0 (which would land above the title). */
function afterMasterList(lines) {
  const sec = findSection(maskFencedLines(lines), 'Master Task List');
  return sec ? { end: sec.end, level: sec.level } : { end: lines.length, level: 2 };
}

function writeDeferred(lines, deferred) {
  const removed = removeSections(lines, 'Deferred by design');
  const master = afterMasterList(removed.lines);
  const cell = (s) => String(s).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
  // A sibling of the Master Task List, at ITS level. A fixed `##` under a nested
  // `### Master Task List` would own every later `###` sibling: the parser then reads their
  // tables as deferred rows, and the next assemble deletes them with this section.
  const section = [
    `${'#'.repeat(master.level)} ${DEFERRED_TITLE}`,
    '',
    '| Task ID | Why it cannot run now |',
    '|---------|-----------------------|',
    ...deferred.map((d) => `| ${cell(d.id)} | ${cell(d.why)} |`),
    '',
  ];
  return insertSection(removed.lines, master.end, section);
}

function writeGrounding(lines, texts) {
  const removed = removeSections(lines, 'Task Grounding');
  let idx = removed.index;
  if (idx == null) {
    const masked = maskFencedLines(removed.lines);
    const master = afterMasterList(removed.lines);
    idx = removed.lines.length;
    for (let i = master.end; i < masked.length; i++) {
      const l = level(masked[i]);
      if (l == null || l > master.level) continue;
      const text = masked[i].replace(/^#+\s*/, '').toLowerCase();
      if (INSERT_BEFORE.some((p) => text.includes(p))) {
        idx = i;
        break;
      }
    }
  }
  const section = [GROUNDING_HEADING, ''];
  for (const t of texts) section.push(...t.split('\n'), '');
  return insertSection(removed.lines, idx, section);
}

function summarize(trdPath, markdown) {
  const parsed = parseTrd(markdown, { path: trdPath });
  const ids = parsed.tasks.map((t) => t.id);
  const known = new Set(ids);
  return {
    grounded: ids.filter((id) => parsed.grounding[id]),
    ungrounded: ids.filter((id) => !parsed.grounding[id]),
    unknown: Object.keys(parsed.grounding).filter((id) => !known.has(id)),
    deferred: parsed.deferred.map((d) => d.id),
  };
}

/** Parse-only view of the TRD on disk. */
function report(trdPath) {
  const markdown = fs.readFileSync(trdPath, 'utf8');
  return { trd: trdPath, written: false, blocksFound: null, ...summarize(trdPath, markdown), sizing: null };
}

/** Build the grounding section and Deferred table from `dir`, write the TRD, parse it back. */
function assemble(trdPath, dir) {
  const original = fs.readFileSync(trdPath, 'utf8');
  let lines = normalizeLineEndings(original).split('\n');
  const taskIds = parseTrd(original, { path: trdPath }).tasks.map((t) => t.id);
  const known = new Set(taskIds);

  const { byId, found } = readBlocks(dir);
  const dropped = [...byId.keys()].filter((id) => !known.has(id));
  const sizing = readSizing(dir);

  let touched = false;
  if (sizing.status === 'ok' && sizing.deferred.length > 0) {
    lines = writeDeferred(lines, sizing.deferred);
    touched = true;
  }
  // Task order follows the Master Task List so the output does not depend on file order.
  const kept = taskIds.filter((id) => byId.has(id)).map((id) => byId.get(id));
  if (kept.length > 0) {
    lines = writeGrounding(lines, kept);
    touched = true;
  }

  // Nothing to write leaves the file's bytes alone -- including its line endings, which the
  // split above normalised to LF.
  const next = touched ? lines.join('\n') : original;
  const changed = next !== original;
  if (changed) {
    const tmp = `${trdPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, next);
    fs.renameSync(tmp, trdPath);
  }
  const sum = summarize(trdPath, next);
  const unknown = [...new Set(dropped.concat(sum.unknown))];
  return { trd: trdPath, written: changed, blocksFound: found, ...sum, unknown, sizing: sizing.status };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--trd') out.trd = argv[++i];
    else if (argv[i] === '--dir') out.dir = argv[++i];
  }
  return out;
}

function main(argv) {
  const mode = argv[0];
  const args = parseArgs(argv);
  try {
    if (mode === 'assemble' && args.trd && args.dir) {
      process.stdout.write(JSON.stringify(assemble(args.trd, args.dir)) + '\n');
    } else if (mode === 'report' && args.trd) {
      process.stdout.write(JSON.stringify(report(args.trd)) + '\n');
    } else {
      process.stderr.write(
        'usage: trd-grounding.js assemble --trd <path> --dir <grounding_dir> | report --trd <path>\n'
      );
      return 2;
    }
  } catch (e) {
    process.stderr.write(`trd-grounding: ${e.message}\n`);
    return 1;
  }
  return 0;
}

module.exports = { assemble, report, parseBlocks, readBlocks, readSizing };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
