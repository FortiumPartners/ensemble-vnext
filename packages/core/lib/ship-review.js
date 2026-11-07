'use strict';

/**
 * ship-review.js -- decides whether a pull request carries the review a `request-review` step
 * asked for, when the reviewer posts under the run's own GitHub login (`tool=claude`: the
 * headless `claude` uses the owner's `gh` credentials, so there is no bot name to match).
 *
 * WHY A SCRIPT: the live test (2026-11-07) matched "the tool's login" by judgment. The rule is
 * three exact conditions, so it belongs in code that a model calls, not in prose it interprets.
 *
 * A review is the tool's when ALL hold:
 *   1. its author's login equals the login `gh api user --jq .login` returned;
 *   2. it is on the current head: its commit id equals `head` (a full id, or a prefix of at
 *      least 7 characters of either side);
 *   3. it was submitted at or after `requestedAt` (ISO 8601).
 * A review missing any field is not the tool's. Each rejected review is named with the first
 * condition it fails, so a non-match is explainable.
 *
 * Input reviews are the `reviews` array of `gh pr view <pr> --json reviews`
 * (`{ author: { login }, commit: { oid }, submittedAt, state }`).
 *
 * CLI (one JSON line, exit 0; exit 2 on a usage error):
 *   node ship-review.js match --login <login> --head <sha> --requested-at <iso> [--file <json>]
 * The JSON (`--file`, or stdin when absent) is either the reviews array or the whole
 * `gh pr view --json reviews` object.
 */

const fs = require('fs');

function commitMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  return short.length >= 7 && long.startsWith(short);
}

/**
 * @param {{reviews: object[], login: string, head: string, requestedAt: string}} args
 * @returns {{matched: boolean, review: object|null, rejected: {index: number, author: string|null, reason: string}[], error?: string}}
 */
function matchToolReview({ reviews, login, head, requestedAt }) {
  if (!login) return { matched: false, review: null, rejected: [], error: 'no login: gh api user gave none' };
  if (!head) return { matched: false, review: null, rejected: [], error: 'no head commit given' };
  const since = Date.parse(requestedAt);
  if (Number.isNaN(since)) return { matched: false, review: null, rejected: [], error: `requestedAt is not a time: ${requestedAt}` };
  if (!Array.isArray(reviews)) return { matched: false, review: null, rejected: [], error: 'reviews is not an array' };

  const rejected = [];
  let review = null;
  reviews.forEach((r, index) => {
    const author = r && r.author && r.author.login ? r.author.login : null;
    const oid = r && r.commit && r.commit.oid ? r.commit.oid : null;
    const at = r && r.submittedAt ? Date.parse(r.submittedAt) : NaN;
    let reason = null;
    if (author !== login) reason = `author ${author || 'unknown'} is not ${login}`;
    else if (!commitMatches(oid, head)) reason = `on commit ${oid || 'unknown'}, not the current head ${head}`;
    else if (Number.isNaN(at) || at < since) reason = `submitted ${r && r.submittedAt ? r.submittedAt : 'at an unknown time'}, before the request at ${requestedAt}`;
    if (reason) rejected.push({ index, author, reason });
    else if (!review) review = r;
  });
  return { matched: review !== null, review, rejected };
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const USAGE = 'usage: ship-review.js match --login <login> --head <sha> --requested-at <iso> [--file <json>]\n';

function main(argv, stdin = () => fs.readFileSync(0, 'utf8')) {
  const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  if (argv[0] !== 'match' || !flag(argv, '--login') || !flag(argv, '--head') || !flag(argv, '--requested-at')) {
    process.stderr.write(USAGE);
    return 2;
  }
  let data;
  try {
    const file = flag(argv, '--file');
    data = JSON.parse(file ? fs.readFileSync(file, 'utf8') : stdin());
  } catch (err) {
    emit({ matched: false, review: null, rejected: [], error: `reviews JSON unreadable: ${err.message}` });
    return 0;
  }
  const reviews = Array.isArray(data) ? data : data && data.reviews;
  emit(matchToolReview({ reviews, login: flag(argv, '--login'), head: flag(argv, '--head'), requestedAt: flag(argv, '--requested-at') }));
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { matchToolReview, commitMatches, main };
