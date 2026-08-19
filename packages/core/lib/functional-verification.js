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
 * @param {number} sinceSec - HEAD commit time (seconds). An artifact whose mtime is not
 *   strictly greater than this is stale: it predates the code it claims to prove.
 * @returns {Array<{criterion: string, tier1: 'pass'|'fail', artifact: string|null,
 *   bytes: number|null, mtimeSec: number|null, failure?: 'missing'|'empty'|'stale'|'no-artifact'}>}
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

  if (previousGaps != null && closed.length === 0) {
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

  const lines = [];
  lines.push(`# Functional Verification Report: ${feature}`);
  lines.push('');
  lines.push(`**Source PRD**: ${prd}`);
  lines.push(`**Success definition**: ${definitionPath}`);
  lines.push(`**Outcome**: ${OUTCOME_LABEL[outcome] ?? outcome}`);
  lines.push(`**Reason**: ${reason}`);
  lines.push(
    `**Criteria**: ${criteria.length} total — ${met.length} met, ${notMet.length} not met, ${notVerifiable.length} not verifiable, ${unbuilt.length} unbuilt`
  );
  lines.push('');

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
//   node functional-verification.js check-evidence '<claims-json>' <sinceSec>
//   node functional-verification.js decide-next '<input-json>'
//   node functional-verification.js render-report '<input-json>'

if (require.main === module) {
  const usage = () => {
    console.error(
      'Usage:\n' +
        "  node functional-verification.js check-evidence '<claims-json>' <sinceSec>\n" +
        "  node functional-verification.js decide-next '<input-json>'\n" +
        "  node functional-verification.js render-report '<input-json>'"
    );
    process.exit(1);
  };

  const [, , subcommand, ...rest] = process.argv;

  if (subcommand === 'check-evidence') {
    const [claimsJson, sinceSecArg] = rest;
    const sinceSec = Number(sinceSecArg);
    if (!claimsJson || sinceSecArg === undefined || !Number.isFinite(sinceSec)) {
      // A non-numeric sinceSec would make every `mtimeSec > NaN` comparison false, silently
      // reporting every artifact as `stale`. Fail loudly instead of fabricating gaps.
      usage();
    } else {
      const claims = JSON.parse(claimsJson);
      console.log(JSON.stringify(checkEvidence(claims, sinceSec)));
    }
  } else if (subcommand === 'decide-next') {
    const [inputJson] = rest;
    if (!inputJson) {
      usage();
    } else {
      console.log(JSON.stringify(decideNext(JSON.parse(inputJson))));
    }
  } else if (subcommand === 'render-report') {
    const [inputJson] = rest;
    if (!inputJson) {
      usage();
    } else {
      console.log(renderReport(JSON.parse(inputJson)));
    }
  } else {
    usage();
  }
}
