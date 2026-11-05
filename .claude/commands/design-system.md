---
name: design-system
description: Build the product's design system from its code (or Figma), publish it as a Design System artifact, install it on the product's canvases, and commit the built files
version: 1.0.0
argument-hint: "[--sync] [--chained]"
---

> **Usage:** `/design-system`, `/design-system --sync` or `/design-system --chained`
>
> **Examples:**
> `/design-system` (first build)
> `/design-system --sync` (the code changed; rebuild, republish, reinstall on each canvas)

Build the design system the boards draw with. The steps every design command shares are in
`packages/core/contracts/design-commands.md` and are cited here by section number, not restated.

## User Input

```text
$ARGUMENTS
```

**Strip the flags first.** Remove `--sync` and `--chained` from the arguments, remembering each.

- **`--sync`** re-runs the build after the code changed and reinstalls the system on every
  canvas that records it, because a canvas's copy never updates by itself (AC-F6.5).
- **`--chained`** means `/sync-design` called this command as one step of its run. It changes
  one thing, marked in "Completion signal": the run ends on one RETURN line, with no banner and
  no `notify-complete.sh` call, because the caller's banner ends the run (D20).

---

## Steps

1. **Start** per contract section 1, with one difference: this command *is* the stale-system
   remedy, so it skips the stale check. Run `node .claude/lib/design-map.js setup`; a `design.md`
   that is `missing` or `unfilled` ends the command STUCK with "run `/design-setup`". The product
   build is gated on `design.md`: read its section 1 and run nothing before it is filled.
2. **Choose the route from `design.md`.**
   - Source of truth `figma`: use the Figma connector route, the Design System type's
     `from-design-tool.md`. The Figma MCP is reachable from this main session only, so do this
     step here and never hand it to an agent (AC-F6.6).
   - Otherwise (`code`, `canvas`): read the Design System type's `from-code.md` live, through
     the system's canvas link or the Design System artifact, not a type link (D12).
3. **Build.** Run the product's build command only if `design.md` says the build may run
   (`May the product's build run to bundle components? yes`); otherwise bundle without it
   (AC-F6.3). Write list-format `tokens.json` (`{"tokens":[{name,value,usage}]}`, names unique,
   colour values hex/rgb/hsl/oklch/alias), copy fonts and logos, and for each platform whose
   component kind is `real` run:
   ```bash
   node .claude/lib/design-bundle.js build --project . --entry <entry> --namespace <Ns> --stack <stack> --out docs/ui/_design-system/<folder>
   ```
   Add a `preview.html` per component, starting `<!-- @dsCard group=".." height=.. -->`.
4. **README.** Write `README.md` for the system. It lists **every stub** `design-bundle.js`
   returned in its `stubs` (AC-F6.4), and its "Consuming" section names the global, the
   stylesheets and the scripts, in order, because each board must link them after its
   `support.js` line.
5. **Commit the built files** to `docs/ui/_design-system/<folder>/` (D4): the mirror leaves
   out `project/ds/`, so the committed copy is what a local render uses. Commit only that folder.
6. **Publish the Design System artifact**, per contract section 4 (read the whole artifact
   first, then publish; third refusal ends STUCK). Create it with `type_url` and `title` and no
   files, then publish to its `url`. `project/design-system.json` (with `createdOnFiles`) goes in
   the LAST call, `project/README.md` is mandatory, and `components/Cover/preview.html` is
   written last. One call holds at most 255 paths. If the Artifact tool is unavailable or
   `ensemble.publishArtifacts` is `false`, contract section 5 applies: files are written and
   committed, then end STUCK naming the publish step.
7. **Install on every canvas the product's maps record**, on the first build and on `--sync`
   (AC-F6.5, AC-F6.8), per contract section 3: `files` mapping each system file into
   `project/ds/<folder>/`, plus the `designSystems` record in `canvas.json`. At most four
   systems per canvas.
8. **Record the system in each `design-map.json`**, never in `design.md`, which stays
   owner-only (AC-F6.2). Set `design_system.url`, `version`, `code_commit` (the current HEAD) and
   `paths` (the component and token paths), and clear `drift`:
   ```bash
   node -e 'const m=require("./.claude/lib/design-map.js");const d=process.argv[1];const x=m.read(d);x.design_system={...x.design_system,url:process.argv[2],version:process.argv[3],code_commit:process.argv[4],paths:JSON.parse(process.argv[5])};delete x.design_system.drift;m.write(d,x)' docs/ui/<slug> "<url>" "<version>" "$(git rev-parse HEAD)" '["<path>"]'
   ```
   Run it once per map under `docs/ui/*/`. On a first build no map exists yet: write the same
   four fields to `docs/ui/_design-system/<folder>/system.json`, which `/create-design` reads
   to seed its map. Commit the maps with the system.
9. **Readout and close**, as below. Record the system's artifact link with
   `node .claude/lib/artifacts.js record` (kind `design-system`, `--command /design-system`).

---

## Readout

**Format: the four-section readout in `.claude/rules/command-status.md`** (STATE, DECISIONS,
ISSUES, NEXT, in that order, one screen, written for someone who was not in the session).
Contract section 7 applies: the system's link goes above the banner. ISSUES lists every stub.
NEXT is `/create-design <brief>` for a first build, or nothing after `--sync`.

---

## Completion signal (see `.claude/rules/command-status.md`)

**Under `--chained`**, print one line and stop. No banner, no `notify-complete.sh`:

```
[STATUS: /design-system] RETURN → <built|synced>, <n> canvases reinstalled, <n> stubs
```

**Otherwise** end your final turn with the banner as the last line, nothing after it:

```
═══ COMMAND COMPLETE: /design-system ═══
<one-line summary of what was produced>
```

On unrecoverable failure use `═══ COMMAND STUCK: /design-system ═══` with `Reason:` and `Next:`
lines. On the same final turn invoke the notify helper (a no-op when not configured):

```bash
.claude/hooks/notify-complete.sh "design-system" "complete" "<one-line summary>"
```

For `COMMAND STUCK`, use `"stuck"`.

---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from this invocation to its banner. Do not pause to ask the
owner to confirm, review or defer. `AskUserQuestion` is permitted only for genuine ambiguity
with no documented default, missing information that cannot be derived, an irreversible
destructive operation, or a STUCK condition after retries. Otherwise decide, document, proceed.

## What this command must not do

- Edit `design.md`, or write the system's version or commit into it.
- Run the product build when `design.md` does not allow it.
- Publish a credential, or any value from `verification.md` §3.
- Call `/design-sync` or reuse its name or flags.
- Chain into another command; the caller (`/sync-design`) owns the chain.
