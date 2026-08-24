#!/usr/bin/env node
'use strict';
/**
 * lint-command-structure.js — structural checks for command/rule markdown.
 *
 * Why this exists: these files are edited by string replacement and verified by
 * grep, and grep cannot see structure. On 2026-08-21 one editing session put a
 * content block ABOVE the YAML frontmatter (an empty-slice `.replace()` inserting
 * at position 0), broke three numbered lists into 1,3,4,5 sequences, and left
 * three table rows stranded after a prose paragraph where they rendered as text.
 * Every one of those passed a grep-based check.
 *
 * Checks (each is a structural invariant, not a style preference):
 *   1. frontmatter — if a file has YAML frontmatter it must start at byte 0
 *   2. ordered-list — numbered items in one block run 1,2,3... with no gaps
 *   3. table-orphan — a pipe row must follow another row or precede a |---| rule
 *   4. fence — code fences are balanced
 *
 * Usage: lint-command-structure.js <file>...        (exit 1 on any finding)
 */
const fs = require('fs');

const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isRule = (l) => /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/.test(l);

function lint(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  const add = (n, check, msg) => out.push({ file, line: n, check, msg });

  // 1. frontmatter position — see the fenced-lines note on check 2 below. This is
  //    the SIBLING of that bug and was missed when it was fixed: a `description:`
  //    inside a fenced example, before the first `---`, read as misplaced
  //    frontmatter. Found 2026-08-24 on command-status.md's own Artifact snippet.
  //    Both checks now require the match to be OUTSIDE a fence and near the head.
  const fmIdx = lines.findIndex((l) => l.trim() === '---');

  // 4. fences (needed first — list/table checks skip fenced regions)
  //
  // Fence LENGTH matters: a block opened with ``` is closed by the next fence of
  // at least that length, so a ````-delimited block may legally contain ```
  // blocks. A tracker that toggles on every ``` reports the inner opener as the
  // outer closer, then reads the rest of the block as prose — which is exactly
  // the false positive this linter produced on update-project.md's proposal
  // template until 2026-08-22.
  const fenced = new Array(lines.length).fill(false);
  let openLen = 0;
  let openedAt = -1;
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(`{3,})/);
    if (m) {
      const len = m[1].length;
      if (openLen === 0) { openLen = len; openedAt = i; fenced[i] = true; return; }
      if (len >= openLen) { openLen = 0; fenced[i] = true; return; }
      // shorter fence inside a longer block — ordinary content
    }
    fenced[i] = openLen > 0;
  });
  if (openLen > 0) {
    add(openedAt + 1, 'fence', `unbalanced code fence — this ${'`'.repeat(openLen)} block is never closed`);
  }

  // Scope the "has frontmatter" sniff to the head of the file and to unfenced
  // lines. Scanning the whole document matched a `name:` inside a YAML EXAMPLE
  // far down a prose doc and reported the whole file as broken frontmatter —
  // seen 2026-08-22 on the improvement plan, which has no frontmatter at all.
  const headHasName = lines
    .slice(0, 20)
    .some((l, i) => !fenced[i] && /^name:\s*\S/.test(l));
  if (headHasName && lines[0].trim() !== '---') {
    add(1, 'frontmatter', `file has a name: key but does not start with --- (starts with "${lines[0].slice(0, 40)}")`);
  }

  if (
    fmIdx > 0 &&
    lines
      .slice(0, fmIdx)
      .some((l, i) => !fenced[i] && /^(name|description):/.test(l.trim()))
  ) {
    add(1, 'frontmatter', 'frontmatter keys appear before the opening --- delimiter');
  }

  // 2. ordered lists: same indent, contiguous block, must increment by 1
  let run = null;
  const flush = () => {
    if (run && run.nums.length > 1) {
      run.nums.forEach((n, i) => {
        if (n !== run.nums[0] + i) {
          add(run.lines[i], 'ordered-list',
            `numbered item ${n}. breaks the sequence (previous was ${run.nums[i - 1]}.)`);
        }
      });
    }
    run = null;
  };
  lines.forEach((l, i) => {
    if (fenced[i]) { flush(); return; }
    const m = l.match(/^(\s*)(\d+)\.\s+\S/);
    if (!m) {
      // a blank line does not end a list; anything else at column 0 does
      if (l.trim() !== '' && /^\S/.test(l) && !isRow(l)) flush();
      return;
    }
    const indent = m[1].length, num = parseInt(m[2], 10);
    if (!run || run.indent !== indent) { flush(); run = { indent, nums: [], lines: [] }; }
    run.nums.push(num); run.lines.push(i + 1);
  });
  flush();

  // 3. orphaned table rows
  lines.forEach((l, i) => {
    if (fenced[i] || !isRow(l)) return;
    const prev = lines[i - 1] || '', next = lines[i + 1] || '';
    if (isRow(prev)) return;          // body row
    if (isRule(next)) return;         // header row
    add(i + 1, 'table-orphan', `pipe row is not part of a table (preceded by: "${prev.trim().slice(0, 40)}")`);
  });

  return out;
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: lint-command-structure.js <file>...'); process.exit(2); }
const findings = files.flatMap(lint);
for (const f of findings) console.error(`${f.file}:${f.line}  [${f.check}] ${f.msg}`);
console.error(findings.length
  ? `\n${findings.length} structural finding(s) across ${files.length} file(s)`
  : `structure ok: ${files.length} file(s)`);
process.exit(findings.length ? 1 : 0);
