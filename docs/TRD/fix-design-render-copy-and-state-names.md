# TRD: fix-design-render-copy-and-state-names

**Source PRD**: None — defect, GitHub issue FortiumPartners/ensemble-vnext #91 (feature F-3 of workplan fix-ship-custody-order)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Building a render root copies a design folder that contains a setgid directory without throwing, including when the temp folder's group is one the user does not belong to (macOS `/private/tmp`, group `wheel`) | the first reproduction below; issue #91 acceptance (1) | yes |
| O2 | A board state whose name contains `?` (or any other character unsafe in a URL path or file name) renders, and its frame is written as `NN-name--<slug>.png`, where it can be found by that slug | the second reproduction below; issue #91 acceptance (2) | yes |
| O3 | Every existing design-render test still passes, and a state whose name is already safe keeps exactly the file name it has today | issue #91 acceptance (3) | |

## Reproduction

### Steps

1. **Setgid copy** [ran 2026-11-08]: make a source folder with a subfolder `ds/` owned by group `devteam` (a group the user belongs to) at mode `02755`, the way this worktree itself is (`drwxrwsr-x islaygold devteam`). Run `fs.cpSync(src, '/private/tmp/<mkdtemp>/c', { recursive: true })`.
2. **Question-mark state** [ran 2026-11-08]: a design with board `02-state` (fixture `stateful.dc.html`) and `states: { "empty?": { props: { empty: true } } }`; call `render()` from `packages/core/lib/design-render.js` with `offline: true`.

### Actual

1. `EPERM, Operation not permitted '/private/tmp/sg-dst-…/c/ds'`. `fs.cpSync` creates each folder and then chmods it to the source's mode, setgid bit included. The new folder inherits `/private/tmp`'s group (`wheel`), and macOS refuses to set setgid on a folder whose group the caller is not in.
2. The default frame renders. The state frame reports `[empty?] the runtime never sent __dc_booted and __dc_render_errors`. The temp copy is named `02-state--empty?.dc.html`. `capture()` passes it to the host page in `?b=` (correctly encoded), but the host sets it unescaped as the iframe `src`, so the browser reads `?` as the start of a query and requests `02-state--empty`, which is a 404. The runtime never boots. The PNG is still written as `02-state--empty?.png`, a name that is also invalid on Windows.

### Expected

1. The copy succeeds. The copied folders take the destination's default mode and do not carry the setgid bit (the render root is a throwaway folder served read-only, so no mode needs preserving).
2. The state renders with its props, and its copy and PNG are named by a slug of the state name: `02-state--empty.png`. The frame's `state` field still carries the real name, `empty?`.

## Decision

**Copy with our own small recursive copy, `copyTree(src, dest)`, in place of the three `fs.cpSync` calls in `buildRoot()`.** It walks the source, creates each folder with `fs.mkdirSync(dest, { recursive: true })` (default mode, so no chmod) and writes each file's bytes with `fs.writeFileSync(dest, fs.readFileSync(src))`, so no mode or ownership is copied. A symlink is followed and its target's contents are copied (`fs.statSync`). This differs from `cpSync`, which writes the symlink itself, but it suits a throwaway root that is only served. A folder symlink whose real path has already been visited is skipped, so a link back to a parent folder cannot loop forever. Rejected alternative: keep `cpSync` and retry on EPERM. That leaves two copy paths, and `cpSync` has no option to skip modes. The `--at` path extracts with `tar -x` from `git archive`, which never writes a setgid bit, so it is not exposed.

**Name each state's temp copy and PNG by `stateSlug(name)`.** The slug turns every run of characters outside `[A-Za-z0-9._-]` into one `-`, trims leading and trailing `-`, and falls back to `state` when nothing is left. Slugs for one board are assigned in two passes. First, every state whose slug equals its own name (already safe: `empty`, `loading`, `Error_1`) takes that name, so an existing frame never changes file name, whatever its position in `states`. Then each remaining state takes its slug, or `-2`, `-3` and so on: the first suffixed form not already taken by any state name or slug of that board. No frame overwrites another. The frame's `state`, the measures' `state` and the `[name]` prefix on errors all keep the real state name: the slug is a file name only. **Also encode each path segment of the iframe `src` in `HOST_HTML`** (`.split('/').map(encodeURIComponent).join('/')`). `serve()` already decodes the path, so a board *file* name containing `?` or `#` loads too. Encoding alone is not enough, because it would leave `?` in the PNG name, which the issue also flags.

## Non-Goals

- No change to `design-map.json` validation: state names stay free text.
- No change to the `--at` / `--approved` extraction path (`archiveInto`, `tar -x`).
- No change to the static server handler in `serve()`: it already decodes percent-encoded paths.
- No change to the prose that names as-built frames (`packages/core/workflows/sync-design.js:98-99`, `packages/skills/verify-design-comparison/SKILL.md:70`). An unsafe state name never rendered before this fix, so nothing regresses; aligning those consumers with the slug is a follow-up.
- No lower-casing or other normalising of names that are already safe.

## Verification Artifacts

None apply — this is a library defect with no screen, design frame or user journey of its own; the Jest tests are the proof.

## Verification Environment

**Environment**: local
**Refresh**: nothing — tests read the working tree
**Cannot be checked there**: the EPERM itself reproduces only on macOS with a source folder whose group differs from the temp folder's; on the Linux CI runner the test proves the setgid bit is not carried, which is the mechanism, not the exact error

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `copyTree(src, dest)` to `design-render.js`, use it for the mirror and the `ds/<folder>` copies in `buildRoot()`, export it, and add a test: build a source tree with a subfolder chowned to `process.getgid()` and set to mode `02755` (assert that precondition holds), copy it with `copyTree` into a fresh temp folder, and assert it does not throw, the file bytes match, and the copied subfolder's mode has no setgid bit (`mode & 0o2000 === 0`) | O1, O3 | None | The new test fails against `fs.cpSync` (which carries the setgid bit, or throws EPERM on macOS under `/private/tmp`) and passes with `copyTree`; on this macOS host, `copyTree` from a `devteam`-group setgid folder into `/private/tmp` does not throw; all design-render tests pass |
| FIX-002 | Add `stateSlug(name)` and a per-board `stateSlugs(names)` that assigns the collision suffix (safe names first); name each state's temp copy `${b.id}--${slug}.dc.html` and PNG `${b.id}--${slug}.png` in `render()`; export `stateSlug`; add tests: (a) a board with state `empty?` renders with no errors, its frame has `state: 'empty?'` and png basename `02-state--empty.png`, and that PNG differs from the default frame's; (b) slug unit cases: `empty` unchanged, `empty?` → `empty`, `is it ok?` → `is-it-ok`, `???` → `state`; a board with states `empty?` listed BEFORE `empty` keeps `empty` as `empty` and gives `empty?` `empty-2`; a suffix skips a slug already taken by a real state named `empty-2`. Also encode each segment of the iframe `src` in `HOST_HTML` | O2, O3 | None | Test (a) fails on the current code (the runtime never boots for the state, png named `02-state--empty?.png`) and passes after; existing test `writes one PNG per board … NN-name--state.png` still passes unchanged; all design-render tests pass |
| FIX-003 | Copy the edited `packages/core/lib/design-render.js` over `.claude/lib/design-render.js`, so the vendored copy stays identical | O1, O2 | FIX-001, FIX-002 | `diff packages/core/lib/design-render.js .claude/lib/design-render.js` is empty; the `the libraries ship with their mirrors` test passes |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/design-render.js`, `packages/core/lib/design-render.test.js`
- **Reuse:** `buildRoot()` at `design-render.js:326-338` is the only `cpSync` caller (mirror copy at line 329, `ds/<folder>` copies at 332) [read]. The test helper `tmp()` in `design-render.test.js:29` makes real-pathed temp folders [read]
- **Replaces:** the two `fs.cpSync(..., { recursive: true })` calls in `buildRoot()`; `copyFileSync(runtime, …support.js)` stays, because it copies one file into the root and is not affected [read]
- **Follow:** module style: small top-level `function`s with a one-line `/** */` comment; exported via the `module.exports` object at the end of the file [read]
- **Careful:** EPERM reproduced [ran] only when the source folder's group (here `devteam`, 501) differs from the temp folder's (`wheel`). The test must make the precondition (setgid set on the source) true on any host, so it chowns the folder to `process.getgid()` before the chmod. Chmod to setgid silently does nothing when the caller is not in the folder's group, which would make the test vacuous [ran]

### FIX-002
- **Touches:** `packages/core/lib/design-render.js`, `packages/core/lib/design-render.test.js`
- **Reuse:** the state loop in `render()` at `design-render.js:758-763` builds `copy` and `png` from the raw state name [read]. Test helpers `mkDesign`, `board`, `fixture('stateful.dc.html')`, `run` and `png(r, id, state)` at `design-render.test.js:33-50` [read]
- **Replaces:** the use of the raw `name` in the `copy` file name and the `png` file name; `t.state` stays the raw name [read]
- **Follow:** "The state comes from the target, never the temp copy's filename" (`design-render.js:774`): keep `state: name` on the target [read]
- **Careful:** `capture()` encodes the file for `?b=` but `HOST_HTML` (`design-render.js:103`) assigns it to `src` unescaped [read]; FIX-002 encodes each segment there too. The slug must remove `?`, `#`, `%`, `/` and spaces, so the decoded value is a plain relative path [inferred]. A slug collision would silently overwrite a PNG, so the suffix is required [inferred]

### FIX-003
- **Touches:** `.claude/lib/design-render.js`
- **Reuse:** the two files are byte-identical today (`diff` empty) [ran]
- **Follow:** vendored `.claude/lib/` files mirror `packages/core/lib/` [read]
- **Careful:** nothing else under `.claude/lib/` changes [inferred]

## Could Not Verify

- The exact EPERM cannot be produced on the Linux CI runner: Linux clears the setgid bit silently rather than refusing. There, the FIX-001 test proves that the bit is not carried, which is the mechanism behind the error, not the error itself. The EPERM was reproduced on this macOS host [ran].
