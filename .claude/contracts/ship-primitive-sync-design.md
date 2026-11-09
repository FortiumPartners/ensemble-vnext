---
primitive: sync-design
params:
results: synced, nothing, skipped
outward: yes
needs: merged
section: after
---

# Primitive: sync-design

After a merge, brings each design's boards in step with the merged build (D43 c, J-7). The code
has already shipped, so this primitive never returns `stop`.

## Input

`merged` and `mergedHead` from `context`, the base branch (`context.base`), `work`.

## Do

1. **List the designs to sync:**
   ```bash
   node .claude/lib/design-map.js unsynced --all --trd <work.trd> --merged-into origin/<base> \
     --merged-head <context.mergedHead>
   ```
   Empty: return `nothing`.
2. `design.md` unfilled or missing: return `skipped`, naming `/design-setup`. Read the base
   branch's copy, not the feature branch's, since this step runs before the switch to
   `origin/<base>`:
   ```bash
   node .claude/lib/design-map.js setup --file "$(node .claude/lib/owner-rules.js path design.md)"
   ```
3. **Set the working tree aside.** After a merge the state directory is uncommitted, and a plain
   switch would abort. If `git status --porcelain` is non-empty:
   `git stash push -u -m "ship-build sync-design <feature> <ts>"`, then take its SHA from
   `git stash list --format='%H %gs'` by that tag. Never a bare `git stash`.
4. For each design listed: `git fetch`; switch to a new `design-sync/<feature>-<slug>` branch at
   `origin/<base>` (the slug keeps a second design's branch from colliding with the first's); run `verification.md` section 2's fast refresh for `local` when one is
   declared; `Skill({ skill: "sync-design", args: "<slug> --trd <work.trd> --chained" })`; push
   the branch; `node .claude/lib/pull-request.js ensure --listed --base <base> --title ... --body-file ...`.
5. **Every path out, a failed design included,** switches back to the feature branch and runs
   `git stash apply <sha>`, then drops that entry (found again by its tag). A failed apply is
   named in `data.issues` with the SHA and the entry is kept, never dropped. The steps after this
   one write the state directory on the feature branch.
6. Boards it could not capture stay `building` and are named, with `/sync-design <slug> --trd
   <work.trd>` for NEXT, in `data.issues`.

## Result

`synced`, `nothing` or `skipped`, with `data`: `{ prs: [urls], uncaptured: [boards], issues }`.

## Waiting

The chained `/sync-design` is a synchronous Skill call.
