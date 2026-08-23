# Functional Success Definition: precompact-schema

**Source**: reproduction text supplied verbatim (Steps / Actual / Expected)
**Source kind**: reproduction
**Derived**: 2026-08-23T07:02:55Z
**Criteria**: 5

| ID | Functional statement | Cites | Evidence that would prove it | Derivation |
|----|----------------------|-------|------------------------------|------------|
| FS-1 | Feeding a PreCompact hook payload to `.claude/hooks/precompact.js` terminates with exit status 0 | §Expected: "Exit 0 with a payload using only documented top-level keys" | Captured shell transcript of the §Steps command (`echo '{...,"hook_event_name":"PreCompact","trigger":"manual"}' \| .claude/hooks/precompact.js`) run with `cwd` set to a fresh `mktemp -d`, showing the recorded `$?` as `0` | [read] |
| FS-2 | The JSON the hook writes to stdout for a PreCompact event contains no `hookSpecificOutput` key at any level | §Expected: "no `hookSpecificOutput` for PreCompact"; §Actual shows the rejected payload as `{"hookSpecificOutput":{"hookEventName":"PreCompact","additionalContext":"Compaction imminent — …"}}` | The same captured stdout, saved to a file, with the parsed key set recorded — `hookSpecificOutput` absent | [read] |
| FS-3 | Every top-level key the hook emits for a PreCompact event is one the platform documents for hook output | §Expected: "a payload using only documented top-level keys" | The captured stdout's top-level key list, each key checked off against the Claude Code hook-output key list the platform documents; any key not on that list is a failure | [read] |
| FS-4 | A real compaction in a session with an active feature produces no `Hook JSON output validation failed` line | §Expected: "No validation error."; §Actual: `PreCompact [...precompact.js] failed: Hook JSON output validation failed — (root): Invalid input`, and §Steps' alternative "trigger any compaction in a session with an active feature" | Session transcript or terminal capture of a compaction triggered in a session with an active feature, grepped for `Hook JSON output validation failed` and for `precompact.js] failed` — both absent | [read] |
| FS-5 | The checkpoint archive to `.trd-state/<feature>/session-log.md` still happens after the payload is corrected | §Actual: "The archive to `session-log.md` still happens; only the payload is rejected" — the reproduction scopes the defect to the payload, so the archive is behaviour that must survive the fix rather than behaviour to remove | Before/after listing plus diff of the feature's `session-log.md` across a PreCompact invocation, showing the new checkpoint entry was appended | [read] |

## Considered and not made criteria

The §Steps note that running the hook with `cwd` set to a real repo "appends a bogus
checkpoint to the live `.trd-state/<feature>/session-log.md`" and so "dirties the working
tree" was considered as a sixth criterion. It is stated there as a hazard of *reproducing*
the defect and as the reason to use an isolated `cwd`, and §Expected asks for nothing about
it. Nothing in the source says that append is itself behaviour to change — FS-5 in fact
requires the archive to keep working — so a criterion demanding it stop would be invented
rather than cited, and it is dropped.

The §Actual payload's `additionalContext` text ("Compaction imminent — …") is truncated in
the source, so no criterion asserts anything about the checkpoint nudge's wording. §Expected
constrains the payload's *keys*, not its prose, and that is what FS-2 and FS-3 check.
