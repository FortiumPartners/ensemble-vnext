# Functional Success Definition: refine-recommended-option

**Source**: docs/TRD/refine-recommended-option.md §Intended Change (extracted copy read from `.trd-state/refine-recommended-option/intended-change.txt`; the TRD itself was not read)
**Source kind**: intended-change
**Derived**: 2026-11-13T18:05:00Z
**Criteria**: 23

Line numbers in `Cites` refer to the extracted source file above as numbered by `cat -n`
(line 1 is blank): lines 4-6 = the refine-prd item, 7-9 = refine-trd, 10-12 = refine-verification,
13-14 = refine-design, 16-22 = the "After" paragraph. Every row is derived from that text alone;
no TRD, task list or plan was read. The must-pass objectives were received as `{id, text}` only
and are used solely to fill the `Must pass` cell.

**What the source does not give the deriver.** The "After" paragraph says the new subsection
contains "the rule text given under Decision, word for word", but the Decision text itself was
not part of the extracted source. So FS-2 checks the four subsections against each other and
against that Decision text (which the exerciser can read; the deriver could not), and FS-3 to
FS-8 check for the six elements the source itself names as missing today (line 11-12: "the
label, the order, the reason, the no-recommendation case, item-by-item batches or plain words").
Wording the objectives carry but the source does not ("one-line" reason, "never by its id
alone") is not written into any criterion.

**The four files.** "The four refine command files" means `packages/core/commands/refine-prd.md`,
`refine-trd.md`, `refine-verification.md` and `refine-design.md`. "Inside `## Modes`" means after
that file's `## Modes` heading and before the next `## ` heading.

**How these are checked.** FS-1 to FS-19 are prose and test checks in the `local` environment
(`verification.md` §1): a transcript of `grep -n` / `awk` extraction, `cmp` or `shasum`, or
`npx jest <suite> --verbose`, captured to a file under the evidence folder with its exit code.
FS-20 to FS-23 are behaviour of the interactive commands in a live model session, in the
`fixtures` environment: a scaffolded fixture slot holding a small PRD (and, for refine-trd, a
TRD) with at least two open questions and at least two findings the challenge pass will raise,
driven through a Forge-spawned session whose `AskUserQuestion` prompts Forge answers (the route
`verification.md` §1 names for interactive commands). The artifact is that session's transcript,
which records each `AskUserQuestion` call's input. They are `[inferred]`: the source states the
change as file text, and that the questions themselves then carry a recommendation is the
intended effect of that text, not something the source states as observed.

**Deliberately omitted.** Live-session criteria for `/refine-verification` and `/refine-design`
are not written: the source states their change only as file text (lines 10-14, 19-20), and no
must-pass objective names them. Their prose criteria (FS-1 to FS-8, FS-13, FS-14, FS-19) stand.

**A criterion carrying a `Parts` count cannot pass incrementally.** It resolves `met` only when
every part is proven; 3 of 4 files is `not_met` with the missing file named.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | Each of the 4 refine command files has exactly one `### Putting a question to the owner` heading, and it sits inside that file's `## Modes` section | Intended Change line 16-17 ("each of the four files carries one subsection, `### Putting a question to the owner`, in its `## Modes` section") | Transcript per file: `grep -n '^## \|^### Putting a question to the owner$'` showing the count of the subsection heading is 1 and its line number falls between the `## Modes` line and the next `## ` line | [read] | locator | 4 | O1 |
| FS-2 | The body of the `### Putting a question to the owner` subsection is the same text, word for word, in all 4 files, and matches the rule text under Decision in the Intended Change | Intended Change line 17 ("containing the rule text given under Decision, word for word") | The subsection body extracted from each file (heading to the next heading), then `diff` of each pair and of each against the Decision text — empty diffs, with the extraction and diff commands and exit codes in the transcript | [read] | locator | 4 | |
| FS-3 | The subsection, in each of the 4 files, requires that a question mark one option "(Recommended)" | Intended Change line 11-12 (today the file does not require "the label"); line 13-14 (refine-design's existing "(Recommended)" label) | The extracted subsection of each file, with the sentence requiring the "(Recommended)" label quoted | [inferred] | locator | 4 | O1 |
| FS-4 | The subsection, in each of the 4 files, requires that the recommended option be listed first | Intended Change line 11-12 (today the file does not require "the order") | The extracted subsection of each file, with the sentence requiring the recommended option to come first quoted | [inferred] | locator | 4 | O1 |
| FS-5 | The subsection, in each of the 4 files, requires that the recommendation come with a reason | Intended Change line 8 ("does not … require a reason"); line 11-12 ("the reason"); line 13-14 ("says why") | The extracted subsection of each file, with the sentence requiring a reason for the recommendation quoted | [inferred] | locator | 4 | O1 |
| FS-6 | The subsection, in each of the 4 files, covers the case where no option is recommended, saying what the question does instead | Intended Change line 11-12 (today the file does not cover "the no-recommendation case") | The extracted subsection of each file, with the sentence covering the no-recommendation case quoted | [inferred] | locator | 4 | O1 |
| FS-7 | The subsection, in each of the 4 files, says that in a batch of several items the rule applies to each item on its own | Intended Change line 11-12 (today the file does not require "item-by-item batches") | The extracted subsection of each file, with the sentence applying the rule item by item in a batch quoted | [inferred] | locator | 4 | O2 |
| FS-8 | The subsection, in each of the 4 files, requires that each item put to the owner be explained in plain words | Intended Change line 11-12 (today the file does not require "plain words") | The extracted subsection of each file, with the sentence requiring plain words quoted | [inferred] | locator | 4 | O2 |
| FS-9 | In `refine-prd.md`, the Phase 0 interactive instruction (where open questions are put to the owner) names `Putting a question to the owner` | Intended Change line 4-5 (Phase 0 "never asks for a recommendation"); line 18-20 ("refine-prd … Phase 0 Interactive … points at that subsection by name") | Transcript: the Phase 0 `**Interactive:**` paragraph of `refine-prd.md`, printed with line numbers, containing the subsection's name | [read] | locator | | O1 |
| FS-10 | In `refine-prd.md`, the Phase 2 interactive instruction (where findings are presented and the owner is asked) names `Putting a question to the owner` | Intended Change line 5-6 (Phase 2 "says only 'present findings grouped by action, ask, apply'"); line 18-20 ("Phase 2 Interactive … points at that subsection by name") | Transcript: the `### Phase 2: Apply` `**Interactive:**` text of `refine-prd.md`, printed with line numbers, containing the subsection's name | [read] | locator | | O1, O2 |
| FS-11 | In `refine-trd.md`, the Phase 0 `### Interactive` instruction names `Putting a question to the owner` | Intended Change line 7-8 (Phase 0 "does not mark it as recommended or require a reason"); line 18-20 ("refine-trd: Phase 0 Interactive … points at that subsection by name") | Transcript: the Phase 0 `### Interactive` block of `refine-trd.md`, printed with line numbers, containing the subsection's name | [read] | locator | | O1 |
| FS-12 | In `refine-trd.md`, the Phase 2 interactive instruction names `Putting a question to the owner` | Intended Change line 9 (Phase 2 "has the same bare 'present findings grouped by action, ask' line"); line 18-20 ("Phase 2 Interactive … points at that subsection by name") | Transcript: the `### Phase 2: Apply` interactive text of `refine-trd.md`, printed with line numbers, containing the subsection's name | [read] | locator | | O1, O2 |
| FS-13 | In `refine-verification.md`, the `### Interactive` block under `## Open items` names `Putting a question to the owner` | Intended Change line 10-12; line 19-20 ("refine-verification: `### Interactive` under Open items … points at that subsection by name") | Transcript: the `### Interactive` block under `## Open items` of `refine-verification.md`, printed with line numbers, containing the subsection's name | [read] | locator | | |
| FS-14 | In `refine-design.md`, the `## Modes` paragraph that describes interactive asking names `Putting a question to the owner` | Intended Change line 13-14; line 19-20 ("refine-design: the Modes paragraph … points at that subsection by name") | Transcript: the interactive-asking paragraph of `refine-design.md`'s `## Modes` section, printed with line numbers, containing the subsection's name | [read] | locator | | |
| FS-15 | A new Jest suite exists for this change and passes | Intended Change line 20-22 ("A new Jest suite asserts …") | `npx jest <suite path> --verbose` transcript with exit code 0, plus `git status`/`git log` output showing the suite file is new on this branch | [read] | locator | | |
| FS-16 | That suite asserts, for each of the 4 files, that the `### Putting a question to the owner` subsection and its key sentences are present | Intended Change line 20-21 ("asserts that the subsection and its key sentences are in each file") | The `--verbose` Jest transcript listing a passing test per file for the subsection and its key sentences, and the suite source lines that make those assertions | [read] | locator | 4 | |
| FS-17 | That suite asserts that each asking site named in FS-9 to FS-14 points at the subsection | Intended Change line 21 ("that each asking site points at it") | The `--verbose` Jest transcript listing passing tests covering the six asking sites (refine-prd Phase 0 and Phase 2, refine-trd Phase 0 and Phase 2, refine-verification Open items Interactive, refine-design Modes), and the suite source lines that make those assertions | [read] | locator | 6 | |
| FS-18 | That suite asserts that each `.claude/commands/` copy of the 4 files is byte-identical to its `packages/core/commands/` source | Intended Change line 21-22 ("that each `.claude/commands/` copy is byte-identical") | The `--verbose` Jest transcript listing a passing byte-identity test per file, and the suite source lines comparing the two copies | [read] | locator | 4 | |
| FS-19 | Each of the 4 `.claude/commands/refine-*.md` copies is byte-identical to its `packages/core/commands/` source | Intended Change line 21-22 ("each `.claude/commands/` copy is byte-identical") | Transcript of `cmp` (or `shasum -a 256`) for each of the 4 pairs, exit code 0 for each | [read] | locator | 4 | |
| FS-20 | In an interactive `/refine-prd` run, every Phase 0 question put to the owner marks one option "(Recommended)", lists it first and gives a reason, or says plainly why no option is recommended | Intended Change line 4-5 (Phase 0 "never asks for a recommendation"); line 11-12 (label, order, reason, no-recommendation case); line 16-19 (Phase 0 Interactive points at the rule) | Fixture-session transcript of an interactive `/refine-prd` run over a PRD with at least two open questions, recording each `AskUserQuestion` input: for each question, the first option's label carrying "(Recommended)" with a reason, or a stated reason none is recommended | [inferred] | locator | | O1 |
| FS-21 | In an interactive `/refine-prd` run, when Phase 2 puts several findings to the owner in one multi-select batch, each finding is explained in plain words and carries its own recommendation and reason (or its own statement of why none) | Intended Change line 5-6 (Phase 2 "present findings grouped by action, ask"); line 11-12 (item-by-item batches, plain words, label, reason); line 18-19 (Phase 2 Interactive points at the rule) | Fixture-session transcript of the same kind, reaching Phase 2 with at least two findings, recording the `AskUserQuestion` input for the findings batch: each finding's option text describing the finding in words (not only its id) with its own recommendation and reason | [inferred] | locator | | O1, O2 |
| FS-22 | In an interactive `/refine-trd` run, every Phase 0 question put to the owner marks one option "(Recommended)", lists it first and gives a reason, or says plainly why no option is recommended | Intended Change line 7-8 (Phase 0 "does not mark it as recommended or require a reason"); line 11-12; line 16-19 | Fixture-session transcript of an interactive `/refine-trd` run over a TRD with at least two open questions, recording each `AskUserQuestion` input: for each question, the first option's label carrying "(Recommended)" with a reason, or a stated reason none is recommended | [inferred] | locator | | O1 |
| FS-23 | In an interactive `/refine-trd` run, when Phase 2 puts several findings to the owner in one multi-select batch, each finding is explained in plain words and carries its own recommendation and reason (or its own statement of why none) | Intended Change line 9 (Phase 2 "same bare 'present findings grouped by action, ask' line"); line 11-12; line 18-19 | Fixture-session transcript of an interactive `/refine-trd` run reaching Phase 2 with at least two findings, recording the `AskUserQuestion` input for the findings batch: each finding described in words with its own recommendation and reason | [inferred] | locator | | O1, O2 |
