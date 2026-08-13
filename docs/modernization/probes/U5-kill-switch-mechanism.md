# U5 Probe — DISC-B007 Kill Switch: Which Mechanism Actually Works

**Task:** DISC-B007 (`docs/TRD/discipline-judgment.md` §3.4). The team lead's framing going in:
§3.4 as written specifies `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE=1` "restoring command-type
behavior without a redeploy... read at call time, never latched at module load" — and the
suspicion that this is not implementable for a `hookType:"prompt"` entry, because a command
hook is a process we control and a prompt hook is evaluated entirely by the platform.

**Verdict up front: the suspicion is correct.** No mechanism gives a true call-time runtime
switch. The only working mechanism is generation-time (the team lead's Candidate 3), and it is
what got built. §3.4 and D5 need amending to match. Proposed wording is at the bottom.

**Method:** source extraction from the CLI bundle (`/Users/james/.local/bin/claude`, v2.1.229)
for the schema/execution-semantics questions, cross-checked with live probes in throwaway
`mktemp -d` git repos for the two empirically-checkable claims (the `if` field's actual
gating behavior, and hook-composition semantics already touched on by DISC-P002's loop
findings). Tags: **[OBSERVED]** live evidence, **[BUNDLE]** literal extracted source,
**[INFERRED]** reasoned from the other two.

---

## Candidate 1 — the `if` field

**[BUNDLE]** — the `if` field's schema description, extracted verbatim from the same
zod-equivalent schema builder documented in DISC-P002, is shared across every hook type
(command, prompt, agent, http, mcp_tool):

```
'Permission rule syntax to filter when this hook runs (e.g., "Bash(git *)"). Only runs if
the tool call matches the pattern. Avoids spawning hooks for non-matching commands.'
```

This is a **tool-call matcher** — the same pattern language permission rules use (`Bash(git
*)`, `Write(*.md)`, etc.) — evaluated by the platform against the tool call that triggered the
hook. It has no defined syntax for matching environment variables, and `Stop`/`SubagentStop`
events have no associated tool call for it to match against in the first place (they fire on
session end, not on a specific tool invocation).

### Live confirmation

**[OBSERVED]** — three throwaway-repo runs, each `claude --print --setting-sources project
--dangerously-skip-permissions` against a fresh `mktemp -d` git repo:

1. Baseline: a Stop hook configured to unconditionally `ok:false` (no `if` field) — fires and
   blocks as expected (visible in the transcript, matching every DISC-P002/P003 always-block
   probe).
2. Same hook, `"if": "ENSEMBLE_DISCIPLINE_JUDGE_DISABLE=1"`, env var **unset** at runtime — the
   hook does **not** fire at all. The session completes cleanly with no Stop-hook feedback
   anywhere in the output.
3. Config accepted without any validation error (the field is evidently a free-form string at
   config-load time — no syntax check against real permission-rule grammar happens until
   evaluation).

The only way (2) differs from (1) is the presence of a non-empty `if` value that is not valid
tool-call-matcher syntax. The observed effect is that the hook **silently disables itself
whenever `if` doesn't match a real tool call** — since Stop/SubagentStop never has one, any
non-empty `if` value on these two events appears to permanently prevent the hook from firing,
regardless of the string's content. This is the opposite of a working kill switch: it doesn't
gate on the env var's value, it just turns the hook off unconditionally.

**Verdict: `if` does not work.** It is not a conditional expression evaluator, has no access
to environment variables, and does not apply meaningfully to Stop/SubagentStop hooks at all.

## Candidate 2 — cross-gating via both hooks registered

DISC-P001 (register two hooks on one event; determine whether both run and whether any-block
wins) was left blocked/abandoned. This candidate depends entirely on its answer, so it had to
be resolved here rather than assumed.

**[BUNDLE]** — traced the hook-execution path from the query loop (`hgp()`) down through the
per-event dispatcher (`QIe()`) into the actual hook-runner (`V2()`/`zNf()`). The relevant
structure:

```js
// zNf(): for a given event, y = every matched hook (all hooks whose matcher/if pass)
let H = y.map(async function*({hook: B, ...}, Z) => { /* runs hook B, yields its result */ });
// ...
for await (let B of i8o(H)) {           // i8o() merges the per-hook async generators
  ...
  if (B.blockingError) yield { blockingError: B.blockingError, ... }, q = "deny";
  if (B.message) yield { message: B.message, ... };
  ...
}
```

`y.map(...)` builds one independent async generator **per matched hook**, and `i8o(H)`
(a generator-merge utility) iterates all of them to completion. There is no early exit: a
block from hook N does not prevent hook N+1 from running, and nothing in this loop skips a
hook based on another hook's result. The final decision is **OR-composed** — `q = "deny"` gets
set the moment *any* hook reports `blockingError`, with no mechanism for one hook's result to
cancel or override another's.

**Verdict: cross-gating does not work, for two independent reasons.** (a) All hooks registered
on an event always run — you cannot use one hook's presence/absence or ordering to suppress
another's evaluation. (b) Even if you could, a prompt-type hook has no path to read
`ENSEMBLE_DISCIPLINE_JUDGE_DISABLE` at all: **[BUNDLE]**, confirmed in DISC-P002's schema
extraction, the prompt-hook evaluator query is built with `tools:[]` and a fixed
`outputFormat` JSON schema (`{ok, reason, impossible}`) — no tool access, and its input is the
fixed hook-payload JSON (`session_id, transcript_path, cwd, ..., background_tasks,
session_crons, stop_hook_active, ...` — the exact field list DISC-P002 enumerated) with no
arbitrary environment variables anywhere in it. There is no channel — payload, tool, or
otherwise — by which a prompt-type hook's evaluator could ever observe an env var.

This also **retroactively answers DISC-P001/U1**, previously blocked: hooks on one event all
run, and any single hook's block wins (OR-composition) — no hook can suppress another.

## Candidate 3 — generation-time switch (what got built)

**Verdict: this is the only mechanism that works, and it does work.** `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE`
is read by `generate-hooks-artifacts.sh` — the one place in this entire feature where code we
control actually executes (the generator is a real Python/Bash process with genuine
`os.environ` access, unlike a prompt-type hook). When set, every `hookType:"prompt"` manifest
entry generates as `hookType:"command"` instead, using the same `"file"`, restoring the
command-type predecessor's exact settings.json shape.

**"Read at call time, never latched"** — the literal 4.1.8 bug this requirement guards
against — is honored in the only sense available to a build-time mechanism: the env var is
read fresh inside `build_hooks_block()` on every single invocation of the script (there is no
persistent process, no module cache, nothing to latch a stale value into — each run is a new
interpreter). §3.4's exact wording ("never latched at module load") was written with a
long-running hook process in mind; translated to a generator that runs once and exits, the
equivalent guarantee is "never a default-arg/constant baked in above the read," which the
implementation honors — `DISCIPLINE_JUDGE_DISABLE` is computed once per script invocation, not
once per some enclosing scope that could outlive a single run.

Implementation also updates the two symlink-producing loops (`packages/full/hooks/` file
symlinks, and `scaffold-project.sh`'s `manifest_shippable_hooks()`) to agree with the switch:
when active, a shippable `hookType:"prompt"` entry's script now needs delivering (it's
generating as command-type), so it's no longer excluded from either list. Both read the same
env var independently, since they're separate Python subprocesses within the same script
invocation (bash exports the var into every child process it spawns).

### Live confirmation

**[OBSERVED]** — two BATS tests in `packages/core/scripts/scaffold-project.test.sh`
(`kill switch: ...`) exercise this against a disposable fixture entry added to the real
manifest and restored/deleted in teardown:

1. Same manifest, generated twice — once with the env var unset, once with
   `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE=1` — produces two **different** `settings.json` shapes
   for the identical entry (`type:"prompt"` vs `type:"command"` with the right
   `.claude/hooks/<file>` invocation), proving the read is live per-invocation rather than a
   value baked in anywhere.
2. `packages/full/hooks/<file>` has no symlink in the unset pass (nothing to run) and gains
   one in the disabled pass (script now needs delivering) — same script, same manifest, only
   the env var differs.
3. **The honest limitation, asserted directly**: regenerating under the disabled state and
   then running `--check` **without** the env var reports `DRIFT`. Flipping the env var alone
   changes nothing — the switch only takes effect on the next `generate-hooks-artifacts.sh`
   run, and forgetting to keep regenerating under a consistent state is drift like any other.
   There is no instantaneous runtime toggle.

Full suite: 88/88 BATS passing; `generate-hooks-artifacts.sh --check` exits 0 on the current
tree (no manifest entry has `hookType:"prompt"` yet — verified against `HEAD`, consistent with
DISC-B008 not having landed).

---

## Proposed amendment to §3.4 and D5

**§3.4 Kill switch** — replace:

> `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE=1` restores command-type behavior without a redeploy. Read
> at **call time**, never latched at module load — 4.1.8 shipped exactly that bug and its test
> caught it.

with:

> `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE=1` is read by `generate-hooks-artifacts.sh`, not by the
> hook itself — a call-time read inside the hook is not implementable for `hookType:"prompt"`
> entries, because the platform evaluates the hook with no code of ours in the loop, no tool
> access, and no environment variables in its fixed payload (proven in
> `docs/modernization/probes/U5-kill-switch-mechanism.md`, which also rules out the `if` field
> and cross-hook gating as alternatives). Setting the env var and re-running the generator
> reverts every `hookType:"prompt"` entry to its command-type predecessor, using the existing
> `--refresh` channel to deliver the regenerated artifacts to affected projects. The env var is
> read fresh on every generator invocation — the build-time equivalent of "never latched" — but
> this is a regenerate-and-refresh operation, not an instantaneous runtime toggle: flipping the
> variable alone has no effect until the generator runs again.

**D5** — replace:

> Ship with a kill switch | Operational rollback, not indecision: one env var restores the
> previous behavior if the judge misbehaves in the wild.

with:

> Ship with an operational rollback lever | Not indecision: one env var
> (`ENSEMBLE_DISCIPLINE_JUDGE_DISABLE`), read by the generator, reverts every converted hook to
> its command-type predecessor on the next regenerate-and-refresh cycle if the judge misbehaves
> in the wild. This is a fast, low-friction rollback — no manifest hand-editing, uses
> infrastructure that already exists (`generate-hooks-artifacts.sh`, `--refresh`) — but it is
> not an instant runtime toggle; see §3.4.

---

## Appendix — cleanup

Throwaway `mktemp -d` repos used for the `if`-field probe were deleted after use. The two
BATS tests added for this task mutate the real manifest/settings.json/init-project.md via the
existing `_track_for_restore`/`_track_for_deletion` pattern (same as DISC-B005's tests) and
restore everything in `teardown()` regardless of pass/fail — verified via `git status`
showing no unexpected dirty files after a full test run. No hook's `hookType` was changed in
the real manifest; `git show HEAD:packages/core/hooks/hooks.manifest.json` still shows every
real hook's `hookType` as absent (command, the default).
