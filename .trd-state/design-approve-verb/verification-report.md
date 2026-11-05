# Functional Verification Report: design-approve-verb

**Source PRD**: docs/TRD/design-approve-verb.md ## Intended Change
**Success definition**: .trd-state/design-approve-verb/success-definition.md
**Outcome**: Must-Pass Unproven (no full-environment run declared)
**Reason**: must-pass criteria not proven: FS-20, FS-21, FS-23, FS-25 — the core was not shown to work
**Criteria**: 27 total — 20 met, 0 not met, 7 not verifiable, 0 unbuilt
**Coverage**: 20 of 27 proven — uncovered: FS-19, FS-20, FS-21, FS-22, FS-23, FS-24, FS-25
**Must pass**: 14 of 18 proven — unproven: FS-20 (not verifiable), FS-21 (not verifiable), FS-23 (not verifiable), FS-25 (not verifiable)
**Screenshots**: 1 shown
**Diagnosis**: 7 open — 7 capability absent
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Running the verb with no `--commit` on a clean design folder moves every named `draft` board to `approved`, sets each one's `approved_commit` to `HEAD`, and prints JSON carrying the keys `commit`, `approved`, `kept`, `rendered` and `renderSkipped` | .trd-state/design-approve-verb/evidence/s1/fx/fs1_2/r.stdout | 1 |
| FS-2 | A part board named to the verb is approved the same way as a to-be board: it moves from `draft` to `approved` with an `approved_commit` | .trd-state/design-approve-verb/evidence/s1/fx/fs1_2/r.stdout | 1 |
| FS-3 | Without `--commit`, an uncommitted change under the design folder is committed first with the message `chore(design): <slug> board changes before approval`, and that new `HEAD` is the approval commit recorded on the moved boards | .trd-state/design-approve-verb/evidence/s1/fx/fs3/log.txt | 1 |
| FS-4 | A named board that is already `approved` is not moved when `--reapprove` is absent: it is listed under `kept`, its `approved_commit` is unchanged, and no frame is rendered for it | .trd-state/design-approve-verb/evidence/s1/fx/fs4_5/keep.stdout | 1 |
| FS-5 | With `--reapprove`, a named board already `approved` is moved again: it receives a new `approved_commit` (the current approval commit) and appears under `approved`, not `kept` | .trd-state/design-approve-verb/evidence/s1/fx/fs4_5/re.stdout | 1 |
| FS-6 | Naming an id that is not in the map makes the verb exit 1 with an error that names that id, and nothing changes: no board moves, no commit is made, the map file is unchanged | .trd-state/design-approve-verb/evidence/s1/fx/fs6/r.stderr | 1 |
| FS-7 | Naming a board whose status is `building` or `shipped` makes the verb exit 1 with an error that names the board and its status, and nothing changes, even when the same call also names valid `draft` boards (those stay `draft`) | .trd-state/design-approve-verb/evidence/s1/fx/fs7a/r.stderr | 1 |
| FS-8 | With `--commit <sha>`, when the design folder differs from that sha (a later commit touching it, or an uncommitted change under it), the verb exits 1 naming the changed files and changes nothing | .trd-state/design-approve-verb/evidence/fs8-commit-past-sha.txt | 1 |
| FS-9 | With `--commit <sha>` and a design folder matching that sha, the moved boards' `approved_commit` is that sha (not a later `HEAD`), and no pre-approval commit is made | .trd-state/design-approve-verb/evidence/fs9.txt | 1 |
| FS-10 | With a working `--runtime`, the verb renders frames into `docs/ui/<slug>/screens/png/` for exactly the boards it moved to `approved` in that call, and `rendered` lists exactly those boards | .trd-state/design-approve-verb/evidence/fs10.txt | 1 |
| FS-11 | Run without `--runtime`, the verb still approves and commits the boards, puts the reason the render was skipped in `renderSkipped`, and does not exit 2 | .trd-state/design-approve-verb/evidence/fs11.txt | 1 |
| FS-12 | Run with a `--runtime` path that does not exist, the verb still approves and commits the boards, puts the reason in `renderSkipped`, and does not exit 2 | .trd-state/design-approve-verb/evidence/fs12.txt | 1 |
| FS-13 | When the render fails with the missing-tool error (Playwright or its browser not available), the verb still approves and commits the boards, puts the reason in `renderSkipped`, and does not exit 2 | .trd-state/design-approve-verb/evidence/fs13.txt | 1 |
| FS-14 | When the render throws for any other reason (for example a failed `git archive`), the verb still approves and commits the boards, puts the reason in `renderSkipped`, and does not exit 2 | .trd-state/design-approve-verb/evidence/fs14.txt | 1 |
| FS-15 | When the render returns its own per-board errors, the verb's output passes those errors through, and the approval still stands | .trd-state/design-approve-verb/evidence/exerciser-c/run1.stdout.txt | 1 |
| FS-16 | The verb commits the map and the frames it wrote in one commit whose message is `chore(design): <slug> boards approved` by default, or the `--message` text when given | .trd-state/design-approve-verb/evidence/exerciser-c/run2.git.txt | 1 |
| FS-17 | A file the user had staged outside the design folder before the verb ran is not included in the verb's commits and is still staged afterwards | .trd-state/design-approve-verb/evidence/exerciser-c/run1.git.txt | 1 |
| FS-18 | When nothing changes (every named board is already `approved`, no `--reapprove`, and the design folder is clean), the verb makes no commit | .trd-state/design-approve-verb/evidence/exerciser-c/run3.stdout.txt | 1 |
| FS-26 | The TRD author's prompt describes the listed design boards as the to-be boards this run builds, approved by it once the TRD is written, and no longer as "approved to-be boards" | .trd-state/design-approve-verb/evidence/fs25-26-plan-workflow.txt | 1 |
| FS-27 | The TRD-authoring contract's "Nothing builds from a draft board" rule applies only to a draft board not in the `DESIGN SOURCE` list, and its "held back" sentence no longer says "approved" | .trd-state/design-approve-verb/evidence/fs26-27-trd-authoring.txt | 1 |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-19 | `/refine-design <slug> --approve <ids>` on a board already approved and refined since records a new `approved_commit` for it, and naming a draft part board approves that part | No live headless slash-command session may be started by this verification loop, so the command run this criterion describes was not exercised. Only the verb call /refine-design prescribes was run on a fixture (re-approved board got a new approved_commit; draft part 07-part approved), plus prose tests. |
| FS-20 | A `/create-trd --design` run that stops before the TRD is written leaves its `draft` boards in `draft` and makes no approval commit | No live headless slash-command session may be started by this verification loop, so the command run this criterion describes was not exercised. Prose only: create-trd.md places approval after the TRD write and says a run that stops before then approves nothing; the workflow has no approve call. |
| FS-21 | A completed `/create-trd --design` run approves its boards only after the TRD file exists, in a commit titled `chore(design): <slug> boards approved by /create-trd`, with `approved_commit` equal to the commit recorded before the workflow; the same boards then end in `building` | No live headless slash-command session may be started by this verification loop, so the command run this criterion describes was not exercised. The prescribed sequence was run by hand on a fixture (approval commit "boards approved by /create-trd", 02-card building with approved_commit = pre-workflow HEAD), but no command transcript exists. |
| FS-22 | Before its workflow runs, `/create-trd --design` commits any uncommitted change under the design folder and uses the resulting `HEAD` as the source commit later passed to the verb | No live headless slash-command session may be started by this verification loop, so the command run this criterion describes was not exercised. Prose only: create-trd.md step 3 commits design-folder changes and records HEAD before the workflow, then passes it as --commit. |
| FS-23 | The boards `/create-trd --design` passes to the TRD author are the buildable boards it checked, including ones still `draft`, minus any held board | No live headless slash-command session may be started by this verification loop, so the command run this criterion describes was not exercised. Tier 1 also failed (locator-not-found). The board list the author receives was not observed from a run. |
| FS-24 | `/create-trd --design` on a design with zero buildable boards still ends STUCK, and approves nothing | No live headless slash-command session may be started by this verification loop, so the command run this criterion describes was not exercised. Prose only: zero boards is STUCK before the workflow; nothing is approved. |
| FS-25 | `/plan --design --boards` follows the same order: a run stopped before its TRD is written leaves the boards `draft`; a completed run writes the TRD, then approves the boards, then moves them to `building` | No live headless slash-command session may be started by this verification loop, so the command run this criterion describes was not exercised. Tier 1 also failed (locator-not-found: the quoted line spans a line-number break). plan.md 535-554 does order commit, TRD write, approve, building, but no run was observed. |

## Evidence

### FS-10 — With a working `--runtime`, the verb renders frames into `docs/ui/<slug>/screens/png/` for exactly the boards it moved to `approved` in that call, and `rendered` lists exactly those boards (met)

![FS-10](evidence/fs10-a-draft.png)

