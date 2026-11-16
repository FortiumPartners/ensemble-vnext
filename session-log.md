
## Compaction checkpoint — 2026-11-16T10:29:07.756Z

**Trigger:** auto
**TRD:** docs/TRD/fix-design-command-defects.md
**Phase:** 1
**Strategy:** bug-fix
**Branch:** feature/0-fix-design-command-defects

**Recently completed (last 5):**
- `FIX-004` — design-render.js measure script: mark reused: true on a contrast or target measure whose element has no data-dc-tpl and sits inside .sc-host-x; include reused in the grouping key so reused and drawn misses never merge; skip contrast for an element inside a disabled control; document the new field in the header. audit-design.js MEASURE_SCHEMA gains reused: { type: 'boolean' } so the visual critic's verbatim relay keeps it
- `FIX-005` — design-map.js: add caveats(dir) and CLI verb caveats --dir docs/ui/<slug>: returns { items, reused_build_side, sources } from brief.md ## Accessibility caveats bullets and a design.md section 4 line naming reused or library components as build-side; reads only; absent file or heading returns an empty result
- `FIX-006` — audit-design.js and audit-design.md: the command runs design-map.js caveats and passes caveats in the workflow args; the record-it hint names ## Accessibility caveats in brief.md exactly; visualFindings ranks per the Decision (drawn high; reused with recorded ruling low + known_caveat: true + "known build-side caveat"; reused unrecorded high with the record-it hint); the report lists the known caveats under VISUAL FINDINGS with the "known build-side caveat" wording
- `FIX-007` — refine-design.md no-feedback rule: a VISUAL FINDINGS line marked "known build-side caveat" is not an open finding; it is skipped, and STATE says how many were skipped
- `FIX-008` — Sync the vendored copies: every changed file under packages/core/ copied to its .claude/ counterpart, as commit 73f6dac1 did

**Decisions & rationale (model: fill on resume):**
- _Why was the in-flight approach chosen? Anything tried and rejected? Open questions?_

**Transcript:** `/Users/fortium/.claude/projects/-private-tmp-ensemble-vnext-feature-0-fix-design-command-defects/9dd1aacd-a5d0-4c75-b544-5b373d54aa05.jsonl`

---
