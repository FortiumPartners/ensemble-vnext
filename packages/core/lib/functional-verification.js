'use strict';

/**
 * functional-verification.js — the deterministic half of functional verification (D3).
 *
 * Exports `checkEvidence()`, `decideNext()` and `renderReport()`, plus a CLI entry point
 * exposing all three as subcommands. See `docs/TRD/functional-verification.md` §3.2, §3.4
 * and §3.6 for the binding interface specs, and its `### FV-B001` grounding block in §9.
 *
 * The `--fix` loop (`docs/TRD/verification-fix-loop.md` §3.1, §3.5, D10) adds `CAUSES`,
 * `readStopRule()`, `decideFixRound()` and `renderFixSummary()`. `readStopRule()` is called
 * directly (it is exported for a caller with real `require`, not routed through the CLI);
 * `decideFixRound()` and `renderFixSummary()` get `decide-fix-round` and `render-fix-summary`
 * CLI subcommands, for the same prompt-DSL reason `decideNext()` and `renderReport()` do.
 *
 * This module is pure apart from `fs.statSync` and, now that `checkEvidence()` matches a
 * locator (VCON-B001), reading the artifact's own content — both gated by a byte cap
 * (`LOCATOR_SCAN_BYTES`), so no read is unbounded. The reuse path (an old artifact whose
 * declared `covers` files are byte-identical) additionally reads and hashes those covered
 * files, each under its own cap (`COVERS_HASH_BYTES`). It still uses no clock and no git —
 * `sinceSec` and `cap` are parameters, not internally computed — which is what the purity
 * claim is load-bearing for: every function here is testable without a repository or a wall
 * clock.
 *
 * Workflow scripts (`packages/core/workflows/*.js`) have no `require` — they are prompt-DSL
 * source text wrapped by `test-harness.js`, not a real Node module (D3). The CLI below is
 * therefore not a convenience: it is the *only* way `verify-functional.js`'s judge stage
 * reaches `decideNext()` and `renderReport()` (and the only way any agent reaches
 * `checkEvidence()`). A function exported here but absent from the CLI is unreachable from
 * the feature that needs it.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { maskFencedLines, findSection, parseTrd } = require('./trd-parser');
const { matchNeverUnattended } = require('./fix-sizing');
const { hashFile, COVERS_HASH_BYTES } = require('./live-evidence');

// ---------------------------------------------------------------------------
// checkEvidence — tier 1 of FR-3 (§3.2)
// ---------------------------------------------------------------------------

// The most an artifact's content is scanned for a locator match (D6). Keeps `checkEvidence`
// usable against a large artifact (e.g. a video) without a new failure mode for its size --
// the scan just stops here and the result says so via `truncated: true`.
const LOCATOR_SCAN_BYTES = 2_000_000;

// The most a single covered file is read for hashing on the reuse path is COVERS_HASH_BYTES,
// shared with live-evidence.js so the recorder rejects what this checker would never accept. A
// covered file larger than it is not reusable (it reads as changed) rather than hashed from a
// partial read, which could report identical bytes after a change past the cap.

/**
 * Whether every file in `covers` still has the sha256 recorded when the evidence was captured.
 * Content hash, not mtime: a checkout or rebase rewrites mtimes (false staleness) and a
 * retargeted symlink can dodge them (false freshness). Through the CLI, `covers` comes only from
 * the live-evidence manifest (`check-evidence --state-dir`), never from any agent's payload. Anything short of a
 * non-empty list of absolute, existing regular files with matching hashes is "not reusable".
 *
 * @param {unknown} covers - `[{path, sha256}]`
 * @param {Map<string, string|null>} [digests] - per-call memo, path -> digest: one live artifact
 *   often proves several criteria, and each claim on it would otherwise re-read and re-hash the
 *   same covered files (up to COVERS_HASH_BYTES each).
 * @returns {boolean}
 */
function coversUnchanged(covers, digests = new Map()) {
  if (!Array.isArray(covers) || covers.length === 0) return false;
  for (const entry of covers) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') return false;
    if (!path.isAbsolute(entry.path)) return false;
    // hashFile returns null for a directory, socket or device (no bytes to compare), a file over
    // the cap, or an unreadable path -- all "not reusable".
    if (!digests.has(entry.path)) digests.set(entry.path, hashFile(entry.path, COVERS_HASH_BYTES));
    const digest = digests.get(entry.path);
    if (digest === null || digest !== entry.sha256) return false;
  }
  return true;
}

/**
 * Deterministic, cheap tier-1 evidence check. Not settable by an agent: it only looks at
 * what is actually on disk, and — for a locator — what is actually inside it (D6).
 *
 * @param {Array<{criterion: string, artifact: string|null, locator?: string|null,
 *   reason?: string, judgeOnly?: boolean}>} claims - `locator` is a literal string the
 *   EXERCISER claims to have seen inside `artifact` (supplied via `EXERCISE_SCHEMA`,
 *   VCON-B001). `judgeOnly` is stamped by `reconcileClaims` from the criterion's own
 *   definition, never by the agent (D7), and short-circuits this claim to `tier1: 'skipped'`
 *   before anything else is checked. `covers` (`[{path, sha256}]`) is attached by the CLI from
 *   the live-evidence manifest (`--state-dir`) — never from an agent's payload — and enables reuse of an
 *   artifact older than `sinceSec` (see below).
 * @param {number} sinceSec - The freshness floor, in seconds:
 *   `max(HEAD commit time, this run's verification-loop start time)`, derived by the command
 *   (`/implement-trd` Step 8.3, TRD §3.2) and passed in whole. An artifact whose mtime is not
 *   strictly greater than this is stale — unless the claim carries `covers` and every covered
 *   file is absolute, exists, and hashes (sha256) to its recorded value: then the old artifact
 *   still passes tier 1 with `reused: true`, because the code it exercised has not changed.
 *   Any other old artifact is `stale`. A fresh artifact passes with or without `covers`.
 *   The locator gate still runs on a reused artifact.
 *
 *   It is NOT HEAD's commit time alone. That is only a proxy for "when the code last changed",
 *   and it breaks on `--verify --resume`: the phase loop is skipped, no new commit
 *   exists, HEAD dates from the prior run, and that run's leftover evidence at the same paths
 *   all postdates it -- clearing this check having proved nothing about the current run. The
 *   `max` also is not redundant: a commit authored on a skewed clock can carry a timestamp
 *   ahead of local now, and the floor must not fall below HEAD.
 *
 *   Deriving it here is not an option and not an oversight: this function is required to be
 *   pure (no clock, no git) so it is testable without a repository or a wall clock.
 *
 *   KNOWN LIMIT: the floor is per-RUN, not per-ITERATION. It cannot distinguish iteration 1's
 *   artifact from iteration 3's at the same path, and since the Debug stage never commits it
 *   can never establish that an artifact postdates an uncommitted debug fix. Stated in the
 *   TRD's `## Could Not Verify`; the remedy (a per-iteration floor from a Judge-written marker
 *   file) changes this parameter's meaning and so is `/refine-trd` work.
 * @returns {Array<{criterion: string, tier1: 'pass'|'fail'|'skipped', artifact: string|null,
 *   bytes: number|null, mtimeSec: number|null, locator?: string|null, truncated?: boolean,
 *   reused?: true, stale?: boolean,   // `stale` is reported on skipped (judge-only) rows only
 *   failure?: 'missing'|'empty'|'stale'|'no-artifact'|'not-a-file'|'no-locator'|
 *     'locator-not-found'}>}
 */
function checkEvidence(claims, sinceSec) {
  const digests = new Map(); // covered-file hashes, computed once per call (see coversUnchanged)
  return claims.map((claim) => {
    const { criterion, artifact, locator, judgeOnly } = claim;

    // A judge-only criterion never gets a tier-1 verdict at all (D7) -- the Judge reads its
    // content or its stated reason directly and rules. Checked first, before any stat, so a
    // judge-only claim carrying no artifact (or a nonexistent one) never surfaces a failure
    // that would mean nothing for a tier this criterion was never meant to pass through.
    if (judgeOnly) {
      const skipped = {
        criterion,
        tier1: 'skipped',
        artifact: artifact ?? null,
        bytes: null,
        mtimeSec: null,
      };
      // Information for the Judge only; tier 1 is still not applied. Reported when the artifact
      // can be stat-ed: whether it predates the floor and, if so, whether reuse conditions hold.
      if (artifact) {
        try {
          const st = fs.statSync(artifact);
          if (st.isFile()) {
            if (Math.floor(st.mtimeMs / 1000) > sinceSec) {
              skipped.stale = false;
            } else if (coversUnchanged(claim.covers, digests)) {
              skipped.stale = false;
              skipped.reused = true;
            } else {
              skipped.stale = true;
            }
          }
        } catch {
          // Missing artifact: nothing to say about staleness; the Judge reads the reason.
        }
      }
      return skipped;
    }

    if (!artifact) {
      // No artifact was claimed at all. Tier 1 fails, but this is not itself a verdict —
      // the judge may still read `claim.reason` and decide `not_verifiable` (§3.2).
      return {
        criterion,
        tier1: 'fail',
        artifact: null,
        bytes: null,
        mtimeSec: null,
        failure: 'no-artifact',
      };
    }

    let stat;
    try {
      stat = fs.statSync(artifact);
    } catch {
      return {
        criterion,
        tier1: 'fail',
        artifact,
        bytes: null,
        mtimeSec: null,
        failure: 'missing',
      };
    }

    const bytes = stat.size;
    const mtimeSec = Math.floor(stat.mtimeMs / 1000);

    if (!stat.isFile()) {
      // A directory passes every other condition in this function -- statSync reports a
      // non-zero size for one and its mtime is whatever the run just made it -- while holding
      // nothing a judge can read. So does a socket, a fifo, or a device node. The contract
      // defines an artifact as "a file on disk that a deterministic check can gate before any
      // agent reads its content"; anything the judge cannot open and read is not that, and
      // waving it through here is a vacuous pass in the one check an agent cannot set.
      // statSync follows symlinks, so a symlink pointing at a real file is still a file.
      return { criterion, tier1: 'fail', artifact, bytes, mtimeSec, failure: 'not-a-file' };
    }

    if (bytes === 0) {
      return { criterion, tier1: 'fail', artifact, bytes, mtimeSec, failure: 'empty' };
    }

    // Older than the floor is stale unless the files this evidence depends on are unchanged.
    let reused = false;
    if (!(mtimeSec > sinceSec)) {
      if (!coversUnchanged(claim.covers, digests)) {
        return { criterion, tier1: 'fail', artifact, bytes, mtimeSec, failure: 'stale' };
      }
      reused = true;
    }

    // Tier 1's final gate (D6, VCON-B001): a literal locator string the exerciser claims to
    // have actually SEEN inside the artifact. Appended last, after every cheaper condition,
    // so it only ever runs against a file that already cleared no-artifact/missing/
    // not-a-file/empty/stale.
    // A whitespace-only locator is treated as absent: " " is a substring of nearly any text
    // artifact, so accepting it would pass tier 1 on an artifact nothing was actually seen in.
    if (typeof locator !== 'string' || locator.trim() === '') {
      // A claim-shape failure, not a verdict (§3.1): the Judge may still read `claim.reason`.
      // Making this pass instead would reinstate the hole the locator closes -- an artifact
      // with nothing proving it says anything about the criterion still "passing" tier 1.
      return { criterion, tier1: 'fail', artifact, bytes, mtimeSec, failure: 'no-locator' };
    }

    let content;
    let truncated = false;
    try {
      if (bytes > LOCATOR_SCAN_BYTES) {
        truncated = true;
        const buf = Buffer.alloc(LOCATOR_SCAN_BYTES);
        const fd = fs.openSync(artifact, 'r');
        try {
          fs.readSync(fd, buf, 0, LOCATOR_SCAN_BYTES, 0);
        } finally {
          fs.closeSync(fd);
        }
        content = buf.toString('utf8');
      } else {
        content = fs.readFileSync(artifact, 'utf8');
      }
    } catch {
      // Unreadable after a successful stat -- permissions, a race. Same as a failed stat; the
      // distinction is not useful to a judge and inventing a new failure for it is not (§3.1).
      return { criterion, tier1: 'fail', artifact, bytes: null, mtimeSec: null, failure: 'missing' };
    }

    // Literal substring match (D6), not a regex -- a regex an agent supplies can be made to
    // match anything (`.*`), which reinstates the hole this check closes. A non-UTF-8
    // artifact decodes lossily and the search runs on the result, so a binary artifact fails
    // here, which is the correct answer for a criterion that should have been judge-only.
    if (!content.includes(locator)) {
      return {
        criterion,
        tier1: 'fail',
        artifact,
        bytes,
        mtimeSec,
        locator,
        truncated,
        failure: 'locator-not-found',
      };
    }

    // A pass found in a truncated scan still says so -- the remainder was never read.
    const pass = { criterion, tier1: 'pass', artifact, bytes, mtimeSec, locator };
    if (truncated) pass.truncated = true;
    if (reused) pass.reused = true;
    return pass;
  });
}

// ---------------------------------------------------------------------------
// decideNext — the loop-exit decision, FR-4 + D14, as arithmetic (§3.4, AC-5)
// ---------------------------------------------------------------------------

const DEFAULT_CAP = 3;

// The coverage floor `decideNext` re-labels against (D9, OQ-1). Explicitly unset: the owner
// has not picked a number, and picking one here would be inventing policy rather than reading
// it (NG10). `decideNext` reads `input.coverageFloor ?? COVERAGE_FLOOR`, so a caller that never
// supplies `coverageFloor` gets this constant, and with it `null` the re-label in step 4 below
// never fires — the whole branch ships built and unit-tested against an explicit floor, but
// dormant in production until the owner sets one (D8).
const COVERAGE_FLOOR = null;

// Base actions eligible for the coverage re-label (D8, step 4). `exit-unbuilt` is excluded
// because "most of this was never built" is the truer statement and must win; `remediate` is
// excluded because a coverage rule that stopped a converging run would undo O1. Both exclusions
// are structural (an allow-list), not a consequence of where this check sits in the chain.
const COVERAGE_RELABELABLE_ACTIONS = new Set(['exit-satisfied', 'exit-stalled', 'exit-stuck']);

// Renders a 0-1 fraction as the percentage the owner reads (D19). `toFixed(2)` then a numeric
// round-trip drops trailing zeroes -- 0.6 -> "60%", 0.125 -> "12.5%" -- rather than a fixed
// decimal count that would print "60.00%" for the common whole-percent case.
function formatCoveragePercent(fraction) {
  return `${Number((fraction * 100).toFixed(2))}%`;
}

/**
 * @param {{
 *   iteration: number,
 *   gaps: string[],
 *   unbuilt: string[],
 *   previousGaps: string[]|null,
 *   met: string[],              // NEW (D8) — settled-met membership; the reason can name the ratio
 *   total?: number,             // NEW (D8) — the definition's whole criterion count
 *   coverageFloor?: number|null,// NEW (D9) — defaults to COVERAGE_FLOOR (null, unset)
 *   cap?: number,
 * }} input
 * @returns {{action: 'exit-satisfied'|'exit-unbuilt'|'exit-stalled'|'exit-stuck'|
 *   'exit-insufficient-coverage'|'remediate', reason: string, closed: string[]}}
 */
function decideNext(input) {
  const { iteration, gaps, unbuilt, previousGaps, met, total } = input;

  // Validate rather than default. Found twice independently by the phase review and the
  // end-of-run review on the 2026-08-19 live smoke run, where an omitted key died with a bare
  // `TypeError: Cannot read properties of undefined (reading 'length')` and no indication of
  // which field was missing.
  //
  // Defaulting to [] would be WORSE than throwing: an absent `unbuilt` would silently read as
  // "nothing is unbuilt", so criteria that were never built would fall through to `remediate`
  // and be handed to the debugger — exactly what D14 exists to prevent. A missing field is a
  // caller bug, and the loop must not paper over it.
  if (!Array.isArray(gaps)) {
    throw new TypeError('decideNext: input.gaps is required and must be an array');
  }
  if (!Array.isArray(unbuilt)) {
    throw new TypeError('decideNext: input.unbuilt is required and must be an array (an absent value would silently read as "nothing unbuilt" and remediate never-built criteria — D14)');
  }
  // Same style, and the same reasoning (D8, §3.2): defaulting `met` to [] would read as
  // "nothing proven", which could re-label a genuinely healthy exit down to
  // `exit-insufficient-coverage` on a caller bug rather than on real evidence.
  if (!Array.isArray(met)) {
    throw new TypeError('decideNext: input.met is required and must be an array (an absent value would read as "nothing proven" and could re-label a healthy exit — D8)');
  }
  const cap = input.cap ?? DEFAULT_CAP;
  const coverageFloor = input.coverageFloor ?? COVERAGE_FLOOR;

  // `closed` is previousGaps \ gaps — computed unconditionally so it is always accurate on
  // the returned object, regardless of which branch below fires.
  const closed = previousGaps == null ? [] : previousGaps.filter((id) => !gaps.includes(id));

  // Evaluation order is the specification (D14): unbuilt wins even over a clean gap set,
  // because a report that iterates on the fixable half while withholding "this was never
  // built" is the more misleading of the two outputs. This chain captures a BASE action —
  // the coverage re-label (step 4, below) is applied to it afterward, never inserted as a
  // sixth early-return branch ahead of these four.
  let result;
  if (unbuilt.length > 0) {
    result = {
      action: 'exit-unbuilt',
      reason: `${unbuilt.length} criterion/criteria absent (unbuilt), not misbehaving — loop stops rather than debugging missing code`,
      closed,
    };
  } else if (gaps.length === 0) {
    result = {
      action: 'exit-satisfied',
      reason: 'no gaps remain — every criterion is met or not verifiable here',
      closed,
    };
  } else if (
    // `previousGaps.length > 0` is load-bearing, not defensive. An empty previousGaps is
    // reachable -- verify-functional.js seeds it by filtering a resume snapshot for `not_met`,
    // so a snapshot from a run that exited satisfied or unbuilt yields [] rather than null --
    // and with no gap to close, "closed no gaps" is vacuously true. Without this clause a
    // resumed run exits `stalled` ("remediation is not converging") on its first iteration,
    // before the Debug stage has been dispatched even once.
    previousGaps != null && previousGaps.length > 0 && closed.length === 0
  ) {
    result = {
      action: 'exit-stalled',
      reason: 'iteration closed no gaps — remediation is not converging',
      closed,
    };
  } else if (iteration >= cap) {
    result = {
      action: 'exit-stuck',
      reason: `iteration cap (${cap}) reached with ${gaps.length} gap(s) still open`,
      closed,
    };
  } else {
    result = {
      action: 'remediate',
      reason: `${gaps.length} gap(s) open — dispatching debug stage`,
      closed,
    };
  }

  // Step 4 (D8): the coverage re-label. Only base actions in COVERAGE_RELABELABLE_ACTIONS are
  // eligible, `coverageFloor` must be explicitly set (non-null), and `total` must be a positive
  // number — a missing or zero `total` skips the re-label rather than dividing by it, which is
  // the safe direction (never re-label on a denominator nobody supplied). `total` is optional at
  // the type level for that same reason: unlike `met`, its absence cannot fabricate a false
  // "nothing proven" reading -- it just leaves the ratio uncomputed and the re-label dormant.
  if (
    COVERAGE_RELABELABLE_ACTIONS.has(result.action) &&
    coverageFloor != null &&
    typeof total === 'number' &&
    total > 0 &&
    met.length / total < coverageFloor
  ) {
    const ratio = met.length / total;
    const uncoveredCount = total - met.length;
    result = {
      action: 'exit-insufficient-coverage',
      reason:
        `proven ratio ${met.length}/${total} (${(ratio * 100).toFixed(1)}%) is below the ` +
        // D19: the owner reads percentages (verification.md §5a is written as one), and the
        // readout that quotes this reason prints percentages elsewhere too -- a bare fraction
        // here would be the one place a ratio surfaced unitless.
        `coverage floor ${formatCoveragePercent(coverageFloor)} — ${uncoveredCount} ` +
        `criterion/criteria uncovered; base cause: ${result.reason}`,
      closed,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// readCoverageFloor / recommendCoverageFloor — the owner's coverage floor (D6, D7)
// ---------------------------------------------------------------------------

/**
 * Parses the `Coverage floor:` line inside the heading containing "coverage floor" (D7),
 * case-insensitively on both the heading text and the line's own prefix. The line is read
 * from within that heading's own section (up to the next heading of the same or a shallower
 * level), so a stray mention of "coverage floor" elsewhere in the file cannot be mistaken for
 * the declaration.
 *
 * @param {string} content - the full contents of a `verification.md`.
 * @returns {{ floor: number|null, status: 'declared'|'none'|'absent'|'invalid', raw: string|null }}
 *   `floor` is a fraction in [0, 1] ("60%" -> 0.6) -- percent in the file, fraction on the wire.
 *   `none` (any case) -> `{ floor: null, status: 'none' }`. No such heading, or no such line
 *   under it, -> `status: 'absent'`. Anything else (out of range, unparseable) -> `'invalid'`.
 */
function readCoverageFloor(content) {
  if (typeof content !== 'string') {
    throw new TypeError('readCoverageFloor: content must be a string');
  }
  // Same fence-aware pair readStopRule uses, so a "## Coverage floor" quoted inside a code
  // block elsewhere in the file cannot be mistaken for the section itself.
  const lines = maskFencedLines(content.replace(/\r\n?/g, '\n').split('\n'));
  const section = findSection(lines, 'coverage floor');
  if (!section) {
    return { floor: null, status: 'absent', raw: null };
  }

  // Tolerate the Markdown an owner reaches for when hand-editing -- `**Coverage floor**: 60%`,
  // `Coverage floor: `60%``, a list marker -- exactly as readStopRule does. Without this, a bold
  // key read as `absent` (no line found), which nothing reports: the owner's floor would be
  // silently dropped rather than flagged `invalid`.
  const floorLine = lines
    .slice(section.start, section.end)
    .map((line) => line.trim().replace(/^[-*+]\s+/, '').replace(/[*`]/g, '').trim())
    .find((line) => /coverage floor\s*:/i.test(line));
  if (!floorLine) {
    return { floor: null, status: 'absent', raw: null };
  }

  const raw = floorLine.replace(/^.*?coverage floor\s*:\s*/i, '').trim();

  if (/^none$/i.test(raw)) {
    return { floor: null, status: 'none', raw };
  }

  const percentMatch = raw.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (percentMatch) {
    const value = parseFloat(percentMatch[1]);
    if (value >= 0 && value <= 100) {
      return { floor: value / 100, status: 'declared', raw };
    }
  }

  return { floor: null, status: 'invalid', raw };
}

// Rounding is floor-to-5% (D6): the recommendation must never sit ABOVE any past satisfied
// run's proven share, or that run would fail to re-pass its own history. The epsilon guards
// against a share such as 0.35 rounding down to 0.30 through floating-point error
// (0.35 * 20 can evaluate to 6.999999999999999 rather than 7).
function floorToFivePercent(share) {
  return Math.floor(share * 20 + 1e-9) / 20;
}

/**
 * Recommends a coverage floor from this project's own past verification runs (D6): the lowest
 * proven share among runs that ended `satisfied`, rounded down to a multiple of 5% so every
 * past satisfied run still clears it.
 *
 * @param {Array<{ feature: string, outcome: string|null, criteria: Array<{status: string}> }>} runs
 * @returns {{
 *   runs: Array<{ feature, outcome, proven, total, share }>,
 *   eligible: number,
 *   recommended: number|null,
 *   lowest: { feature, proven, total, share } | null,
 * }}
 */
function recommendCoverageFloor(runs) {
  if (!Array.isArray(runs)) {
    throw new TypeError('recommendCoverageFloor: runs must be an array');
  }

  const computed = runs.map((run) => {
    const criteria = Array.isArray(run && run.criteria) ? run.criteria : [];
    const total = criteria.length;
    const proven = criteria.filter((c) => c && c.status === 'met').length;
    return {
      feature: run && run.feature,
      outcome: run && run.outcome,
      proven,
      total,
      share: total > 0 ? proven / total : null,
    };
  });

  // Eligible: ended `satisfied` AND has at least one criterion (D6) -- `total: 0` is excluded
  // rather than treated as a vacuous 100%, which would recommend a floor no run actually earned.
  const eligible = computed.filter((r) => r.outcome === 'satisfied' && r.total > 0);

  let lowest = null;
  for (const r of eligible) {
    if (lowest === null || r.share < lowest.share) lowest = r;
  }

  return {
    runs: computed,
    eligible: eligible.length,
    recommended: lowest === null ? null : floorToFivePercent(lowest.share),
    lowest:
      lowest === null
        ? null
        : { feature: lowest.feature, proven: lowest.proven, total: lowest.total, share: lowest.share },
  };
}

// ---------------------------------------------------------------------------
// readNeverUnattended — parses verification.md §5b (never-unattended-paths FIX-001)
// ---------------------------------------------------------------------------

/**
 * Parses the owner-governed "never unattended" path list out of the heading containing
 * "never unattended" (case-insensitive), the same fence-aware, section-scoped shape
 * `readCoverageFloor` uses -- so a stray mention of the phrase elsewhere in the file, or an
 * example quoted inside a fenced block, cannot be mistaken for the declaration.
 *
 * Two accepted forms, per the template: one `- <fragment>` bullet per path, or a single
 * `Paths: a, b` line. `/plan --implement` never builds a task touching one of these paths
 * without the owner watching (substring match, done by the caller via `matchNeverUnattended`
 * -- this function only reads the list).
 *
 * @param {string} content - the full contents of a `verification.md`.
 * @returns {{ paths: string[], status: 'declared'|'none'|'absent'|'invalid', raw: string|null }}
 *   No heading containing "never unattended" -> `absent`. A section holding only prose (no
 *   bullets, no `Paths:` line) -> `absent` (nothing declared). One or more bullets, with no
 *   `Paths:` line -> `declared`, `paths` the stripped bullet text, in document order. A single
 *   `Paths: a, b` line, with no bullets -> `declared`, split on commas, trimmed, empties
 *   dropped. `Paths: none` (case-insensitive), alone -> `none`. Both bullets AND a `Paths:`
 *   line present (any value, including `none`), or two `Paths:` lines -> `invalid` -- two
 *   conflicting declarations
 *   in one file is never resolved by guessing which one the owner meant. A `Paths:` line with
 *   an empty value, or a bullet that is empty after stripping markup, is also `invalid`, with
 *   `raw` naming the offending line -- an unreadable list must never silently read as `none`
 *   (D: "an unreadable list stops the build; invalid is never 'no brake'").
 */
function readNeverUnattended(content) {
  if (typeof content !== 'string') {
    throw new TypeError('readNeverUnattended: content must be a string');
  }
  const lines = maskFencedLines(content.replace(/\r\n?/g, '\n').split('\n'));
  // The house spelling elsewhere is hyphenated ("never-unattended paths"); an owner who
  // titles the heading that way must not read as `absent`.
  const section = findSection(lines, 'never unattended') || findSection(lines, 'never-unattended');
  if (!section) {
    return { paths: [], status: 'absent', raw: null };
  }

  const sectionLines = lines.slice(section.start, section.end);

  const bullets = [];
  let emptyBulletRaw = null;
  let pathsLine = null; // { raw: '<original Paths: line>', value: '<text after the colon>' }

  for (const rawLine of sectionLines) {
    const trimmed = rawLine.trim();
    if (trimmed === '') continue;

    // Numbered items are list items too -- an owner writing "1. auth" must not have the
    // entry silently dropped as prose. A bare marker ("- " trims to "-") is a list item with
    // nothing in it -- an unreadable entry, so `invalid` below, never prose read as `absent`.
    // The marker must be followed by whitespace or end of line, so "---" is not a bullet.
    const bulletMatch = /^(?:[-*+]|\d+[.)])(?:\s+(.*))?$/.exec(trimmed);
    // A trailing note ("- auth — the login flow", "- auth # why") is cut at the first ' — ',
    // ' - ' or ' #', so it cannot become part of the fragment and never match any path.
    const body = (bulletMatch ? bulletMatch[1] ?? '' : trimmed)
      .replace(/[*`]/g, '')
      .split(/ — | - | #/)[0]
      .trim();

    // Tolerate bold/code wrap and a list marker around the key, as readCoverageFloor does
    // for "Coverage floor" -- `- Paths: auth` is a Paths line, not a fragment literally
    // named "Paths: auth" that could never match anything.
    const pathsMatch = /^paths?\s*:\s*(.*)$/i.exec(body);
    if (pathsMatch) {
      if (pathsLine !== null) {
        // Two Paths: lines (the template's `Paths: none` left in place above an added
        // `Paths: auth`) is two conflicting declarations -- never resolve it to the first.
        return {
          paths: [],
          status: 'invalid',
          raw: `more than one "Paths:" line: "${pathsLine.raw}" and "${trimmed}"`,
        };
      }
      pathsLine = { raw: trimmed, value: pathsMatch[1].trim() };
      continue;
    }

    if (bulletMatch) {
      // A bullet may list several fragments comma-separated, exactly as a Paths: line may.
      const fragments = body
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p !== '');
      if (fragments.length === 0) {
        emptyBulletRaw = emptyBulletRaw ?? trimmed;
      } else {
        bullets.push(...fragments);
      }
      continue;
    }

    // Anything else, non-blank, is treated as prose explanation (the template's own
    // introductory sentences) and ignored -- it is neither a bullet nor a `Paths:` line, and
    // nothing it could say would hide a declared path.
  }

  // Both forms present is ambiguous by construction -- conservative per spec: never guess
  // which one the owner meant, even when the `Paths:` line reads `none`.
  if (bullets.length > 0 && pathsLine !== null) {
    return {
      paths: [],
      status: 'invalid',
      raw: `both a "- " bullet list and "${pathsLine.raw}" are present`,
    };
  }

  if (emptyBulletRaw !== null) {
    return { paths: [], status: 'invalid', raw: emptyBulletRaw };
  }

  if (pathsLine !== null) {
    // `Paths: none — no brake` / `Paths: none.` still mean none; a comma after `none`
    // means a list and stays a declaration.
    if (/^none\b[^,]*$/i.test(pathsLine.value)) {
      return { paths: [], status: 'none', raw: pathsLine.raw };
    }
    if (pathsLine.value === '') {
      return { paths: [], status: 'invalid', raw: pathsLine.raw };
    }
    const paths = pathsLine.value
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p !== '');
    if (paths.length === 0) {
      return { paths: [], status: 'invalid', raw: pathsLine.raw };
    }
    return { paths, status: 'declared', raw: pathsLine.raw };
  }

  if (bullets.length > 0) {
    return { paths: bullets, status: 'declared', raw: null };
  }

  return { paths: [], status: 'absent', raw: null };
}

// ---------------------------------------------------------------------------
// renderReport — FR-6, AC-9 (§3.6)
// ---------------------------------------------------------------------------

const OUTCOME_LABEL = {
  satisfied: 'Satisfied',
  unbuilt: 'Unbuilt',
  stalled: 'Stalled',
  stuck: 'Stuck',
  'insufficient-coverage': 'Insufficient Coverage',
  'not-run': 'Not Run',
};

// The cause vocabulary (D3, §3.1), exported as `CAUSES` so `JUDGE_CRITERION_SCHEMA`'s `cause`
// enum (VFIX-B002) is matched exactly against ONE list rather than kept in step by hand across
// two files. Order is the TRD's own table order, which is also the order ties are broken in
// when the Diagnosis line's descending-count sort leaves two causes equal (Array#sort is
// stable, and this is the array `renderReport` iterates when seeding the count map, so a tie
// resolves to this order rather than to whatever order criteria happened to appear in).
const CAUSES = [
  'evidence-missing',
  'evidence-stale',
  'locator-not-found',
  'never-exercised',
  'judged-failed',
  'not-built',
  'environment-unreachable',
  'capability-absent',
];

// Words a Diagnosis line and the Fix run table render instead of the enum spelling (§3.1:
// "environment not reachable", not `environment-unreachable`) -- the same fixed small-
// vocabulary table-lookup shape as `OUTCOME_LABEL`, per this task's own `<follow>` grounding,
// rather than a string-transform function that would drift the moment a cause's wording
// diverges from its slug (e.g. `evidence-stale` -> "stale evidence" reads better than the
// mechanical "evidence stale" a hyphen-replace would produce for every entry uniformly).
const CAUSE_LABEL = {
  'evidence-missing': 'evidence missing',
  'evidence-stale': 'evidence stale',
  'locator-not-found': 'locator not found',
  'never-exercised': 'never exercised',
  'judged-failed': 'judged failed',
  'not-built': 'not built',
  'environment-unreachable': 'environment not reachable',
  'capability-absent': 'capability absent',
  // Not itself a CAUSES member -- assigned by `renderReport`/`renderFixSummary` to a
  // non-`met` criterion whose report input carries no `cause` at all (an older input, or one
  // composed before VFIX-B002 wired the field through). §3.1: "counted as unrecorded, never
  // guessed."
  unrecorded: 'unrecorded',
};

// The four outcomes the Diagnosis/Next lines render under (§3.1). `satisfied` and `not-run`
// are excluded deliberately: `satisfied` already has its own not-verifiable suffix above, and
// `not-run` has no criteria to diagnose yet.
const DIAGNOSIS_OUTCOMES = new Set(['stalled', 'stuck', 'unbuilt', 'insufficient-coverage']);

function escapeCell(text) {
  // Order matters: the backslash MUST be escaped before the pipe, or a statement containing
  // `\` immediately before `|` produces `\\|` — a literal backslash followed by an
  // UNescaped cell break, which shifts every later column in that row. Found on the
  // 2026-08-19 live run. `\r` is normalised alongside `\n` so CRLF content cannot split a row.
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n?|\n/g, ' ');
}

/**
 * @param {{
 *   feature: string, prd: string, definitionPath: string,
 *   outcome: 'satisfied'|'unbuilt'|'stalled'|'stuck'|'insufficient-coverage'|'not-run',
 *   reason: string,
 *   criteria: Array<{
 *     id: string, statement: string, cites: string,
 *     status: 'met'|'not_met'|'not_verifiable'|'unbuilt',
 *     artifact: string|null, reason: string|null,
 *     attempts: Array<{iteration: number, result: string}>,
 *     blocker: string|null,
 *     tier1?: string,       // NEW (D8, §3.6) — the state file's tier1 verdict; rendered on
 *                           //     the Not Met table so "never reached" reads apart from
 *                           //     "reached and failed". Absent on older report inputs.
 *     provenAt?: number,    // NEW (D8, §3.6) — the iteration a `met` verdict was proven at,
 *                           //     rendered on the Met table. Absent on older report inputs.
 *   }>,
 *   finalEnvironmentRun?: {command: string, status: 'pass'|'fail'|'skipped'} | null,  // NEW (D14)
 * }} input
 * @returns {string} markdown
 */
function renderReport(input) {
  const { feature, prd, definitionPath, outcome, reason, criteria, finalEnvironmentRun } = input;

  const met = criteria.filter((c) => c.status === 'met');
  const notMet = criteria.filter((c) => c.status === 'not_met');
  const notVerifiable = criteria.filter((c) => c.status === 'not_verifiable');
  const unbuilt = criteria.filter((c) => c.status === 'unbuilt');
  // Anything that is none of the four. The report-input file is composed by hand by the Judge
  // agent and is NOT covered by verify-functional.js's JUDGE_SCHEMA (that schema constrains
  // the agent's return value, not the file it writes in STEP 5), so a one-character slip --
  // `not-met` for `not_met` -- reaches here intact. Filtered into no section and counted in
  // no tally, such a criterion vanished from the report entirely while the header still
  // counted it in the total: a report reading "Satisfied / 2 total / 1 met" with the failing
  // criterion nowhere on the page. The contract requires every criterion in the definition to
  // appear in the report, so surface it as the anomaly it is rather than inventing a verdict
  // for it.
  const KNOWN = ['met', 'not_met', 'not_verifiable', 'unbuilt'];
  const unrecognised = criteria.filter((c) => !KNOWN.includes(c.status));

  const lines = [];
  lines.push(`# Functional Verification Report: ${feature}`);
  lines.push('');
  lines.push(`**Source PRD**: ${prd}`);
  lines.push(`**Success definition**: ${definitionPath}`);
  // `satisfied` means "no gaps" (decideNext), not "everything was exercised" -- a not_met
  // criterion blocks satisfied, but a not_verifiable one does not (§3.4). Left unqualified,
  // the headline reads as a clean pass even when a chunk of the criteria were never checked.
  // Surface that count on the outcome line itself, not just in the `Criteria` tally three
  // lines down, since a banner quoting this line alone must not imply full coverage.
  const outcomeSuffix =
    outcome === 'satisfied' && notVerifiable.length > 0
      ? ` (${notVerifiable.length} of ${criteria.length} not verifiable)`
      : '';
  // The full-environment gate's own suffix (D14, §3.6), appended to whatever the coverage
  // suffix above already produced. Three renderings, not two: a `fail` carries the failure
  // even when the outcome is `satisfied` — that combination is the one the suffix exists for,
  // since the criteria really were proven and only the rebuild failed; a `skipped` run with no
  // command declared says so explicitly, so "nobody declared one" is never read as "one
  // passed"; a `pass` adds nothing, because a clean line is already the existing meaning of a
  // clean result.
  let finalRunSuffix = '';
  if (finalEnvironmentRun && finalEnvironmentRun.status === 'fail') {
    finalRunSuffix = ' (final full-environment run FAILED)';
  } else if (
    finalEnvironmentRun &&
    finalEnvironmentRun.status === 'skipped' &&
    !finalEnvironmentRun.command
  ) {
    finalRunSuffix = ' (no full-environment run declared)';
  }
  lines.push(`**Outcome**: ${OUTCOME_LABEL[outcome] ?? outcome}${outcomeSuffix}${finalRunSuffix}`);
  lines.push(`**Reason**: ${reason}`);
  lines.push(
    `**Criteria**: ${criteria.length} total — ${met.length} met, ${notMet.length} not met, ${notVerifiable.length} not verifiable, ${unbuilt.length} unbuilt` +
      (unrecognised.length > 0 ? `, ${unrecognised.length} unrecognised status` : '')
  );
  // The coverage line (D8, §3.6): counts alone let an iteration hold at "4 met" while swapping
  // WHICH 4 — this names the ratio and the membership of the uncovered set (every criterion not
  // `met`, regardless of which of the other statuses it carries) so that drift is visible.
  const uncoveredIds = criteria.filter((c) => c.status !== 'met').map((c) => c.id);
  lines.push(
    `**Coverage**: ${met.length} of ${criteria.length} proven` +
      (uncoveredIds.length > 0
        ? ` — uncovered: ${uncoveredIds.map(escapeCell).join(', ')}`
        : ' — uncovered: none')
  );

  // Diagnosis + Next (D3, §3.1): only under the four outcomes a stalled/stuck/unbuilt/
  // insufficient-coverage run can end with, and never for `satisfied` (already covered by
  // `outcomeSuffix` above) or `not-run` (nothing yet to diagnose). Counts every non-`met`
  // criterion by its `cause`, defaulting an absent field to `unrecorded` rather than guessing
  // one (§3.1) -- the same defensive read `tier1 ?? ''` already uses a few lines up, per this
  // task's own `<careful>` grounding. Sorted by count, descending; `Array#sort` is stable, so
  // a tie between two causes breaks in `CAUSES`' own table order (seeded into the map below),
  // not in criteria-array order.
  if (DIAGNOSIS_OUTCOMES.has(outcome)) {
    const open = criteria.filter((c) => c.status !== 'met');
    const counts = new Map();
    for (const cause of CAUSES) counts.set(cause, 0);
    counts.set('unrecorded', 0);
    for (const c of open) {
      const cause = c.cause ?? 'unrecorded';
      counts.set(cause, (counts.get(cause) ?? 0) + 1);
    }
    const causeWords = Array.from(counts.entries())
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([cause, count]) => `${count} ${CAUSE_LABEL[cause] ?? cause}`)
      .join(', ');
    lines.push(
      `**Diagnosis**: ${open.length} open` + (causeWords ? ` — ${causeWords}` : '')
    );
    lines.push(
      '**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`'
    );
  } else if (outcome === 'satisfied') {
    // O4 (docs/TRD/refine-verification.md): the report's Next line follows the same rule as
    // both commands' readouts, so a satisfied run names its successor too.
    lines.push('**Next**: `/audit-build`');
  }

  lines.push('');

  if (unrecognised.length > 0) {
    lines.push('## Unrecognised Status');
    lines.push('');
    lines.push(
      'These criteria carry a status that is none of `met` / `not_met` / `not_verifiable` / ' +
        '`unbuilt`. No verdict has been assigned to them and none is implied here — the ' +
        'report renders them so they cannot go missing, and whoever composed the report input ' +
        'has to resolve them.'
    );
    lines.push('');
    lines.push('| ID | Statement | Status as written | Reason |');
    lines.push('|----|-----------|-------------------|--------|');
    for (const c of unrecognised) {
      lines.push(
        `| ${c.id} | ${escapeCell(c.statement)} | ${escapeCell(c.status)} | ${escapeCell(c.reason)} |`
      );
    }
    lines.push('');
  }

  if (unbuilt.length > 0) {
    lines.push('## Unbuilt');
    lines.push('');
    lines.push(
      'Implementation did not deliver these criteria. The loop stopped rather than debugging absent code (D14).'
    );
    lines.push('');
    lines.push('| ID | Statement | Reason |');
    lines.push('|----|-----------|--------|');
    for (const c of unbuilt) {
      lines.push(`| ${c.id} | ${escapeCell(c.statement)} | ${escapeCell(c.reason)} |`);
    }
    lines.push('');
  }

  lines.push('## Met');
  lines.push('');
  if (met.length === 0) {
    lines.push('_None._');
  } else {
    // `Proven at` (D8, §3.6), from `provenAt` -- under carry-forward a `met` verdict may be
    // several iterations old, and this is the column that says which one. Blank, not "0", when
    // absent -- an older report input carries no `provenAt` at all, and 0 would misread as
    // "proven at iteration 0."
    lines.push('| ID | Statement | Artifact | Proven at |');
    lines.push('|----|-----------|----------|-----------|');
    for (const c of met) {
      const provenAt = c.provenAt === undefined || c.provenAt === null ? '' : c.provenAt;
      lines.push(
        `| ${c.id} | ${escapeCell(c.statement)} | ${escapeCell(c.artifact)} | ${escapeCell(provenAt)} |`
      );
    }
  }
  lines.push('');

  lines.push('## Not Met');
  lines.push('');
  if (notMet.length === 0) {
    lines.push('_None._');
  } else {
    // `Tier 1` (D8, §3.6), sourced from the state file's persisted `tier1` verdict -- it is
    // what separates a criterion that was never reached from one that was reached and failed.
    // Blank, not a fabricated value, when the report input carries no `tier1` at all.
    lines.push('| ID | Statement | Tier 1 | Reason | Blocker | Attempts |');
    lines.push('|----|-----------|--------|--------|---------|----------|');
    for (const c of notMet) {
      const attempts = (c.attempts || [])
        .map((a) => `iter ${a.iteration}: ${a.result}`)
        .join('; ');
      lines.push(
        `| ${c.id} | ${escapeCell(c.statement)} | ${escapeCell(c.tier1 ?? '')} | ${escapeCell(c.reason)} | ${escapeCell(c.blocker)} | ${escapeCell(attempts)} |`
      );
    }
  }
  lines.push('');

  lines.push('## Not Verifiable');
  lines.push('');
  if (notVerifiable.length === 0) {
    lines.push('_None._');
  } else {
    lines.push('| ID | Statement | Reason |');
    lines.push('|----|-----------|--------|');
    for (const c of notVerifiable) {
      lines.push(`| ${c.id} | ${escapeCell(c.statement)} | ${escapeCell(c.reason)} |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// readStopRule — §3.5, D6, D7
// ---------------------------------------------------------------------------

/**
 * Reads the "max-rounds" and "stop-when-closed-below" fields out of a `verification-plan.md`'s
 * `## Stop rule` section (§3.4) -- deterministically, in code, per D6: the stop rule is the only
 * termination story of a multi-hour unattended `--fix` run (O7), and a model re-reading prose
 * after a compaction is exactly how a second, drifting termination story would appear. Every
 * other section of the plan is still read by a model, once per round.
 *
 * Reuses `trd-parser.js`'s fence-aware pair rather than a local scan (`maskFencedLines` +
 * `findSection(..., {strategy: 'last'})`), per this task's own `<reuse>` grounding: it is the
 * closest existing fence-aware section-finder in the repo, already exported and already tested,
 * and `fix-audit.js` establishes the same reuse precedent for a different heading in this same
 * `lib/` directory. `discovered.js`'s counter-precedent (a local, non-fence-aware regex scan, to
 * avoid a parse-time dependency from a promote-time module) was weighed and set aside: this
 * function's whole job IS fence-aware section parsing, so writing a second, weaker version of
 * `trd-parser.js`'s own pair beside it would be the wrong economy.
 *
 * "Last" section outside a fence, not "first": a plan document can quote
 * `` `## Stop rule` `` inline in prose describing itself (the same collision `trd-parser.js`'s
 * own `strategy: 'last'` doc-comment names for "Could Not Verify" / "Open Questions"), and the
 * canonical, terminal section should win over an accidental earlier match.
 *
 * @param {string} planText - the full contents of `verification-plan.md`.
 * @returns {{maxRounds: number|null, closedBelow: number|null, errors: string[]}} `maxRounds`
 *   is `null` when missing or not a positive integer (with a matching entry in `errors`).
 *   `closedBelow` is `null` both when the field reads `none` (a legitimate value, §3.4) and
 *   when it is missing or unparseable (also `errors`) -- callers needing to tell those apart
 *   inspect `errors`, not the field alone.
 */
function readStopRule(planText) {
  const errors = [];
  const rawLines = String(planText).replace(/\r\n?/g, '\n').split('\n');
  const maskedLines = maskFencedLines(rawLines);
  const section = findSection(maskedLines, 'Stop rule', { strategy: 'last' });

  if (!section) {
    errors.push('no "## Stop rule" section found');
    return { maxRounds: null, closedBelow: null, errors };
  }

  const sectionLines = maskedLines.slice(section.start, section.end);

  let maxRounds = null;
  let closedBelow = null;
  let sawMaxRounds = false;

  for (const raw of sectionLines) {
    // Tolerate the Markdown a model writing the plan reaches for -- a list marker, bold or
    // code-span around the key (`- **max-rounds**: 3`) -- rather than rejecting the whole stop
    // rule and silently falling back to one round. The values themselves are digits or `none`.
    const line = raw.trim().replace(/^[-*+]\s+/, '').replace(/[*`]/g, '').trim();

    const maxRoundsMatch = /^max-rounds:\s*(.*)$/i.exec(line);
    if (maxRoundsMatch) {
      sawMaxRounds = true;
      const value = maxRoundsMatch[1].trim();
      const n = Number(value);
      if (Number.isInteger(n) && n > 0) {
        maxRounds = n;
      } else {
        errors.push(`max-rounds must be a positive integer, got "${value}"`);
      }
      continue;
    }

    const closedBelowMatch = /^stop-when-closed-below:\s*(.*)$/i.exec(line);
    if (closedBelowMatch) {
      const value = closedBelowMatch[1].trim();
      if (/^none$/i.test(value) || value === '') {
        closedBelow = null;
      } else {
        const n = Number(value);
        if (Number.isInteger(n) && n >= 0) {
          closedBelow = n;
        } else {
          errors.push(`stop-when-closed-below must be a non-negative integer or "none", got "${value}"`);
        }
      }
    }
  }

  if (!sawMaxRounds) {
    errors.push('max-rounds is missing from the "## Stop rule" section');
  }

  return { maxRounds, closedBelow, errors };
}

// ---------------------------------------------------------------------------
// decideFixRound — §3.5, D7
// ---------------------------------------------------------------------------

/**
 * The `--fix` loop's per-round exit decision -- the same "arithmetic, not judgement" shape as
 * `decideNext` (§3.4), and the same validate-then-throw discipline (this task's own `<reuse>`
 * grounding names `decideNext`'s pattern explicitly): a caller bug that omits a field must not
 * silently read as a benign default and let the outer loop run away or stop early on the wrong
 * evidence.
 *
 * Evaluation order (§3.5, fixed): nothing buildable left wins first, over even a round still
 * within its cap -- continuing to "fix" when nothing open can be built would just re-run verify
 * passes against a ceiling nothing can lower. Then the round cap. Then the closed-below floor,
 * which only applies once a `stop-when-closed-below` rule exists at all (`closedBelow` may be
 * legitimately `null`, meaning no such rule -- §3.4's "any section may hold `none`").
 *
 * @param {{
 *   round: number,           // the fix round just finished, 1-based
 *   maxRounds: number,       // 1 when there is no plan or its stop rule is unreadable
 *   closedBelow: number|null,
 *   closedThisRound: number, // criteria not met before this round and met after it
 *   buildableOpen: number,   // open criteria with a buildable cause, not accepted-not-verifiable
 * }} input
 * @returns {{action: 'continue'|'stop', reason: string}}
 */
function decideFixRound(input) {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('decideFixRound: input is required and must be an object');
  }
  const { round, maxRounds, closedThisRound, buildableOpen } = input;

  if (typeof round !== 'number' || !Number.isFinite(round)) {
    throw new TypeError('decideFixRound: input.round is required and must be a number');
  }
  if (typeof maxRounds !== 'number' || !Number.isFinite(maxRounds)) {
    throw new TypeError('decideFixRound: input.maxRounds is required and must be a number');
  }
  // `closedBelow` may legitimately be `null` (no stop-when-closed-below rule) -- checked with
  // `in` rather than `?? `, which would swallow the distinction between "explicitly null" and
  // "the caller forgot the key entirely", exactly the caller-bug case `decideNext` throws on.
  if (!('closedBelow' in input)) {
    throw new TypeError('decideFixRound: input.closedBelow is required (a number, or null when there is no stop-when-closed-below rule)');
  }
  const closedBelow = input.closedBelow;
  if (closedBelow !== null && (typeof closedBelow !== 'number' || !Number.isFinite(closedBelow))) {
    throw new TypeError('decideFixRound: input.closedBelow must be a number or null');
  }
  if (typeof closedThisRound !== 'number' || !Number.isFinite(closedThisRound)) {
    throw new TypeError('decideFixRound: input.closedThisRound is required and must be a number');
  }
  if (typeof buildableOpen !== 'number' || !Number.isFinite(buildableOpen)) {
    throw new TypeError('decideFixRound: input.buildableOpen is required and must be a number');
  }

  if (buildableOpen === 0) {
    return { action: 'stop', reason: 'nothing left to build' };
  }
  if (round >= maxRounds) {
    return { action: 'stop', reason: `round ${round} reached max-rounds (${maxRounds})` };
  }
  // Round 0 builds the plan's blockers, not failing criteria, so it is not judged by the
  // closed-below rule -- the same reason it does not count toward max-rounds (TRD OQ-6).
  if (round >= 1 && closedBelow !== null && closedThisRound < closedBelow) {
    return {
      action: 'stop',
      reason: `closed ${closedThisRound} this round, below stop-when-closed-below (${closedBelow})`,
    };
  }
  return {
    action: 'continue',
    reason: `${closedThisRound} closed this round, ${buildableOpen} buildable still open, round ${round} of ${maxRounds}`,
  };
}

// ---------------------------------------------------------------------------
// renderFixSummary — the "## Fix run" section (D10)
// ---------------------------------------------------------------------------

/**
 * Renders the `## Fix run` section `--fix` appends to `verification-report.md` after its final
 * round (D10): one row per round (tasks promoted, criteria closed, still open), then every
 * criterion still not `met` with its status, cause (in words, via `CAUSE_LABEL` -- the same
 * table-lookup rendering `renderReport`'s Diagnosis line uses) and the reason `--fix` stopped on
 * it. Pure formatting, like `renderReport` -- the decision of WHICH stop reason applies to a
 * given criterion (not buildable by cause / accepted as not verifiable by ruling / stop rule
 * reached / not verifiable here) is `/verify-build`'s (VFIX-B005), composed into `stopReason`
 * before this function ever sees it.
 *
 * @param {{
 *   rounds: Array<{round: number, tasksPromoted: number, criteriaClosed: number, criteriaOpen: number}>,
 *   criteria: Array<{id: string, statement: string, status: string, cause: string|null, stopReason: string}>,
 * }} input
 * @returns {string} markdown for the `## Fix run` section
 */
/** Rendered in place of a blank `stopReason`, so an omission is visible in the report. */
const NO_STOP_REASON = 'no stop reason recorded';

function renderFixSummary(input) {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('renderFixSummary: input is required and must be an object');
  }
  const { rounds, criteria } = input;
  if (!Array.isArray(rounds)) {
    throw new TypeError('renderFixSummary: input.rounds is required and must be an array');
  }
  if (!Array.isArray(criteria)) {
    throw new TypeError('renderFixSummary: input.criteria is required and must be an array');
  }

  const lines = [];
  lines.push('## Fix run');
  lines.push('');

  if (rounds.length === 0) {
    lines.push('_No rounds ran._');
  } else {
    lines.push('| Round | Tasks promoted | Criteria closed | Still open |');
    lines.push('|-------|-----------------|------------------|-------------|');
    for (const r of rounds) {
      lines.push(
        `| ${escapeCell(r.round)} | ${escapeCell(r.tasksPromoted)} | ${escapeCell(r.criteriaClosed)} | ${escapeCell(r.criteriaOpen)} |`
      );
    }
  }
  lines.push('');

  if (criteria.length === 0) {
    lines.push('_None still open._');
  } else {
    lines.push('| ID | Statement | Status | Cause | Stop reason |');
    lines.push('|----|-----------|--------|-------|-------------|');
    for (const c of criteria) {
      const causeWords = c.cause == null ? CAUSE_LABEL.unrecorded : (CAUSE_LABEL[c.cause] ?? c.cause);
      // Every row carries a reason (O3: "reports the remainder, each with a reason"). A blank
      // stopReason is a composition defect upstream (verify-build.md --fix step 6); render it
      // as a visible placeholder rather than an empty cell that reads as "no reason needed".
      const stopReason =
        typeof c.stopReason === 'string' && c.stopReason.trim() !== ''
          ? c.stopReason
          : NO_STOP_REASON;
      lines.push(
        `| ${escapeCell(c.id)} | ${escapeCell(c.statement)} | ${escapeCell(c.status)} | ${escapeCell(causeWords)} | ${escapeCell(stopReason)} |`
      );
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// isVerificationUnfilled — preflight for `/implement-trd` §3.6a and `/verify-build` §2
// ---------------------------------------------------------------------------

/**
 * One entry per PRIOR shipped `verification.md` template — i.e. every version that existed
 * before the live template this module ships alongside (D13, VCON-B008). Keyed by a short
 * label `/implement-trd` §3.6a can quote in its preflight message (e.g. "your
 * verification.md predates the resource / read-only / fast-refresh sections"); valued by the
 * sha256 hex digest of that prior template's content run through the SAME `normalize()`
 * helper `isVerificationUnfilled` already uses for its live-template comparison, so a digest
 * means exactly what the current equality means.
 *
 * **Digests only — never the prior template's prose.** A project holding an old, unfilled
 * copy of `verification.md` must keep being recognised as unfilled after the live template
 * changes; embedding roughly 4 KB of retired template text in this module to make that check
 * would be the wrong half of the fix. A 64-character hash answers the same yes/no question.
 *
 * `pre-resource-table` is the template as it shipped before §1a (the resource table), the
 * `Loop may WRITE data?` column and §2's fast-refresh/full-deploy split existed — i.e. every
 * `verification.md` in the field before this change (`packages/core/lib/__fixtures__/
 * verification.pre-1.5.0.md` keeps a byte-for-byte copy for the test that proves this digest).
 */
const KNOWN_UNFILLED_DIGESTS = {
  'pre-resource-table': 'f783eac9043329f3730b819758625efaa95ec7dd982e90565cb0e66b24451690',
  // The first resource-table template (verification-convergence 1.5.0), before §1a said how
  // parallel checks pick distinct existing instances. Shipped live from 005c389 onward.
  'resource-table-v1': '67900ffeed4a7dad60e1557afcdba4ac7e5e04d2db38ee5bc9cfcb7bb60bf10d',
  // The second resource-table template (verification-md-setup D14), frozen the moment before
  // this change adds §5a (the coverage floor) and reworks the header (D13). Every project
  // scaffolded between the two changes holds exactly this copy
  // (`packages/core/lib/__fixtures__/verification.resource-table-v2.md`).
  'resource-table-v2': 'd1495d8d3240e6f413a96fc2a6b394978ebc8efe3425124dbe33226a1a51df97',
  // The coverage-floor template (never-unattended-paths FIX-001), frozen the moment before
  // this change adds §5b (the never-unattended paths brake). Every project scaffolded
  // between the two changes holds exactly this copy
  // (`packages/core/lib/__fixtures__/verification.coverage-floor-v1.md`).
  'coverage-floor-v1': 'f561757a678a062e375b9678d2798e85fb97fbbfe116548490498ec393f1e69b',
};

/**
 * Detects whether the project's `.claude/rules/verification.md` is still a shipped
 * template, unmodified — i.e. nobody has filled it in with real environments, credentials
 * and gaps. Both preflight steps read this file to decide, per criterion, whether it can be
 * exercised; an unfilled file resolves every criterion to "not verifiable here" exactly as a
 * genuinely-filled-but-empty-environments file would, so without this check the loop reports
 * a clean-looking `not_verifiable` tally with no hint that the emptiness is the owner's, not
 * the loop's.
 *
 * Compares content with surrounding whitespace and line-ending differences normalised away,
 * so re-saving the file in an editor that changes CRLF/LF or trims a trailing blank line does
 * not itself count as "filled in". Checked against the CURRENT template first (the primary,
 * unchanged check); when that fails, checked against every digest in
 * `KNOWN_UNFILLED_DIGESTS` (D13), so a project whose copy still matches an OLDER template is
 * still reported unfilled rather than silently reading as filled once the template moves on.
 *
 * @param {string} projectContent - contents of the project's own verification.md
 * @param {string} templateContent - contents of the shipped (current) template
 * @returns {{unfilled: boolean, matchedTemplate: string|null}} `matchedTemplate` is
 *   `'current'` when the project copy matches the live template, the `KNOWN_UNFILLED_DIGESTS`
 *   label of whichever prior template it matches instead, or `null` when the copy has been
 *   filled in and matches nothing known.
 */
// Shared with the CLI's template-missing fallback (D11), which needs the same digest match
// without a template to compare against first.
function normalizeVerificationContent(s) {
  return String(s).replace(/\r\n?/g, '\n').trim();
}

// @returns {string|null} the `KNOWN_UNFILLED_DIGESTS` label matching this (already-normalized)
// content, or `null` when it matches no known prior template.
function matchKnownUnfilledDigest(normalizedContent) {
  const digest = crypto.createHash('sha256').update(normalizedContent).digest('hex');
  for (const [label, knownDigest] of Object.entries(KNOWN_UNFILLED_DIGESTS)) {
    if (digest === knownDigest) return label;
  }
  return null;
}

function isVerificationUnfilled(projectContent, templateContent) {
  const normalizedProject = normalizeVerificationContent(projectContent);

  if (normalizedProject === normalizeVerificationContent(templateContent)) {
    return { unfilled: true, matchedTemplate: 'current' };
  }

  const matched = matchKnownUnfilledDigest(normalizedProject);
  if (matched) {
    return { unfilled: true, matchedTemplate: matched };
  }

  return { unfilled: false, matchedTemplate: null };
}

// ---------------------------------------------------------------------------
// missingVerificationSections — old-shape detection (D10)
// ---------------------------------------------------------------------------

// Current-shape sections a verification.md may lack, in file order (D10). Keyed by id;
// valued by the readout wording `/implement-trd` §3.6a and `/verify-build` §2 quote.
const VERIFICATION_SECTION_LABELS = {
  'resource-capacity': '§1a resource capacity (how many of each resource may exist at once)',
  'write-permission-column': "§1's `Loop may WRITE data?` column",
  'refresh-split': "§2's fast refresh / full deploy split",
  'coverage-floor': '§5a coverage floor',
  'never-unattended': '§5b never-unattended paths',
};

/**
 * Names, in file order, the current-shape sections a `verification.md` lacks (D10). Matching
 * is case-insensitive and structural — it looks at heading lines and table-header lines rather
 * than the whole document, so renumbering a heading (e.g. `## 1a.` -> `## 2.`) does not count
 * as missing, and a table cell that happens to mention "coverage floor" in prose does not
 * count as the section either.
 *
 * @param {string} content
 * @returns {string[]} ids from `VERIFICATION_SECTION_LABELS` the content lacks, in file order.
 */
function missingVerificationSections(content) {
  if (typeof content !== 'string') {
    throw new TypeError('missingVerificationSections: content must be a string');
  }
  const lines = maskFencedLines(content.replace(/\r\n?/g, '\n').split('\n'));

  const hasHeadingContaining = (needle) =>
    lines.some((line) => /^#{1,6}\s/.test(line) && line.toLowerCase().includes(needle));
  // Table rows only, as the doc comment above promises: the current template's own prose
  // names both columns ("Permitted values for **Loop may WRITE data?**", "a **fast refresh**
  // ... and a **full deploy**"), so an any-line match would call a file whose table lacks the
  // column complete merely because that prose survived.
  const hasTableRowContainingAll = (needles) =>
    lines.some((line) => {
      if (!line.trimStart().startsWith('|')) return false;
      const lower = line.toLowerCase();
      return needles.every((needle) => lower.includes(needle));
    });

  const missing = [];
  if (!hasHeadingContaining('resource capacity')) missing.push('resource-capacity');
  if (!hasTableRowContainingAll(['loop may write data?'])) missing.push('write-permission-column');
  if (!hasTableRowContainingAll(['fast refresh', 'full deploy'])) missing.push('refresh-split');
  if (!hasHeadingContaining('coverage floor')) missing.push('coverage-floor');
  if (!hasHeadingContaining('never unattended') && !hasHeadingContaining('never-unattended')) {
    missing.push('never-unattended');
  }
  return missing;
}

module.exports = {
  checkEvidence,
  decideNext,
  renderReport,
  readStopRule,
  decideFixRound,
  renderFixSummary,
  isVerificationUnfilled,
  missingVerificationSections,
  readCoverageFloor,
  recommendCoverageFloor,
  readNeverUnattended,
  VERIFICATION_SECTION_LABELS,
  CAUSES,
  DEFAULT_CAP,
  COVERAGE_FLOOR,
  LOCATOR_SCAN_BYTES,
};

// ---------------------------------------------------------------------------
// CLI — the only way the loop workflow reaches this module (D3)
// ---------------------------------------------------------------------------
//
// Follows trd-parser.js's manual entry point shape (`:741`): a usage line on stderr and
// `process.exit(1)` on misuse.
//
// The JSON payload for every subcommand accepts three forms, so the caller (the judge agent,
// per §3.3a) is never forced to interpolate free-text `reason` strings into a shell-quoted
// argument -- a single apostrophe in an exerciser's claim ("couldn't start the server") would
// otherwise terminate the shell quote and break the command:
//
//   '<json>'          the JSON text itself, inline (kept working -- phase 1's tests use it)
//   --file <path>     read the JSON payload from a file (the judge already writes files, so
//                      it can write the payload first, then pass the path)
//   -                 read the JSON payload from stdin
//
//   node functional-verification.js check-evidence '<claims-json>' <sinceSec>
//   node functional-verification.js check-evidence --file <path> <sinceSec>
//   node functional-verification.js check-evidence --state-dir <dir> --file <path> <sinceSec>   (covers from <dir>'s live-evidence manifest)
//   node functional-verification.js check-evidence - <sinceSec>        (payload piped on stdin)
//   node functional-verification.js decide-next '<input-json>'
//   node functional-verification.js decide-next --file <path>
//   node functional-verification.js decide-next -
//   node functional-verification.js render-report '<input-json>'
//   node functional-verification.js render-report --file <path>
//   node functional-verification.js render-report -
//   node functional-verification.js decide-fix-round '<input-json>'
//   node functional-verification.js decide-fix-round --file <path>
//   node functional-verification.js decide-fix-round -
//   node functional-verification.js render-fix-summary '<input-json>'
//   node functional-verification.js render-fix-summary --file <path>
//   node functional-verification.js render-fix-summary -

if (require.main === module) {
  const usage = () => {
    console.error(
      'Usage (JSON payload arg accepts inline JSON, `--file <path>`, or `-` for stdin):\n' +
        "  node functional-verification.js check-evidence [--state-dir <dir>] '<claims-json>'|--file <path>|- <sinceSec>\n" +
        "  node functional-verification.js decide-next '<input-json>'|--file <path>|-\n" +
        "  node functional-verification.js render-report '<input-json>'|--file <path>|-\n" +
        "  node functional-verification.js decide-fix-round '<input-json>'|--file <path>|-\n" +
        "  node functional-verification.js render-fix-summary '<input-json>'|--file <path>|-\n" +
        '  node functional-verification.js check-verification-unfilled <projectPath> [templatePath]\n' +
        '  node functional-verification.js read-coverage-floor <projectPath>\n' +
        '  node functional-verification.js recommend-coverage-floor <trdStateDir>\n' +
        '  node functional-verification.js read-never-unattended <verificationPath>\n' +
        '  node functional-verification.js check-never-unattended <trdPath> <verificationPath>'
    );
    process.exit(1);
  };

  // Resolves the JSON payload from the head of `rest`, whichever of the three forms it is,
  // and returns [jsonText|undefined, remainingArgs]. `jsonText` is undefined (not thrown) when
  // the form was well-formed but nothing was actually supplied, so callers can still run their
  // existing "was it provided" check and call usage() uniformly.
  function resolveJsonPayload(rest) {
    const [head, ...tail] = rest;
    if (head === '--file') {
      const [filePath, ...remaining] = tail;
      if (!filePath) return [undefined, remaining];
      return [fs.readFileSync(filePath, 'utf8'), remaining];
    }
    if (head === '-') {
      return [fs.readFileSync(0, 'utf8'), tail];
    }
    return [head, tail];
  }

  const [, , subcommand, ...rest] = process.argv;

  if (subcommand === 'check-evidence') {
    // `--state-dir <dir>` (verification-reuses-evidence AMEND-001): `covers` reaches the checker
    // ONLY from that feature's live-evidence manifest, matched by resolved artifact path. Any
    // `covers` in the claims payload is discarded, so no agent -- exerciser or Judge -- can
    // supply the hashes that decide whether old evidence is reused.
    let stateDir = null;
    const sd = rest.indexOf('--state-dir');
    if (sd !== -1) {
      stateDir = rest[sd + 1];
      rest.splice(sd, 2);
    }
    const [claimsJson, remaining] = resolveJsonPayload(rest);
    const [sinceSecArg] = remaining;
    const sinceSec = Number(sinceSecArg);
    if (!claimsJson || sinceSecArg === undefined || !Number.isFinite(sinceSec) || sinceSec <= 0) {
      // A non-numeric sinceSec would make every `mtimeSec > NaN` comparison false, silently
      // reporting every artifact as `stale`. Fail loudly instead of fabricating gaps.
      //
      // `<= 0` is the same guard against the strictly worse direction. `Number('')` is 0 and
      // finite, so an empty or zeroed sinceSec slipped past the finiteness check and made
      // every mtime since 1970 "strictly greater than" it — the staleness rule, the one part
      // of tier 1 that ties evidence to the code it claims to prove, silently passing an
      // artifact of any age. A real HEAD commit time is never zero or negative.
      usage();
    } else {
      const coversByArtifact = new Map(
        stateDir
          ? require('./live-evidence').read(stateDir).map((e) => [path.resolve(e.artifact), e.covers])
          : []
      );
      const claims = JSON.parse(claimsJson).map((claim) => {
        const { covers: _discarded, ...rest } = claim || {};
        const covers =
          typeof rest.artifact === 'string' ? coversByArtifact.get(path.resolve(rest.artifact)) : undefined;
        return covers ? { ...rest, covers } : rest;
      });
      console.log(JSON.stringify(checkEvidence(claims, sinceSec)));
    }
  } else if (subcommand === 'decide-next') {
    const [inputJson] = resolveJsonPayload(rest);
    if (!inputJson) {
      usage();
    } else {
      console.log(JSON.stringify(decideNext(JSON.parse(inputJson))));
    }
  } else if (subcommand === 'render-report') {
    const [inputJson] = resolveJsonPayload(rest);
    if (!inputJson) {
      usage();
    } else {
      console.log(renderReport(JSON.parse(inputJson)));
    }
  } else if (subcommand === 'decide-fix-round') {
    const [inputJson] = resolveJsonPayload(rest);
    if (!inputJson) {
      usage();
    } else {
      console.log(JSON.stringify(decideFixRound(JSON.parse(inputJson))));
    }
  } else if (subcommand === 'render-fix-summary') {
    const [inputJson] = resolveJsonPayload(rest);
    if (!inputJson) {
      usage();
    } else {
      console.log(renderFixSummary(JSON.parse(inputJson)));
    }
  } else if (subcommand === 'check-verification-unfilled') {
    // templatePath is optional (D11): a scaffolded project has no
    // `packages/core/templates/...` tree to pass, and §3.6a's call site would otherwise throw
    // on `readFileSync` there. Missing it degrades the check rather than crashing it.
    const [projectPath, templatePath] = rest;
    if (!projectPath) {
      usage();
    } else if (!fs.existsSync(projectPath)) {
      // Missing entirely is a distinct case from "present but unfilled" -- report it rather
      // than silently treating "no file" as either verdict. Unchanged shape (D11): there is no
      // project content to derive `missingSections` from.
      console.log(JSON.stringify({ unfilled: null, reason: 'missing', path: projectPath }));
    } else {
      const projectContent = fs.readFileSync(projectPath, 'utf8');
      const missingSections = missingVerificationSections(projectContent);
      // In a scaffolded project this module lives at `.claude/lib/`, and the one current copy
      // of the template there is the verification-setup skill's own `template.md` (a symlink
      // in the plugin, dereferenced by `cp -RL` at install and replaced on every --refresh).
      // Without this fallback the CURRENT unfilled template -- the commonest case in a fresh
      // project -- matches no prior-template digest and reports `template-missing` instead of
      // "never filled in".
      const skillTemplatePath = path.join(__dirname, '..', 'skills', 'verification-setup', 'template.md');
      const resolvedTemplatePath =
        templatePath && fs.existsSync(templatePath)
          ? templatePath
          : fs.existsSync(skillTemplatePath)
            ? skillTemplatePath
            : null;
      if (resolvedTemplatePath) {
        const templateContent = fs.readFileSync(resolvedTemplatePath, 'utf8');
        const result = isVerificationUnfilled(projectContent, templateContent);
        console.log(JSON.stringify({ ...result, missingSections }));
      } else {
        // No current template to compare against -- still check the prior-template digests
        // (D11), so a project holding an old, unfilled copy is still caught.
        const matched = matchKnownUnfilledDigest(normalizeVerificationContent(projectContent));
        if (matched) {
          console.log(JSON.stringify({ unfilled: true, matchedTemplate: matched, missingSections }));
        } else {
          console.log(
            JSON.stringify({
              unfilled: null,
              reason: 'template-missing',
              matchedTemplate: null,
              missingSections,
            })
          );
        }
      }
    }
  } else if (subcommand === 'read-coverage-floor') {
    const [projectPath] = rest;
    if (!projectPath) {
      usage();
    } else if (!fs.existsSync(projectPath)) {
      console.log(JSON.stringify({ floor: null, status: 'absent', raw: null, reason: 'missing' }));
    } else {
      const content = fs.readFileSync(projectPath, 'utf8');
      console.log(JSON.stringify(readCoverageFloor(content)));
    }
  } else if (subcommand === 'recommend-coverage-floor') {
    const [trdStateDir] = rest;
    if (!trdStateDir) {
      usage();
    } else if (!fs.existsSync(trdStateDir)) {
      // Distinct from "a directory with no satisfied runs": a wrong path (or a wrong cwd)
      // must not read as "this project has no history", which recommends no floor at all.
      console.log(
        JSON.stringify({ ...recommendCoverageFloor([]), skipped: [], reason: 'missing', path: trdStateDir })
      );
    } else {
      let entries = [];
      try {
        entries = fs.readdirSync(trdStateDir, { withFileTypes: true });
      } catch (e) {
        entries = [];
      }
      const runs = [];
      const skipped = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const statePath = path.join(trdStateDir, entry.name, 'verification-state.json');
        if (!fs.existsSync(statePath)) continue;
        try {
          const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          runs.push({
            feature: entry.name,
            outcome: parsed.outcome ?? null,
            criteria: Array.isArray(parsed.criteria) ? parsed.criteria : [],
          });
        } catch (e) {
          skipped.push(statePath);
        }
      }
      console.log(JSON.stringify({ ...recommendCoverageFloor(runs), skipped }));
    }
  } else if (subcommand === 'read-never-unattended') {
    const [verificationPath] = rest;
    if (!verificationPath) {
      usage();
    } else if (!fs.existsSync(verificationPath)) {
      console.log(JSON.stringify({ paths: [], status: 'absent', raw: null, reason: 'missing' }));
    } else {
      const content = fs.readFileSync(verificationPath, 'utf8');
      console.log(JSON.stringify(readNeverUnattended(content)));
    }
  } else if (subcommand === 'check-never-unattended') {
    const [trdPath, verificationPath] = rest;
    if (!trdPath || !verificationPath) {
      usage();
    } else {
      let touches;
      try {
        const trdMarkdown = fs.readFileSync(trdPath, 'utf8');
        const { tasks, grounding } = parseTrd(trdMarkdown, { path: trdPath });
        // A task with no grounding block, or one with no Touches, contributes nothing to
        // match -- so a TRD of such tasks would read "no hits" and pass the brake silently.
        // The brake cannot be evaluated for them: report invalid, naming each task.
        const ungrounded = tasks
          .filter((t) => !grounding[t.id] || !(grounding[t.id].touches || []).length)
          .map((t) => t.id);
        if (ungrounded.length > 0) {
          throw Object.assign(new Error(`no grounding Touches for: ${ungrounded.join(', ')}`), {
            ungrounded: true,
          });
        }
        // Every task's grounding `touches`, flattened, in grounding-block order -- the same
        // source `/plan --implement`'s brake reads (D: "gather touched files in code, never
        // have the model do either").
        touches = Object.values(grounding).flatMap((g) => g.touches || []);
      } catch (err) {
        // A TRD that cannot be read yields no touches to check, so the brake cannot be
        // evaluated -- report it as `invalid` (which stops the chain), never a stack trace
        // the caller has no instruction for.
        console.log(
          JSON.stringify({
            hits: [],
            status: 'invalid',
            raw: err.ungrounded ? err.message : `cannot read TRD ${trdPath}: ${err.message}`,
            touches: [],
          })
        );
        process.exitCode = 1;
      }

      if (touches !== undefined) {
        if (!fs.existsSync(verificationPath)) {
          console.log(JSON.stringify({ hits: [], status: 'absent', raw: null, touches }));
        } else {
          const verificationContent = fs.readFileSync(verificationPath, 'utf8');
          const { paths, status, raw } = readNeverUnattended(verificationContent);
          const hits = matchNeverUnattended(touches, paths);
          console.log(JSON.stringify({ hits, status, raw, touches }));
        }
      }
    }
  } else {
    usage();
  }
}
