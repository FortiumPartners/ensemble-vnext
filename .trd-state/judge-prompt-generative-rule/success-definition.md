# Functional Success Definition: judge-prompt-generative-rule

**Source**: §Behaviour Preserved (extracted text, supplied verbatim)
**Source kind**: behaviour-preserved
**Derived**: 2026-08-25
**Criteria**: 13

This is a refactor. The source's entire claim is that observable behaviour does **not**
change, so every criterion below is of the form "this named check still passes" or "this
named surface is unchanged". No criterion asks for an improvement in any score, because the
source asks for none — a criterion demanding a better number would be invented, and would
license a change the source forbids.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation |
|----|----------------------|-------|------------------------------|------------|
| FS-1 | `node test/discipline-corpus/score.js --detector judge --json` executes to completion and emits parseable JSON on stdout | domain-derived: "The test that must pass before AND after: `node test/discipline-corpus/score.js --detector judge --json`" presupposes the command runs at all, and the named `--json` flag presupposes machine-readable output; a scorer that crashes or emits prose yields no pass/fail to compare | Captured stdout at `.trd-state/judge-prompt-generative-rule/evidence/score-judge-after.json`, non-empty, exit code 0 recorded alongside, and the file parses as JSON | domain-derived |
| FS-2 | Run against the 6-case fixture, the judge detector scores 6/6 with TP=3, FP=0, TN=3, FN=0 | "Measured before touching anything (2026-08-25): the 6-case fixture scores 6/6 — TP=3 FP=0 TN=3 FN=0" | The FS-1 JSON, for the 6-case fixture, showing exactly TP=3 FP=0 TN=3 FN=0 | [read] |
| FS-3 | Run against the full corpus, the judge detector's confusion counts meet or exceed the recorded pre-change baseline — no more false negatives and no more false positives than the baseline recorded, over the same case set | "A full 67-case baseline run is in progress; its numbers are the floor this refactor must match." | Full-corpus JSON at `.trd-state/judge-prompt-generative-rule/evidence/score-judge-full-after.json` placed beside the recorded baseline (FS-4), with a written comparison of FP and FN against it | [read] |
| FS-4 | The pre-change full-corpus baseline exists as a recorded artifact on disk, with its case count and its TP/FP/TN/FN, before any after-run is compared against it | "A full 67-case baseline run is in progress; its numbers are the floor this refactor must match." | `.trd-state/judge-prompt-generative-rule/evidence/score-judge-full-before.json` (or the baseline's recorded location), non-empty, dated before the refactor's first source edit | [read] |
| FS-5 | No individual corpus case that the judge detector classified correctly before the change is classified incorrectly after it | domain-derived: aggregate confusion counts can be preserved while individual cases swap sides (one new FP offset by one recovered TN nets to zero). "Behaviour preserved" is a claim about cases, not about totals; totals alone would let a real behaviour change pass unseen | Per-case diff of the before (FS-4) and after (FS-3) JSON, listing every case id whose verdict changed, at `.trd-state/judge-prompt-generative-rule/evidence/per-case-diff.txt` — expected empty | domain-derived |
| FS-6 | `test/integration/tests/implement-trd-structure.test.sh` passes | "`build-judge-prompts.js` exports and CLI contract — `test/integration/tests/implement-trd-structure.test.sh` … assert[s] on its output." | BATS run output at `.trd-state/judge-prompt-generative-rule/evidence/implement-trd-structure.test.txt` with exit code 0 and zero failing cases | [read] |
| FS-7 | `packages/core/scripts/scaffold-project.test.sh` passes | "`build-judge-prompts.js` exports and CLI contract — … `packages/core/scripts/scaffold-project.test.sh` both assert on its output." | BATS run output at `.trd-state/judge-prompt-generative-rule/evidence/scaffold-project.test.txt` with exit code 0 and zero failing cases | [read] |
| FS-8 | The module exports of `build-judge-prompts.js` are unchanged — same exported names, same shape, nothing removed or renamed | "The public surface that must not move: `build-judge-prompts.js` exports and CLI contract" | A recorded listing of the module's export keys before and after (e.g. `node -e` printing `Object.keys(require(...))` sorted, captured to `.trd-state/judge-prompt-generative-rule/evidence/exports-before.txt` and `exports-after.txt`), diffing empty | [read] |
| FS-9 | The CLI contract of `build-judge-prompts.js` is unchanged — the same invocation accepted, the same files written to the same paths, the same exit codes | "The public surface that must not move: `build-judge-prompts.js` exports and CLI contract" | Before/after capture of the CLI run — argv accepted, stdout, exit code, and the list of paths written — at `.trd-state/judge-prompt-generative-rule/evidence/cli-contract-{before,after}.txt`, diffing empty apart from prompt body text the refactor is entitled to change | [read] |
| FS-10 | `packages/core/hooks/hooks.manifest.json` still declares exactly three `hookType: "prompt"` entries, and each carries `timeout: 60` | "The three `hookType: \"prompt\"` manifest entries, their `timeout: 60`" | `jq` extraction of every `hookType == "prompt"` entry with its `timeout`, captured to `.trd-state/judge-prompt-generative-rule/evidence/manifest-prompt-entries.txt` — three rows, all `60` | [read] |
| FS-11 | Each of the three generated prompts still instructs the judge to answer with a `submit` call carrying `{ok, reason}` | "the `{ok, reason}` submit contract" | Grep of the three emitted prompt texts showing the `submit` / `ok` / `reason` contract present in each, captured to `.trd-state/judge-prompt-generative-rule/evidence/submit-contract.txt` — three matches, one per prompt | [read] |
| FS-12 | `generate-hooks-artifacts.sh --check` exits clean | "`generate-hooks-artifacts.sh --check` must stay clean" | Run output at `.trd-state/judge-prompt-generative-rule/evidence/generate-check.txt` with exit code 0 and no drift reported | [read] |
| FS-13 | All three `settings.json` copies carry the currently emitted prompt text — none is left holding a superseded version | "the prompts are GENERATED, and all three `settings.json` copies carry the emitted text" | For each of the three copies, the embedded prompt text compared against the generator's emitted text, captured to `.trd-state/judge-prompt-generative-rule/evidence/settings-copies.txt` — three matches, zero mismatches | [read] |

## Notes on the floor (read before judging FS-2, FS-3, FS-5)

**The floor is the in-progress 67-case baseline, not the figures in `RESULTS.md`.** The source
records `RESULTS.md`'s last full run (2026-08-13, TP=25 FP=2 TN=39 FN=0 — precision 92.6%,
recall 100%) and explicitly labels it **pre-growth**. Those numbers are historical context,
not the bar: the corpus has grown since. FS-3 is judged against the artifact named in FS-4,
and if that artifact does not exist, FS-3 is unverifiable — not met, and not failed either.

**The judge detector is model-evaluated, so repeated runs on the same corpus can differ.**
This is stated in the project's own `constitution.md` (Principle 4: model-judged hooks "have
been observed to vary [their] false-positive and false-negative calls across identical
repeated runs"). Two consequences for judging the criteria above, both domain-derived:

- FS-3 is a floor comparison (`FP ≤ baseline`, `FN ≤ baseline`), never an equality check. An
  exact-match requirement would fail on run-to-run variance alone and say nothing about the
  refactor.
- A single after-run that misses the floor by one case is weak evidence of a regression. Where
  the margin is one case, re-running and recording both runs is the honest resolution; a
  criterion resolved on one noisy sample is the kind of false negative this loop exists to
  avoid. FS-5's per-case diff is the sharper instrument — a changed verdict on a specific case
  is a fact about that case, not about the aggregate.

## Two things deliberately not made criteria

- **No criterion asks for a better score.** The source's whole claim is that behaviour does
  not change. "Improve precision" appears nowhere in it, and adding it would authorize the
  behaviour change the source forbids.
- **No criterion names the internals of the refactor.** The source names only outputs and
  public surfaces. Anything about how the prompts come to be generated is plan, not outcome,
  and a criterion derived from a plan is satisfied by construction.

## Path correction

The source names `build-judge-prompts.js` without a directory. The file resolves to
`packages/core/hooks/prompts/build-judge-prompts.js`; there is no
`packages/core/scripts/build-judge-prompts.js` [ran: `find . -name 'build-judge-prompts*'`,
2026-08-25]. FS-8 and FS-9 target the resolved path.

The three `settings.json` copies referenced by FS-13 are, on the evidence of a repo-wide
find [inferred — the source does not enumerate them]: `.claude/settings.json`,
`packages/full/.claude/settings.json`, and
`packages/core/templates/claude-directory/settings.json`. `generate-hooks-artifacts.sh
--check` (FS-12) is the authority on which copies it governs; if it checks a different set,
FS-13 follows the generator, not this note.
