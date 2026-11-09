# Functional Verification Report: fix-design-render-copy-and-state-names

**Source PRD**: docs/TRD/fix-design-render-copy-and-state-names.md § Reproduction
**Success definition**: .trd-state/fix-design-render-copy-and-state-names/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 6 total — 6 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 6 of 6 proven — uncovered: none
**Must pass**: 3 of 3 proven
**Screenshots**: 1 shown
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Copying a source folder whose subfolder `ds/` has mode `02755` and a group the user belongs to (for example `devteam`) into a fresh `mkdtemp` folder under `/private/tmp` (group `wheel`), by the step that builds the design render root, completes without throwing (no `EPERM, Operation not permitted`) | .trd-state/fix-design-render-copy-and-state-names/evidence/fs-walk-1.txt | 1 |
| FS-2 | The folders produced by that copy take the destination's default mode and do not carry the setgid bit | .trd-state/fix-design-render-copy-and-state-names/evidence/fs-walk-1.txt | 1 |
| FS-3 | Rendering a design whose board `02-state` (fixture `stateful.dc.html`) declares the state `"empty?"` with props `{ empty: true }`, via `render()` from `packages/core/lib/design-render.js` with `offline: true`, produces a state frame whose runtime booted: no `[empty?] the runtime never sent __dc_booted and __dc_render_errors` error, and the frame shows the board with its `empty: true` props applied | .trd-state/fix-design-render-copy-and-state-names/evidence/fs-walk-1.txt | 1 |
| FS-4 | That state's frame PNG is written as `02-state--empty.png`, a slug of the state name, and no file named `02-state--empty?.png` is written | .trd-state/fix-design-render-copy-and-state-names/evidence/fs-walk-1.txt | 1 |
| FS-5 | The temporary copy of the board made for that state is named by the same slug, `02-state--empty.dc.html`, not `02-state--empty?.dc.html` | .trd-state/fix-design-render-copy-and-state-names/evidence/fs-walk-1.txt | 1 |
| FS-6 | The frame record `render()` returns for that state still carries the real state name in its `state` field: `empty?` | .trd-state/fix-design-render-copy-and-state-names/evidence/fs-walk-1.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

## Evidence

### FS-3 — Rendering a design whose board `02-state` (fixture `stateful.dc.html`) declares the state `"empty?"` with props `{ empty: true }`, via `render()` from `packages/core/lib/design-render.js` with `offline: true`, produces a state frame whose runtime booted: no `[empty?] the runtime never sent __dc_booted and __dc_render_errors` error, and the frame shows the board with its `empty: true` props applied (met)

![FS-3](evidence/render-out-1/02-state--empty.png)

