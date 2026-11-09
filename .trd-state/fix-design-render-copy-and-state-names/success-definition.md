# Functional Success Definition: fix-design-render-copy-and-state-names

**Source**: docs/TRD/fix-design-render-copy-and-state-names.md §Reproduction
**Source kind**: reproduction
**Derived**: 2026-11-09T03:24:02Z
**Criteria**: 6

Derived from the reproduction text alone (Steps, Actual, Expected); the TRD's plan was not read.
Line references below are to the reproduction's own numbered items: "Expected 1" is the first
item under `### Expected`, and so on.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | Copying a source folder whose subfolder `ds/` has mode `02755` and a group the user belongs to (for example `devteam`) into a fresh `mkdtemp` folder under `/private/tmp` (group `wheel`), by the step that builds the design render root, completes without throwing (no `EPERM, Operation not permitted`) | Reproduction, Steps 1; Actual 1 (the `EPERM` on `…/c/ds`); Expected 1 ("The copy succeeds.") | Transcript of a node script (or Jest/BATS test output) that creates the setgid fixture, runs the render-root copy into a `/private/tmp` mkdtemp folder, and prints a success line plus a listing of the copied `ds/` folder; `ls -ld` of the source `ds/` showing `drwxr-sr-x` (setgid set) so the fixture is shown to reproduce the condition | [read] | locator | | O1 |
| FS-2 | The folders produced by that copy take the destination's default mode and do not carry the setgid bit | Reproduction, Expected 1 ("The copied folders take the destination's default mode and do not carry the setgid bit") | `ls -ld` (or `fs.statSync(...).mode` printed in octal) of the copied `ds/` folder showing no `s` in the group-execute position / no `02000` bit, beside the same output for the source `ds/` showing it set | [read] | locator | | |
| FS-3 | Rendering a design whose board `02-state` (fixture `stateful.dc.html`) declares the state `"empty?"` with props `{ empty: true }`, via `render()` from `packages/core/lib/design-render.js` with `offline: true`, produces a state frame whose runtime booted: no `[empty?] the runtime never sent __dc_booted and __dc_render_errors` error, and the frame shows the board with its `empty: true` props applied | Reproduction, Steps 2; Actual 2 (the `__dc_booted` error and the 404); Expected 2 ("The state renders with its props") | The JSON (or printed result) returned by `render()` for that design, showing the `empty?` frame with no errors and its output path; the frame's PNG attached as the criterion's screenshot so the judge can see the empty-state rendering | [read] | locator | | O2 |
| FS-4 | That state's frame PNG is written as `02-state--empty.png`, a slug of the state name, and no file named `02-state--empty?.png` is written | Reproduction, Actual 2 ("The PNG is still written as `02-state--empty?.png`, a name that is also invalid on Windows"); Expected 2 ("its copy and PNG are named by a slug of the state name: `02-state--empty.png`") | Directory listing of the render output folder after the FS-3 render, showing `02-state--empty.png` and no `?` in any file name; the `render()` result's path for the frame naming the same file | [read] | locator | | O2 |
| FS-5 | The temporary copy of the board made for that state is named by the same slug, `02-state--empty.dc.html`, not `02-state--empty?.dc.html` | Reproduction, Actual 2 ("The temp copy is named `02-state--empty?.dc.html`"); Expected 2 ("its copy and PNG are named by a slug of the state name") | Listing of the render root during or after the FS-3 render (or the URL/`?b=` value `capture()` passed to the host page, logged) showing `02-state--empty.dc.html` | [read] | locator | | |
| FS-6 | The frame record `render()` returns for that state still carries the real state name in its `state` field: `empty?` | Reproduction, Expected 2 ("The frame's `state` field still carries the real name, `empty?`") | The `render()` result for the FS-3 render, showing the frame object with `"state": "empty?"` alongside its slugged PNG path | [read] | locator | | |

**What was considered and left out.** Actual 2 also records that the default frame already
renders, and that the host page sets the copy's name unescaped as the iframe `src`. The Expected
section states no requirement about either (it does not ask for the host to escape the name,
only that the copy be slug-named), so neither became a criterion. The reproduction names only
the `?` character; no criterion was written for other URL- or file-name-unsafe characters,
because the source does not list any — objective O2's wider wording ("or any other character")
is covered only as far as `?` goes, and the run should report that limit rather than treat it
as proven.
