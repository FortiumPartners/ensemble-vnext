# Brief: four design-command defects from the dart add-menu runs (#149, #150, #151, #152)

The owner's list, verbatim (flag tokens rewritten as "double dash"):

> GitHub issues #149, #150, #151 and #152 in FortiumPartners/ensemble-vnext (read each issue for its evidence). All four are defects in the design commands: #149 /refine-design (double dash)auto edits no boards when the audit says "proceed with caveats", giving repeated identical rounds; #150 /refine-design and /design-system (double dash)sync end STUCK when an existing canvas or Design System page is unreadable from the current account, instead of republishing from committed files; #151 a design critic ran a wildcard rm that triggered Claude Code's dangerous-rm prompt and hung an unattended run; #152 /audit-design re-flags reused library components against the accessibility floor every round, with no way to record them as build-side work.

All four were reported by the dart product on 2026-11-16 against its design `add-menu`. The dart repository is not on this machine, so its reports were read from the issues, not reproduced. The design commands are prose (Markdown commands plus JS workflow scripts); their prose tests live beside them (`packages/core/commands/*-prose.test.js`, `packages/core/workflows/*.test.js`).

Coupling: #149 and #152 both touch what an audit lists and what a refine acts on, but neither needs the other built. If #152 lands first, the #149 fix must not act on findings #152 marks as recorded, build-side caveats; if #149 lands first, #152 adds that exclusion. Each issue is otherwise independent.

## 1. Refine with no feedback changes nothing after a "proceed with caveats" audit (#149)

### Steps

1. Run `/audit-design <slug>` on a design whose boards have render errors, hand-drawn components the bundle ships, and contrast or target misses. The report's first line is `VERDICT: proceed with these caveats: ...`, with findings under RENDER ERRORS, DRAWN BY HAND INSTEAD OF REUSED and VISUAL FINDINGS.
2. Run `/refine-design <slug>` with double dash auto and no feedback text.
3. Run `/audit-design <slug>` again.

### Expected

- With double dash auto and no feedback, the refine takes the latest audit report's open findings as its feedback (render errors, reuse findings, the design's own visual faults) and edits the boards they name.
- When the refine changes no board, it says so plainly: either COMMAND STUCK, or COMMAND COMPLETE whose summary and STATE read "no change made, nothing to re-audit", and NEXT does not name `/audit-design`.

### Actual

In dart, three refines in a row changed no board; only the design map's drift timestamp moved (commits 41b9240fe, 8d5a09e8f, 42a665e79). Each following audit said "No board, part or brief has changed since the last full audit". The refine read the caveats as accepted. Given an explicit list of board fixes, the same refine edited the boards and render errors went from 7 to 0. Cost: about 30 minutes and three full audits (38 verifiers over 51 boards each).

### Where

- `packages/core/commands/refine-design.md:114-127`: the "No feedback" rule already says to read `.trd-state/<slug>/audit-design-report.md` and take its open findings. It did not take effect in dart. The rule does not say that a `proceed with these caveats` verdict is not acceptance, and gives no fallback when the report file is missing from the working tree (the design commands write their report under `.trd-state/<slug>/` and never put it on the records ref, so a fresh worktree has none).
- `packages/core/commands/refine-design.md:225-237`: the readout has no "no change made" outcome; NEXT always names `/audit-design <slug>`.

### How to check

A prose test in `packages/core/commands/refine-design-prose.test.js` asserting (a) the no-feedback rule says a `proceed with these caveats` verdict is not acceptance and its listed findings are acted on, (b) a missing report under double dash auto with no feedback is a stated outcome, not silent success, and (c) a run that changed no board says "no change made" and NEXT omits `/audit-design`. Today `grep -ciE 'no change made|nothing to re-audit' packages/core/commands/refine-design.md` prints 0.

## 2. An unreadable canvas or Design System page ends STUCK instead of being republished (#150)

### Steps

1. Publish a design's canvas and the Design System page from one claude.ai account.
2. In a session logged in to a different account, run `/refine-design <slug>` with double dash auto, or `/design-system` with double dash sync.

### Expected

When an artifact recorded in `design-map.json` (canvas, `design_system.url`) or in `artifacts.json` returns not-found or unreadable, the command publishes a new one from the committed source (`docs/ui/<slug>/canvas/` for a canvas, `docs/ui/_design-system/<folder>/` for the Design System page), records the new URL with the old one kept as `previous_url`, says so in DECISIONS, and carries on. It does not stop.

### Actual

Both commands ended COMMAND STUCK with "the Design System artifact and canvases are not readable from this session's claude.ai account" and asked a person to share them. Told to, the session republished new copies and updated the design maps in one pass (dart commit f003d95e0). Owner: "You can copy canvases anywhere you need to can't you?"

### Where

- `packages/core/contracts/design-commands.md:30-48` (section 1 step 3, reading the canvas) and `:49-60` (step 4, canvas sync): no rule for a recorded canvas that cannot be read; only "no canvas recorded" is handled.
- `packages/core/contracts/design-commands.md:119-127` (section 3, install the design system on a canvas) and `packages/core/commands/design-system.md:64-85` (steps 6-8, publish the Design System artifact and record its URL): no rule for an unreadable recorded Design System page.
- `previous_url` is not a field anywhere in `.claude/lib/` today; the map writer (`design-map.js`) and `artifacts.js record` need to keep it.

### How to check

A prose test over the contract and `design-system.md` asserting the unreadable-artifact rule (republish from committed files, record `previous_url`, DECISIONS line, no STUCK), plus a Jest test that recording a new canvas or system URL keeps the old one as `previous_url`. Today `grep -ciE 'unreadable|not readable|previous_url'` over `refine-design.md`, `design-system.md` and section 1 of the contract finds nothing relevant (the only hit is the word "unreadable" in the critique scale, `design-commands.md:211`).

## 3. A design critic's wildcard rm hung an unattended run (#151)

### Steps

1. Run `/refine-design <slug>` unattended (bypassPermissions).
2. A visual critic agent crops frames into its scratch folder and runs `cd <scratchpad>; rm -f crops-crit3/*; for st in ...; do ffmpeg ... crops-crit3/...; done`.

### Expected

Design critics, and every design workflow agent, never run `rm` on a glob or an unresolved path. They write into a fresh, uniquely named folder per run (for example `mktemp -d`) and leave cleanup to the scratchpad's lifecycle. The rule is stated where every critic reads it.

### Actual

Claude Code showed "Dangerous rm operation on statically-unresolvable target" and waited for Yes or No despite bypassPermissions. Nothing answered, and the refine hung for 30 minutes until the session was restarted (dart, 2026-11-16 07:04 UTC).

### Where

- `packages/core/contracts/design-commands.md:111-117` (section 2, render pass) and section 8 (visual critique, `:187` onward): the shared rules every design command cites; neither says anything about deleting files.
- `packages/core/commands/refine-design.md:164-169`: the re-challenge step that dispatches the visual agents ("render to a scratch folder outside docs/ui/<slug>/").
- The critic prompts built in `packages/core/workflows/audit-design.js:280-290` and `packages/core/workflows/create-design.js:487-490` (`VISUAL_COMMON`), which already say "a fresh scratch folder" but not "never rm".

### How to check

A prose test asserting that the contract and the critic prompts in `audit-design.js` and `create-design.js` each carry the no-rm rule (fresh `mktemp -d` folder, no `rm` on a glob or variable path). Today `grep -ciE 'never .?rm|rm .*glob'` over those three files prints 0 for each.

## 4. The audit re-flags reused library components against the accessibility floor every round (#152)

### Steps

1. Draw a design whose boards reuse library components unchanged through `x-import` (party-chip initials, priority buttons, pickers, a chat composer, a footer link, an amber banner) that fall below the contrast or 44 px target floor in `design.md` section 4.
2. Run `/audit-design <slug>` several times, recording in the brief (or in `design.md` section 4) that reused components are build-side work.

### Expected

- The audit separates "drawn by this design" from "reused component, unchanged".
- It reads a recorded accept or fix-in-build list (from the brief, or `design.md`'s accessibility rule) so recorded items show as known caveats, not new high findings.
- A design's own faults stay high.

### Actual

Every round ranked the reused components' contrast and target misses as high. Round 6 still listed 45 below-floor rows and said "the brief does not record the accept-or-fix call", although the brief had been asked to record the PM's ruling. dart has since written the rule into its `design.md` section 4: the floor covers what a design draws; reused components are build-side work; disabled controls are exempt from contrast, but text explaining why must still meet it.

### Where

- `packages/core/lib/design-render.js:500-535`: contrast and target measures carry `element: describe(el)` but nothing saying whether the element sits inside an `x-import`ed library component.
- `packages/core/workflows/audit-design.js:423-433` (`visualFindings`): every `below-floor` contrast or target measure is ranked high, with no exception for reused components or recorded caveats.
- `.claude/lib/design-map.js:494-503` (`direction`): reads only the floor numbers from `design.md` section 4, not a rule or list about reused components.

### How to check

A Jest test in `packages/core/workflows/audit-design.test.js` (or `design-render` tests) where a below-floor measure inside an `x-import`ed component is ranked as a known caveat, not high, while the same miss on a hand-drawn element stays high. Today `visualFindings` has no component field to read (`sed -n 425,440p packages/core/workflows/audit-design.js | grep -c component` prints 0).

## Open questions

- **#149 cause not reproduced (owner's call, default taken).** The rule to read the report exists, so the dart failure is either the model reading "proceed with these caveats" as acceptance or the report missing from the refine's working tree. Default: fix both (state that the verdict is not acceptance, and make a missing report under double dash auto a stated outcome), and add the "no change made" ending, which is missing regardless.
- **#149 no-change ending: STUCK or COMPLETE (owner's call, default taken).** Default: COMMAND COMPLETE with "no change made, nothing to re-audit" in the summary and STATE, NEXT without `/audit-design`, because a refine with nothing to act on has finished, not failed. STUCK is kept for a report that has open findings the refine could not act on.
- **#152 where the accept list lives (owner's call, default taken).** Default: read both a `## Accessibility caveats` (accept or fix-in-build) list in the design's `brief.md` and the accessibility rule in `design.md` section 4; the audit never edits `design.md` (owner-only).
- **#152 disabled controls (owner's call, default taken).** dart's rule exempts disabled controls from contrast. Default: adopt it as framework behaviour only if the renderer can tell a disabled control (the `disabled` attribute or `aria-disabled`); otherwise leave it to the recorded list.
- **#150 scope of republishing (owner's call, default taken).** Default: republish only on not-found or no-access; any other read error stays as today. A republished canvas starts a fresh sync base (`design-mirror.js record` against the new URL).

Decisions:

- Ship path: checked; `.github/workflows/ci.yml` exists and references no secrets (owner's call under auto, 2026-11-16).
- The five open questions above: defaults taken as written (owner's call under auto, 2026-11-16).
