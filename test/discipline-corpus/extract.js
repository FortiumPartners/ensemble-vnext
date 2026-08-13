#!/usr/bin/env node
/**
 * extract.js — pulls real final-assistant-message text out of local Claude Code
 * transcripts into candidate corpus cases for the discipline-hook judgment corpus
 * (docs/TRD/discipline-judgment.md §3.1, task DISC-B001).
 *
 * Extraction only. Labeling (`label`, `class`) is DISC-B002's job — this script
 * always emits `label: null, class: "unlabeled"`.
 *
 * Why real transcripts (not authored examples): the bug this corpus exists to
 * catch is that the old regex patterns and their tests shared one author's
 * vocabulary ("waiting for" vs. a live miss of "waiting on"), so the tests
 * confirmed the blind spot instead of exposing it. Authored cases would
 * reproduce the same blind spot. See TRD D3.
 *
 * Usage:
 *   node extract.js [--limit N] [--out <path>] [--since <ISO date>] [--redact | --no-redact]
 *                    [--include-unconfirmed]
 *
 * stop_reason filtering (added after a corpus-repair finding, see README "Confirmed
 * vs unconfirmed finals"): a JSONL assistant record's `message.stop_reason` tells you
 * whether the turn actually finished there. `end_turn` means it did. `tool_use` means
 * the record's text (if any) was a mid-turn preamble before a tool call — the turn kept
 * going, so no Stop/SubagentStop hook ever fired on that text. `null` showed up on
 * ~16% of a 400-transcript sample and correlates with an interrupted/incomplete
 * generation rather than a cleanly finished one. By default this script only emits
 * `end_turn` finals — the only ones a real hook could have fired on. Pass
 * `--include-unconfirmed` to also keep `null`/`tool_use` finals; every case records its
 * `stop_reason` so the distinction stays visible in the corpus rather than silently
 * baked into which cases exist at all.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');

const HOME = os.homedir();
const PROJECTS_ROOT = path.join(HOME, '.claude', 'projects');
const DEFAULT_OUT = path.join(__dirname, 'candidates.jsonl');
const MAX_TEXT_CHARS = 4000;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    limit: Infinity,
    out: DEFAULT_OUT,
    since: null,
    redact: true,
    includeUnconfirmed: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') {
      opts.limit = parseInt(argv[++i], 10);
      if (!Number.isFinite(opts.limit) || opts.limit < 0) {
        throw new Error(`--limit must be a non-negative integer, got: ${argv[i]}`);
      }
    } else if (a === '--out') {
      opts.out = path.resolve(argv[++i]);
    } else if (a === '--since') {
      const raw = argv[++i];
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`--since must be a parseable ISO date, got: ${raw}`);
      }
      opts.since = d;
    } else if (a === '--redact') {
      opts.redact = true;
    } else if (a === '--no-redact') {
      opts.redact = false;
    } else if (a === '--include-unconfirmed') {
      opts.includeUnconfirmed = true;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`Usage: node extract.js [--limit N] [--out <path>] [--since <ISO date>] [--redact|--no-redact]
                 [--include-unconfirmed]

  --limit N              Stop after scanning N transcripts (lead + subagent combined). Default: no limit.
  --out <path>           Output JSONL path. Default: test/discipline-corpus/candidates.jsonl
  --since <date>         Only consider transcripts whose final assistant record timestamp is >= date.
  --redact               Drop cases matching obvious secret patterns (default: ON).
  --no-redact             Disable redaction. NOT recommended — see README privacy notes.
  --include-unconfirmed  Also emit finals whose stop_reason is "tool_use" or null (mid-turn
                          preamble / interrupted generation), not just "end_turn". Default: OFF —
                          only end_turn finals are emitted, since those are the only ones a real
                          Stop/SubagentStop hook could have fired on. Every case records its own
                          stop_reason regardless, so the distinction is always visible.
`);
}

// ---------------------------------------------------------------------------
// Secret / PII redaction (crude, deliberately conservative: when in doubt, drop)
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/, // OpenAI/Anthropic-style secret keys
  /sk-ant-[A-Za-z0-9\-_]{20,}/, // Anthropic API keys specifically
  /ghp_[A-Za-z0-9]{30,}/, // GitHub personal access token
  /gho_[A-Za-z0-9]{30,}/, // GitHub OAuth token
  /github_pat_[A-Za-z0-9_]{20,}/, // GitHub fine-grained PAT
  /AKIA[0-9A-Z]{16}/, // AWS access key ID
  /ASIA[0-9A-Z]{16}/, // AWS temporary access key ID
  /xox[baprs]-[A-Za-z0-9-]{10,}/, // Slack tokens
  /AIza[0-9A-Za-z\-_]{35}/, // Google API key
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private keys
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}=*/, // Bearer tokens
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT-shaped
  /[A-Za-z0-9+/]{60,}={0,2}/, // long base64 blob (60+ chars, high false-positive tolerance intentional)
  /\b[A-Z][A-Z0-9_]{2,}\s*=\s*['"]?[A-Za-z0-9+/=_\-]{16,}['"]?/, // KEY=value with a long value (.env-style)
];

function looksLikeSecret(text) {
  for (const re of SECRET_PATTERNS) {
    if (re.test(text)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Transcript discovery
// ---------------------------------------------------------------------------

/**
 * Returns { leadFiles: [...], subagentFiles: [...] } — absolute paths.
 * A "lead" transcript is `<projectDir>/<uuid>.jsonl` directly under a project dir
 * (not inside a `subagents/` subdirectory). A "subagent" transcript is
 * `<projectDir>/<session-uuid>/subagents/agent-*.jsonl`.
 */
function discoverTranscripts(root) {
  const lead = [];
  const subagent = [];
  if (!fs.existsSync(root)) return { lead, subagent };

  const projectDirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const projectDir of projectDirs) {
    const projectPath = path.join(root, projectDir.name);
    let entries;
    try {
      entries = fs.readdirSync(projectPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        lead.push(path.join(projectPath, entry.name));
      } else if (entry.isDirectory()) {
        const subagentsDir = path.join(projectPath, entry.name, 'subagents');
        if (fs.existsSync(subagentsDir)) {
          let subEntries;
          try {
            subEntries = fs.readdirSync(subagentsDir, { withFileTypes: true });
          } catch {
            continue;
          }
          for (const se of subEntries) {
            if (se.isFile() && se.name.startsWith('agent-') && se.name.endsWith('.jsonl')) {
              subagent.push(path.join(subagentsDir, se.name));
            }
          }
        }
      }
    }
  }
  return { lead, subagent };
}

// ---------------------------------------------------------------------------
// Per-transcript extraction
// ---------------------------------------------------------------------------

/**
 * Reads a JSONL transcript and returns the final assistant text message.
 * Returns { text, timestamp, recordUuid, stopReason, malformedLines } or null
 * if no assistant record with text content was found.
 *
 * `stopReason` is `record.message.stop_reason` from the record the text was
 * taken from: "end_turn" means the turn genuinely finished there (a real
 * Stop/SubagentStop hook could have fired on this exact text). "tool_use"
 * means this text shared a content array with a tool_use block that followed
 * it — a mid-turn preamble, not a final message; the turn kept going.
 * `null`/other correlates with an interrupted or incomplete generation.
 * Filtering on this is the caller's job (see `--include-unconfirmed`); this
 * function always reports what it found.
 */
async function extractFinalAssistantMessage(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lastAssistantText = null;
  let lastAssistantTimestamp = null;
  let lastAssistantUuid = null;
  let lastAssistantStopReason = null;
  let malformedLines = 0;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      malformedLines++;
      continue;
    }

    if (!record || record.type !== 'assistant') continue;

    const message = record.message;
    if (!message || !Array.isArray(message.content)) continue;

    const textParts = message.content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text);

    if (textParts.length === 0) {
      // Assistant record with only tool_use/thinking blocks (mid-turn, no final
      // text yet) — not a candidate final message on its own, but don't lose
      // track of it; a later assistant record in the same turn may carry the text.
      continue;
    }

    lastAssistantText = textParts.join('\n\n').trim();
    lastAssistantTimestamp = record.timestamp || null;
    lastAssistantUuid = record.uuid || null;
    lastAssistantStopReason = message.stop_reason ?? null;
  }

  if (!lastAssistantText) return null;

  return {
    text: lastAssistantText,
    timestamp: lastAssistantTimestamp,
    recordUuid: lastAssistantUuid,
    stopReason: lastAssistantStopReason,
    malformedLines,
  };
}

// ---------------------------------------------------------------------------
// Crude triage heuristic (NOT a label — DISC-B002 assigns real labels/classes)
// ---------------------------------------------------------------------------

const DEFERRAL_ISH_RE =
  /\b(I'?ll (let you know|notify you|report back|check back|come back)|running in the background|happening in the background|running (asynchronously|async)|executing asynchronously|will (let you know|notify|report back)|when it'?s (done|complete|finished|ready))\b/i;

function crudeTriageBucket(text) {
  return DEFERRAL_ISH_RE.test(text) ? 'deferral-ish' : 'clean-looking';
}

// ---------------------------------------------------------------------------
// Provenance / id helpers
// ---------------------------------------------------------------------------

function relativizeSource(filePath) {
  const rel = path.relative(PROJECTS_ROOT, filePath);
  return `projects/${rel.split(path.sep).join('/')}`;
}

function makeId(source, recordUuid, text) {
  const hash = crypto
    .createHash('sha1')
    .update(`${source}#${recordUuid || ''}#${text}`)
    .digest('hex')
    .slice(0, 12);
  return `c-${hash}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const { lead, subagent } = discoverTranscripts(PROJECTS_ROOT);
  let allFiles = [
    ...lead.map((f) => ({ file: f, event: 'Stop' })),
    ...subagent.map((f) => ({ file: f, event: 'SubagentStop' })),
  ];

  if (Number.isFinite(opts.limit)) {
    allFiles = allFiles.slice(0, opts.limit);
  }

  const seenTextHashes = new Set();
  const cases = [];

  const counts = {
    transcriptsScanned: 0,
    candidatesProduced: 0,
    droppedEmpty: 0,
    droppedDuplicate: 0,
    droppedRedacted: 0,
    droppedNoAssistantText: 0,
    droppedSince: 0,
    droppedUnconfirmedStopReason: 0,
    malformedLinesTotal: 0,
    truncated: 0,
  };
  const stopReasonCounts = {};
  const triage = { 'deferral-ish': 0, 'clean-looking': 0 };

  for (const { file, event } of allFiles) {
    counts.transcriptsScanned++;

    let result;
    try {
      result = await extractFinalAssistantMessage(file);
    } catch (err) {
      // Unreadable file (permissions, binary garbage, etc.) — skip, don't crash.
      counts.droppedNoAssistantText++;
      continue;
    }

    if (!result) {
      counts.droppedNoAssistantText++;
      continue;
    }

    counts.malformedLinesTotal += result.malformedLines;

    const stopReasonKey = result.stopReason === null ? 'null' : result.stopReason;
    stopReasonCounts[stopReasonKey] = (stopReasonCounts[stopReasonKey] || 0) + 1;

    const text = result.text.trim();
    if (!text) {
      counts.droppedEmpty++;
      continue;
    }

    if (result.stopReason !== 'end_turn' && !opts.includeUnconfirmed) {
      counts.droppedUnconfirmedStopReason++;
      continue;
    }

    if (opts.since && result.timestamp) {
      const ts = new Date(result.timestamp);
      if (!Number.isNaN(ts.getTime()) && ts < opts.since) {
        counts.droppedSince++;
        continue;
      }
    }

    if (opts.redact && looksLikeSecret(text)) {
      counts.droppedRedacted++;
      continue;
    }

    const dedupeKey = crypto.createHash('sha1').update(text).digest('hex');
    if (seenTextHashes.has(dedupeKey)) {
      counts.droppedDuplicate++;
      continue;
    }
    seenTextHashes.add(dedupeKey);

    let finalText = text;
    let truncatedNote = '';
    if (finalText.length > MAX_TEXT_CHARS) {
      finalText = finalText.slice(0, MAX_TEXT_CHARS);
      truncatedNote = `truncated from ${text.length} to ${MAX_TEXT_CHARS} chars`;
      counts.truncated++;
    }

    const source = `${relativizeSource(file)}#${result.recordUuid || 'unknown'}`;
    const id = makeId(source, result.recordUuid, finalText);
    const bucket = crudeTriageBucket(finalText);
    triage[bucket]++;

    cases.push({
      id,
      source,
      event,
      text: finalText,
      label: null,
      class: 'unlabeled',
      stop_reason: result.stopReason,
      note: [truncatedNote, `triage(crude): ${bucket}`].filter(Boolean).join('; '),
    });

    counts.candidatesProduced++;
  }

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  const outLines = cases.map((c) => JSON.stringify(c)).join('\n') + (cases.length ? '\n' : '');
  fs.writeFileSync(opts.out, outLines, 'utf8');

  // ---- report ----
  console.log('=== extract.js report ===');
  console.log(`transcripts scanned:      ${counts.transcriptsScanned} (${lead.length} lead, ${subagent.length} subagent, limited to ${allFiles.length})`);
  console.log(`candidate cases written:  ${counts.candidatesProduced}`);
  console.log(`output file:              ${opts.out}`);
  console.log('');
  console.log('dropped, by reason:');
  console.log(`  no assistant text found: ${counts.droppedNoAssistantText}`);
  console.log(`  empty/whitespace-only:   ${counts.droppedEmpty}`);
  console.log(`  exact duplicate:         ${counts.droppedDuplicate}`);
  console.log(`  redacted (secret-like):  ${counts.droppedRedacted}`);
  console.log(`  before --since cutoff:   ${counts.droppedSince}`);
  console.log(`  malformed JSONL lines:   ${counts.malformedLinesTotal} (lines skipped within otherwise-usable transcripts)`);
  console.log(`  unconfirmed stop_reason: ${counts.droppedUnconfirmedStopReason} (not end_turn; pass --include-unconfirmed to keep)`);
  console.log(`  truncated (kept, >4000 chars): ${counts.truncated}`);
  console.log('');
  console.log('stop_reason distribution across ALL finals found (before the unconfirmed filter):');
  for (const [key, n] of Object.entries(stopReasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${n}`);
  }
  console.log('');
  console.log('crude triage bucketing (NOT a label — heuristic for DISC-B002 to prioritize review):');
  console.log(`  deferral-ish:   ${triage['deferral-ish']}`);
  console.log(`  clean-looking:  ${triage['clean-looking']}`);
  console.log('');
  console.log('This bucketing is a crude regex heuristic over surface phrasing, run for triage only.');
  console.log('It does not determine label/class — DISC-B002 must read and label each case.');
}

main().catch((err) => {
  console.error('extract.js failed:', err);
  process.exit(1);
});
