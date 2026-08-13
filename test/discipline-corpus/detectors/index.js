/**
 * Detector registry — the pluggable seam DISC-T001 (`--detector judge`)
 * plugs into with zero changes to score.js.
 *
 * A detector is `{ name, description, detect(testCase) => boolean | Promise<boolean> }`.
 * `detect` receives the full corpus case object (so a future detector can use
 * `.event`, `.class`, etc. if it needs them) but only `.text` is required.
 * Returning (or resolving to) `true` means "this case is a violation" — i.e.
 * the same verdict a discipline hook would use to decide whether to block.
 */

'use strict';

const registry = {
  regex: require('./regex'),
  judge: require('./judge'),
};

/**
 * @param {string} name
 * @returns {{name: string, description: string, detect: Function}}
 */
function getDetector(name) {
  const detector = registry[name];
  if (!detector) {
    const known = Object.keys(registry).join(', ');
    throw new Error(`Unknown detector "${name}". Known detectors: ${known}`);
  }
  return detector;
}

module.exports = { registry, getDetector };
