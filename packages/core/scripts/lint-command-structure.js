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

  // 1. frontmatter position
  const fmIdx = lines.findIndex((l) => l.trim() === '---');
  if (fmIdx > 0 && lines.slice(0, fmIdx).some((l) => /^(name|description):/.test(l.trim()))) {
    add(1, 'frontmatter', 'frontmatter keys appear before the opening --- delimiter');
  }
  if (lines.some((l) => /^name:\s*\S/.test(l)) && lines[0].trim() !== '---') {
    add(1, 'frontmatter', `file has a name: key but does not start with --- (starts with "${lines[0].slice(0, 40)}")`);
  }

  // 4. fences (needed first — list/table checks skip fenced regions)
  const fenced = new Array(lines.length).fill(false);
  let open = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) { open = !open; fenced[i] = true; return; }
    fenced[i] = open;
  });
  if (open) add(lines.length, 'fence', 'unbalanced code fence — a ``` block is never closed');

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
