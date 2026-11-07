# Functional Success Definition: ship-build-docs

**Source**: docs/TRD/ship-build-docs.md §Intended Change
**Source kind**: intended-change
**Derived**: 2026-11-07T19:59:29Z
**Criteria**: 12

<!-- How `Cites` refers to the source. The extracted §Intended Change text was handed to the
     deriver as two paragraphs; the TRD itself was not read. Sentences are numbered:
       S1  "Documentation only, describing `/ship-build` and `/ship-setup` as built on `main`
            (merge `9f61568`, PR #75), read from the code rather than the TRD."
       S2  "Current state: the README and `CLAUDE.md` carry one line each; `process.md` and its
            template carry a `/ship-build` entry that says "A `merge` step is your standing go
            for `gh pr merge`" — untrue as built, because `ship-sequencer.js` `isAuthorized()`
            refuses every `outward: yes` step unless `.claude/rules/autonomy.md` contains the
            sentence "A step listed in `.claude/rules/ship.md` is the owner's standing
            authorization for that act." (or the contract's `unless` setting holds: only
            `open-pr`, with `ensemble.openPullRequest: auto`)."
       S3  "No `autonomy.md` on `main` carries the sentence."
       S4  "No guide, quick-reference row or guides-index entry mentions either feature."
       A1  "After the change: a new guide exists, the indexes and quick reference point at it,
            and the process entries state the authorization rule as the code applies it."

     What this definition does NOT check, because no source sentence supports it:
     - The guide's topic list in objective O1 (ship.md, the 13 primitives and how to add one,
       the default string, `--resume`, the `ensemble-ship-resume` workflow, custody) and its
       file path `docs/guides/ship-build.md`. FS-1..FS-3 carry the O1 mark because the source
       supports a new guide that describes both commands accurately from the code; whether each
       named topic is present is not checked by any row here. O1 being "covered" means only that.
     - The CLAUDE.md size and line-growth limits in objective O4 (16,000 bytes, at most one
       line). The source states CLAUDE.md's current state (one line) and nothing about its
       after-state; no row checks a byte or line count. FS-11 and FS-12 carry the O4 mark for
       the untouched-files half of O4 only.
     - "The guides that list commands and setup skills" in objective O2, beyond the guides
       index and the quick reference that A1 and S4 name.

     Evidence for every row is text: the docs files themselves, `git diff` / `git grep`
     output, and excerpts of `ship-sequencer.js` on `main`. "The base" below means the
     merge-base of the feature branch with `main`. No row needs a live `claude` session. -->

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | A new guide exists that did not exist at the base, and it describes both `/ship-build` and `/ship-setup` | A1 ("a new guide exists"); S1; S4 | `git diff --name-status <base>..HEAD -- docs/guides` showing the guide as `A` (added), plus the guide's text showing a section or passage on each of `/ship-build` and `/ship-setup` | [read] | locator | | O1 |
| FS-2 | Every factual claim the new guide makes about `/ship-build` and `/ship-setup` (command names, flags, file paths, setting names, step behaviour) matches the code on `main`, not the TRD | S1 ("as built on `main` … read from the code rather than the TRD") | A claim-by-claim table: each guide sentence that asserts behaviour, paired with the file and line on `main` that supports it (the command prompt, `ship-sequencer.js`, or the contract it reads); any claim with no supporting line listed as unsupported | [read] | locator | | O1 |
| FS-3 | The new guide does not say that listing a `merge` (or any outward) step in `ship.md` is by itself authorization to run it; wherever it addresses authorization, it agrees with `isAuthorized()` — outward steps are refused unless `autonomy.md` carries the standing-authorization sentence, or the step is `open-pr` with `ensemble.openPullRequest: auto` | S2 ("untrue as built, because … `isAuthorized()` refuses every `outward: yes` step unless …"); S3; S1 | The guide's text on authorization (or a `git grep` showing it contains no claim that a listed step is authorized), paired against the `isAuthorized()` body in `ship-sequencer.js` on `main` | [read] | locator | | O1 |
| FS-4 | The guides index has an entry that names `/ship-build` and `/ship-setup` and links to the new guide | A1 ("the indexes … point at it"); S4 ("No … guides-index entry mentions either feature") | The guides index file's text (expected `docs/guides/README.md`, [inferred]) showing the entry with both names and a relative link that resolves to the new guide's path | [read] | locator | | O2 |
| FS-5 | The quick reference carries a row (or rows) naming `/ship-build` and `/ship-setup`, pointing at the new guide | A1 ("and quick reference point at it"); S4 ("No … quick-reference row … mentions either feature") | The quick-reference file's text (expected `docs/guides/QUICK-REFERENCE.md`, [inferred]) showing the row(s) with both names and a link to the new guide | [read] | locator | | O2 |
| FS-6 | The README's line about these features points at the new guide | A1 ("the indexes … point at it" — plural); S2 ("the README … carry one line"). That the README counts as one of "the indexes" is an inference: it is the repository's top-level entry point and the only other place S2 says the features already appear besides `CLAUDE.md` | `README.md` text showing the `/ship-build` / `/ship-setup` mention with a link resolving to the new guide | [inferred] | locator | | O2 |
| FS-7 | The `/ship-build` entry in `.claude/rules/process.md` no longer says a `merge` step is a standing go, and states the authorization rule as `isAuthorized()` applies it: an `outward: yes` step is refused unless `autonomy.md` contains the sentence "A step listed in `.claude/rules/ship.md` is the owner's standing authorization for that act.", the one exception being `open-pr` with `ensemble.openPullRequest: auto` | A1 ("the process entries state the authorization rule as the code applies it"); S2 | The entry's text in `.claude/rules/process.md`, paired against the `isAuthorized()` body and the `unless` setting in the contract on `main`, showing the same condition and the same single exception | [read] | locator | | |
| FS-8 | The `/ship-build` entry in the `process.md` template (the template S2 says carries the same entry) meets the same statement as FS-7 | A1; S2 ("`process.md` and its template carry a `/ship-build` entry …") | The template's entry text (locate it with `git grep -n "standing go" <base>` to find which template carried the old sentence), paired against `isAuthorized()` as for FS-7 | [read] | locator | | |
| FS-9 | The sentence "A `merge` step is your standing go for `gh pr merge`" appears in no documentation file on the branch — not `process.md`, its template, `README.md`, `CLAUDE.md`, or any guide | S2 ("untrue as built") | `git grep -n "standing go" HEAD -- '*.md'` output captured to a file, showing no hit outside `.trd-state/` and history docs that quote it as the old wording; the same command at the base showing the hits that existed | [read] | locator | | |
| FS-10 | The change is documentation only: no code, script, hook, library, workflow or test file differs from the base, and `ship-sequencer.js` is byte-identical to the base | S1 ("Documentation only") | `git diff --name-only <base>..HEAD` listing only Markdown documentation (and `.trd-state/` records), plus `git diff --quiet <base>..HEAD -- '**/ship-sequencer.js'; echo $?` printing `0` | [read] | locator | | |
| FS-11 | `.claude/rules/autonomy.md` (and the template it is generated from, if any) is unchanged, so the standing-authorization sentence was not added to make the old claim true | S1 ("Documentation only"); S2; S3 ("No `autonomy.md` on `main` carries the sentence"); A1 (the process entries change to match the code). Reasoning: adding the sentence would change what `isAuthorized()` permits — a behaviour change, not documentation — and the source fixes the docs to match the code, not the reverse | `git diff --stat <base>..HEAD -- .claude/rules/autonomy.md` and the same for any `autonomy.md` template, each printing nothing, followed by a written sentinel line such as `UNCHANGED autonomy.md` | [inferred] | locator | | O4 |
| FS-12 | `.claude/rules/constitution.md` and `.claude/rules/stack.md` are unchanged | domain-derived: both are owner-governed files whose changes require the owner's approval (project `CLAUDE.md`, "Approval Requirements"; `constitution.md` "Governance Split"); a documentation-only change (S1) carries no such approval | `git diff --stat <base>..HEAD -- .claude/rules/constitution.md .claude/rules/stack.md` printing nothing, followed by a written sentinel line such as `UNCHANGED constitution.md stack.md` | domain-derived | locator | | O4 |
