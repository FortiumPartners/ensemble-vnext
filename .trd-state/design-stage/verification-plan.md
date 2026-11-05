# Verification plan: design-stage

**Written**: 2026-11-05T12:00:00Z by /refine-verification
**From run**: stuck at 59/72 (must pass 10 of 11, unproven FS-43), report `.trd-state/design-stage/verification-report.md`
**Agreed with**: the owner, on board approval (R1); everything else derived from the evidence

The one unproven must-pass criterion, board approval (FS-43), was open only on its "approved"
canvas-comment channel, which nothing here can create. The owner ruled (R1) that a separate
approval act does not belong in an autonomous framework: running the build command is the
approval. AC-F9.4 is rewritten in PRD 1.2.2 and TRD 1.1.2, and the code change goes through
`/amend` before the next `/verify-build`. FS-43 is judged against AC-F9.4 as amended, not
against the old three-channel wording still in `success-definition.md`.

The design commands run in INTERACTIVE sessions in the trusted fixture folders listed in
`.claude/verification-notes.md`, launched and watched in tmux as before, one at a time, and
publish only private throwaway canvases built from fixture content.

## Blockers
none

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | Approval by invocation, on the react-web folder's `trips-search` design (both boards `draft`): `/create-trd --design docs/ui/trips-search` approves the to-be board it builds (map shows `approved_commit` set, then `building`); `/refine-design trips-search --approve <id>` on a fresh draft board approves it; one `/refine-design --auto` run and one run with an "approved" remark in chat each leave every board `draft` | FS-43 |
| 2 | `verify-design-structure` on the stack and parts-board rules: copy `ensemble-vnext-test-fixtures/variants/full/flutter-widget` into `.trd-state/design-stage/evidence/live/work/flutter-widget` (accept the folder-trust prompt there, our own fixture folder), give it one approved to-be board, and run the skill: it must answer "not verifiable here" by the stack rule without launching anything. On the react-web folder, run it on an approved parts board (empty `components`): no structure criterion, "not verifiable here" | FS-54 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | Invocation is approval: `/create-trd --design` and `/plan --design --boards <ids>` approve the to-be boards they build (recording `approved_commit`); `/refine-design --approve <ids>` stays as an early choice; canvas-comment and chat approval are dropped. AC-F9.4 keeps its must-pass mark (owner, 2026-11-05) | `docs/PRD/design-stage.md` 1.2.2 (AC-F9.4, changelog); `docs/TRD/design-stage.md` 1.1.2 (AC-F9.4, D18, changelog) |

## Accepted as not verifiable
| Criterion | Ruling | Why |
|-----------|--------|-----|
| FS-42 | accepted | `/refine-design` driven by a canvas comment: no tool here can create a canvas comment (capability absent); not must-pass |
| FS-25 | accepted | a screenshot of the hosted claude.ai canvas; DSGN-T005, owner-attended |
| FS-67 | accepted | the NativeWind board seen on the hosted canvas; DSGN-T005, owner-attended |
| FS-68 | accepted | a publish under the james account; DSGN-T005, owner-attended |
| FS-72 | accepted | the owner's own 44-board flow redone; DSGN-T006, owner-attended |
| FS-58 | accepted | `/audit-build` naming `/sync-design` on a closed feature with a design; DSGN-T004, deferred until the fixture build merges |
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
