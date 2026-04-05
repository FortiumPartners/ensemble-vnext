# Iteration Loop Quick Reference

Condensed checklist for each pass through the verification loop.
Read SKILL.md first for full context. This is the in-loop reference.

## Pre-Flight (Main Session Only)

```
□ Figma baselines downloaded at scale=2 → tests/visual/baselines/{name}/{name}.png
□ Design context saved as JSON → tests/visual/design-context/
□ Embedded images saved → src/assets/ or public/
□ Fixture data matches Figma content exactly
□ All files committed
□ Subagent prompts include baseline protection rules
```

## Per-Component Loop

### FETCH (do once per component — main session)
```
1. get_metadata(fileKey, screenNodeId)     → discover node tree
2. get_design_context(fileKey, nodeId)     → extract colors, fonts, spacing
3. Download baseline PNG via REST API      → tests/visual/baselines/{name}/{name}.png
4. Download assets (icons, images)         → src/assets/
5. Extract text content for fixtures       → src/pages/__dev/fixtures/
6. Commit all to git
```

### IMPLEMENT (subagent or main session)
```
7. Create/update harness at src/pages/__dev/harnesses/
8. Add data-testid="..." to component root element
9. Populate fixture data matching Figma content exactly
10. Ensure component renders at correct dimensions
```

### CONVERGE (iterate until target — subagent safe)
```
Round 1 — Structural (target: 10%)
  11. Run: npx playwright test <spec> --config=playwright.visual.config.ts
  12. On FAIL → read test-results/*-diff.png
  13. Fix: layout, missing elements, wrong widths
  14. Re-run → repeat until < 10%

Round 2 — Visual (target: 5%)
  15. Fix: colors, font sizes/weights, padding, borders
  16. Re-run → repeat until < 5%

Round 3 — Polish (target: 3% if achievable)
  17. Fix: fine spacing, icon alignment, exact text content
  18. If remaining diff is anti-aliasing → adjust threshold
  19. Set maxDiffPixels to measured value + 10% margin
  20. STOP — move to next component
```

### PROMOTE
```
21. Commit with descriptive message showing convergence %
22. Move to next component (or up to section/screen level)
```

## Threshold Strategy

| Situation | threshold | maxDiffPixels | Why |
|-----------|-----------|---------------|-----|
| First pass (structural) | 0.3 | generous | Catch layout issues |
| Refinement | 0.5 | medium | Filter some anti-aliasing |
| Text-heavy screens | 0.75 | tight budget | #3A3A46 text at 75% LAB distance |
| Icon/graphic areas | 0.3 | tight budget | Graphics need precise color matching |
| TinyMCE / iframe areas | mask or exclude | — | Third-party rendering is opaque |

## Reading Diff Images

Red pixels in `*-diff.png` show what's different:

| Pattern | Meaning | Fix |
|---------|---------|-----|
| Large red blocks | Layout/spacing issue | Wrong padding, margin, gap, width |
| Red outlines | Border mismatch | Wrong border-radius, width, color |
| Red text regions | Typography mismatch | Wrong font-size, weight, line-height |
| Scattered red dots | Anti-aliasing noise | Raise threshold — not a code issue |
| Red fill areas | Wrong background color | Check color tokens |
| Entire regions red | Missing or extra element | Component not rendering or extra content |

## Key Commands

| Action | Command |
|--------|---------|
| Run one spec | `npx playwright test tests/visual/specs/<level>/<name>.spec.ts --config=playwright.visual.config.ts` |
| Run all screen specs | `npx playwright test tests/visual/specs/screens/ --config=playwright.visual.config.ts` |
| View HTML report | `npx playwright show-report tests/visual/report` |
| Download Figma baseline | `curl -H "X-Figma-Token: $TOKEN" "https://api.figma.com/v1/images/:fileKey?ids=NODE&format=png&scale=2"` |
| Get design context (MCP) | `get_design_context(fileKey, nodeId)` — main session only |
| Get node tree (MCP) | `get_metadata(fileKey, nodeId)` — main session only |
| Take quick screenshot | `npx playwright screenshot <url> --viewport-size=1920,1080 output.png` |
| Generate spec from template | `node scripts/generate-visual-spec.mjs --name "..." --url "..." --selector "..." --max-diff 415000` |

## DPR Cheat Sheet

| What | Value |
|------|-------|
| Figma export scale | 2 |
| Playwright `deviceScaleFactor` | 2 |
| `toHaveScreenshot()` `scale` | `'device'` |
| 1920×1080 CSS → physical pixels | 3840×2160 |
| Total pixels at 2x | ~8,294,400 |
| 5% of total | ~415,000 |
| 3% of total | ~249,000 |
| `setViewportSize()` | **DO NOT USE** — resets DPR to 1 |
| Correct viewport setting | `test.use({ viewport: {...}, deviceScaleFactor: 2 })` |

## Baseline Protection Rules

```
□ NEVER overwrite Figma baseline PNGs
□ NEVER run --update-snapshots on Figma baselines
□ NEVER replace baselines with browser screenshots (circular comparison)
□ Diff means CODE is wrong, not the baseline
□ Update baselines ONLY when Figma designs change (re-export from Figma)
□ Include these rules in EVERY subagent prompt
```

## Subagent Dispatch Checklist

```
□ All baselines committed to git
□ Design context JSON committed
□ Fixture data committed and matching Figma content
□ Agent prompt includes: "NEVER overwrite baseline PNGs"
□ Agent prompt includes: "NEVER run --update-snapshots"
□ Agent prompt includes convergence targets (10% → 5% → 3%)
□ Agent prompt includes Figma API token (for REST API if needed)
□ Agent prompt specifies max iterations (6-8 per component)
□ If parallel agents: use isolation: "worktree" or split by file ownership
```
