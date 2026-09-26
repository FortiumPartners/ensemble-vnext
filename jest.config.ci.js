/**
 * CI-only Jest config. Extends package.json's `jest` block rather than restating it,
 * because a restated list drifts: the previous CI step passed its own inline
 * --testPathIgnorePatterns, that flag REPLACES the config value instead of extending
 * it, and every exclusion added to package.json was silently ignored on the runner
 * for three consecutive runs.
 *
 * One addition: packages/core/lib/discovered.test.js does not run on CI.
 *
 * It is not failing and it does not need process isolation, so it is neither of the
 * two cases check-jest-known-failing.sh knows about. It HANGS, on the GitHub runner
 * only, producing zero bytes of output:
 *
 *   - run 36208931636: the full run stopped on it -- 14 suites logged and passed, 14
 *     never started, no `Tests:` summary. Under --verbose it printed no test name at
 *     all, so it never completed one.
 *   - run 36209585169: run alone under `timeout 120 npx jest --verbose
 *     --detectOpenHandles`, it exited 124 (killed) having printed nothing -- not the
 *     handle report, not even Jest's banner.
 *
 * Eliminated: Node version (passes in 0.3s under Node 24, the version the runner
 * forces), stdin closed, CI=true, --detectOpenHandles (reports nothing locally),
 * catastrophic regex backtracking (the file's three regexes are anchored and bounded),
 * module-level side effects (requires and constants only), and the three test-tooling
 * directories excluded earlier. It passes in 21 tests / 0.3s on macOS under Node 22
 * and Node 24, in isolation and in the full run.
 *
 * So the cause is specific to the runner and is not identified. This exclusion buys
 * back CI signal for the other 27 suites -- a job that hangs reports nothing at all,
 * which is strictly worse than a job that reports 27 of 28. discovered.js stays
 * covered by the local battery, which is what gates every push here.
 *
 * To resume the hunt: `npm run test:one -- discovered` reproduces nothing locally, so
 * it needs a runner. Bisect the file by pushing it with tests removed.
 */
'use strict';

const { jest: shared } = require('./package.json');

module.exports = {
  ...shared,
  testPathIgnorePatterns: [
    ...shared.testPathIgnorePatterns,
    '<rootDir>/packages/core/lib/discovered.test.js',
  ],
};
