'use strict';

/**
 * functional-verification.js — the deterministic half of functional verification (D3).
 *
 * Exports `checkEvidence()`, `decideNext()` and `renderReport()`, plus a CLI entry point
 * exposing all three as subcommands. See `docs/TRD/functional-verification.md` §3.2, §3.4
 * and §3.6 for the binding interface specs, and its `### FV-B001` grounding block in §9.
 *
 * This module is pure apart from `fs.statSync` in `checkEvidence()`. It uses no clock and no
 * git — `sinceSec` and `cap` are parameters, not internally computed, so every function here
 * is testable without a repository or a wall clock.
 *
 * Workflow scripts (`packages/core/workflows/*.js`) have no `require` — they are prompt-DSL
 * source text wrapped by `test-harness.js`, not a real Node module (D3). The CLI below is
 * therefore not a convenience: it is the *only* way `verify-functional.js`'s judge stage
 * reaches `decideNext()` and `renderReport()` (and the only way any agent reaches
 * `checkEvidence()`). A function exported here but absent from the CLI is unreachable from
 * the feature that needs it.
 */

const fs = require('fs');

// ---------------------------------------------------------------------------
// checkEvidence — tier 1 of FR-3 (§3.2)
// ---------------------------------------------------------------------------

/**
 * Deterministic, cheap tier-1 evidence check. Not settable by an agent: it only looks at
 * what is actually on disk.
 *
 * @param {Array<{criterion: string, artifact: string|null, reason?: string}>} claims
 * @param {number} sinceSec - The freshness floor, in seconds:
 *   `max(HEAD commit time, this run's verification-loop start time)`, derived by the command
 *   (`/implement-trd` Step 8.3, TRD §3.2) and passed in whole. An artifact whose mtime is not
 *   strictly greater than this is stale.
 *
 *   It is NOT HEAD's commit time alone. That is only a proxy for "when the code last changed",
 *   and it breaks on `--verify-functional --resume`: the phase loop is skipped, no new commit
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
 * @returns {Array<{criterion: string, tier1: 'pass'|'fail', artifact: string|null,
 *   bytes: number|null, mtimeSec: number|null,
 *   failure?: 'missing'|'empty'|'stale'|'no-artifact'|'not-a-file'}>}
 */
function checkEvidence(claims, sinceSec) {
  return claims.map((claim) => {
    const { criterion, artifact } = claim;

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

    if (!(mtimeSec > sinceSec)) {
      return { criterion, tier1: 'fail', artifact, bytes, mtimeSec, failure: 'stale' };
    }

    return { criterion, tier1: 'pass', artifact, bytes, mtimeSec };
  });
}

// ---------------------------------------------------------------------------
// decideNext — the loop-exit decision, FR-4 + D14, as arithmetic (§3.4, AC-5)
// ---------------------------------------------------------------------------

const DEFAULT_CAP = 3;

/**
 * @param {{
 *   iteration: number,
 *   gaps: string[],
 *   unbuilt: string[],
 *   previousGaps: string[]|null,
 *   cap?: number,
 * }} input
 * @returns {{action: 'exit-satisfied'|'exit-unbuilt'|'exit-stalled'|'exit-stuck'|'remediate',
 *   reason: string, closed: string[]}}
 */
function decideNext(input) {
  const { iteration, gaps, unbuilt, previousGaps } = input;
  const cap = input.cap ?? DEFAULT_CAP;

  // `closed` is previousGaps \ gaps — computed unconditionally so it is always accurate on
  // the returned object, regardless of which branch below fires.
  const closed = previousGaps == null ? [] : previousGaps.filter((id) => !gaps.includes(id));

  // Evaluation order is the specification (D14): unbuilt wins even over a clean gap set,
  // because a report that iterates on the fixable half while withholding "this was never
  // built" is the more misleading of the two outputs.
  if (unbuilt.length > 0) {
    return {
      action: 'exit-unbuilt',
      reason: `${unbuilt.length} criterion/criteria absent (unbuilt), not misbehaving — loop stops rather than debugging missing code`,
      closed,
    };
  }

  if (gaps.length === 0) {
    return {
      action: 'exit-satisfied',
      reason: 'no gaps remain — every criterion is met or not verifiable here',
      closed,
    };
  }

  // `previousGaps.length > 0` is load-bearing, not defensive. An empty previousGaps is
  // reachable -- verify-functional.js seeds it by filtering a resume snapshot for `not_met`,
  // so a snapshot from a run that exited satisfied or unbuilt yields [] rather than null --
  // and with no gap to close, "closed no gaps" is vacuously true. Without this clause a
  // resumed run exits `stalled` ("remediation is not converging") on its first iteration,
  // before the Debug stage has been dispatched even once.
  if (previousGaps != null && previousGaps.length > 0 && closed.length === 0) {
    return {
      action: 'exit-stalled',
      reason: 'iteration closed no gaps — remediation is not converging',
      closed,
    };
  }

  if (iteration >= cap) {
    return {
      action: 'exit-stuck',
      reason: `iteration cap (${cap}) reached with ${gaps.length} gap(s) still open`,
      closed,
    };
  }

  return {
    action: 'remediate',
    reason: `${gaps.length} gap(s) open — dispatching debug stage`,
    closed,
  };
}

// ---------------------------------------------------------------------------
// renderReport — FR-6, AC-9 (§3.6)
// ---------------------------------------------------------------------------

const OUTCOME_LABEL = {
  satisfied: 'Satisfied',
  unbuilt: 'Unbuilt',
  stalled: 'Stalled',
  stuck: 'Stuck',
  'not-run': 'Not Run',
};

function escapeCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * @param {{
 *   feature: string, prd: string, definitionPath: string,
 *   outcome: 'satisfied'|'unbuilt'|'stalled'|'stuck'|'not-run',
 *   reason: string,
 *   criteria: Array<{
 *     id: string, statement: string, cites: string,
 *     status: 'met'|'not_met'|'not_verifiable'|'unbuilt',
 *     artifact: string|null, reason: string|null,
 *     attempts: Array<{iteration: number, result: string}>,
 *     blocker: string|null,
 *   }>,
 * }} input
 * @returns {string} markdown
 */
function renderReport(input) {
  const { feature, prd, definitionPath, outcome, reason, criteria } = input;

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
  lines.push(`**Outcome**: ${OUTCOME_LABEL[outcome] ?? outcome}`);
  lines.push(`**Reason**: ${reason}`);
  lines.push(
    `**Criteria**: ${criteria.length} total — ${met.length} met, ${notMet.length} not met, ${notVerifiable.length} not verifiable, ${unbuilt.length} unbuilt` +
      (unrecognised.length > 0 ? `, ${unrecognised.length} unrecognised status` : '')
  );
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
    lines.push('| ID | Statement | Artifact |');
    lines.push('|----|-----------|----------|');
    for (const c of met) {
      lines.push(`| ${c.id} | ${escapeCell(c.statement)} | ${escapeCell(c.artifact)} |`);
    }
  }
  lines.push('');

  lines.push('## Not Met');
  lines.push('');
  if (notMet.length === 0) {
    lines.push('_None._');
  } else {
    lines.push('| ID | Statement | Reason | Blocker | Attempts |');
    lines.push('|----|-----------|--------|---------|----------|');
    for (const c of notMet) {
      const attempts = (c.attempts || [])
        .map((a) => `iter ${a.iteration}: ${a.result}`)
        .join('; ');
      lines.push(
        `| ${c.id} | ${escapeCell(c.statement)} | ${escapeCell(c.reason)} | ${escapeCell(c.blocker)} | ${escapeCell(attempts)} |`
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

module.exports = {
  checkEvidence,
  decideNext,
  renderReport,
  DEFAULT_CAP,
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
//   node functional-verification.js check-evidence - <sinceSec>        (payload piped on stdin)
//   node functional-verification.js decide-next '<input-json>'
//   node functional-verification.js decide-next --file <path>
//   node functional-verification.js decide-next -
//   node functional-verification.js render-report '<input-json>'
//   node functional-verification.js render-report --file <path>
//   node functional-verification.js render-report -

if (require.main === module) {
  const usage = () => {
    console.error(
      'Usage (JSON payload arg accepts inline JSON, `--file <path>`, or `-` for stdin):\n' +
        "  node functional-verification.js check-evidence '<claims-json>'|--file <path>|- <sinceSec>\n" +
        "  node functional-verification.js decide-next '<input-json>'|--file <path>|-\n" +
        "  node functional-verification.js render-report '<input-json>'|--file <path>|-"
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
      const claims = JSON.parse(claimsJson);
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
  } else {
    usage();
  }
}
