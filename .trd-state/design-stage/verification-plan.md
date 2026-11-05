# Verification plan: design-stage

**Written**: 2026-11-04T17:20:00Z by /refine-verification
**From run**: stalled at 21/72 (must pass 3 of 11), report `.trd-state/design-stage/verification-report.md`
**Agreed with**: derived from the evidence; no open items

The run's 49 "environment not reachable" criteria were blocked by one thing: Claude Code's
folder-trust prompt stopped every interactive session in the fixture copies. That cause is gone.
At the owner's instruction (2026-11-04) the two fixture work folders were created and trusted,
and their paths are in `.claude/verification-notes.md`:
`.trd-state/design-stage/evidence/live/work/react-web` and `.../react-native`. Those criteria are
therefore re-verified below rather than accepted. Only the ones the TRD assigns to a deferred,
owner-attended or after-merge task are accepted.

Every slice runs design commands in INTERACTIVE sessions (the Artifact tool is off under
`claude -p`), started in one of the two trusted folders with the spike launcher pattern
(`tmux new-session ... claude --dangerously-skip-permissions "<slash command>"`), and watched with
`tmux capture-pane` until the banner appears. One interactive session at a time. Publish only
private throwaway canvases built from fixture content (the `claude-artifacts` environment).
Never create a fixture copy in a new folder, because it would stop at the trust prompt again.

## Blockers
none

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | `/design-system` on both trusted fixture folders. Run `npm install` in the react-native folder first, so its own Tailwind compiles the NativeWind CSS (FS-12 was short only on that). Read the published system and canvas back with `Artifact` `read` and scan them for credentials | FS-12, FS-13, FS-20, FS-22, FS-23, FS-24, FS-70 |
| 2 | `/create-design` on the react-web folder: a default run; an `--auto` run; a second run with no code change (grounding unchanged); one run with `design.md` moved aside (STUCK naming `/design-setup`, then restore it); one run with `ensemble.publishArtifacts: false` in that folder's `.claude/settings.json` (files written, STUCK naming the publish step, then restore it) | FS-29, FS-30, FS-31, FS-32, FS-33, FS-34, FS-35, FS-36, FS-37, FS-38, FS-39, FS-40, FS-69 |
| 3 | `/refine-design` and `/audit-design` on the slice 2 design. Before refining, a second session edits one board on the canvas and leaves a comment. Approve one board through each of the three channels (chat, an "approved" comment, `--approve <ids>`), plus one `--auto` run with no approval. Then `/audit-design` on a design seeded with one unsourced board and one brief item with no board. Run the design-system staleness check in each command against a changed component path | FS-15, FS-17, FS-27, FS-41, FS-42, FS-43, FS-45, FS-46 |
| 4 | Build from the approved design on the react-web folder: `/create-trd --design docs/ui/<slug>` (one draft and one approved to-be board), `/plan --design docs/ui/<slug> --boards <id>`, then `/implement-trd` on that TRD with its design checks | FS-44, FS-47, FS-48, FS-49, FS-50, FS-51, FS-52, FS-53, FS-54, FS-55, FS-56, FS-57, FS-71 |

## Owner rulings
none

## Accepted as not verifiable
| Criterion | Ruling | Why |
|-----------|--------|-----|
| FS-25 | accepted | a screenshot of the hosted claude.ai canvas; the TRD assigns it to DSGN-T005, owner-attended and deferred by design |
| FS-67 | accepted | the NativeWind board seen on the hosted canvas; DSGN-T005, owner-attended |
| FS-68 | accepted | a publish under the james account; DSGN-T005, owner-attended |
| FS-72 | accepted | the owner's own 44-board flow redone; DSGN-T006, owner-attended |
| FS-58 | accepted | `/audit-build` naming `/sync-design` on a closed feature with a design; DSGN-T004, deferred by design until the fixture build merges |
| FS-59 | accepted | `/sync-design` capture into `as-built/png/`; DSGN-T004 |
| FS-60 | accepted | `/sync-design` moving matched boards to shipped and the History page; DSGN-T004 |
| FS-61 | accepted | `/sync-design` rebuild only on an owner ruling; DSGN-T004 |
| FS-62 | accepted | `/sync-design` chaining `/design-system --sync`; DSGN-T004 |
| FS-63 | accepted | `/audit-design --drift` against a shipped build; DSGN-T004 |

## Extra checks
| Skill | Inputs |
|-------|--------|
| none | |

## Stop rule
max-rounds: 3
stop-when-closed-below: 1
always: stop when nothing is left to build
