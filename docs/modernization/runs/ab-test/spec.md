# Feature request: runtime drift detection

A project that has been scaffolded from the Ensemble plugin carries a vendored `.claude/`
runtime — commands, agents, hooks, rules. Over time that copy diverges from what the plugin
would generate today. Two different things cause divergence, and they need opposite
responses:

- The plugin moved on and the project didn't. The project is **stale** and should refresh.
- Someone edited the vendored copy on purpose, for that project. That's **customization**
  and must be preserved — refreshing over it destroys real work.

Today nothing tells you which you have. `generate-hooks-artifacts.sh --check` compares only
the plugin's own template against the manifest; it never looks at a consuming project's
`.claude/`. So a project can sit on a two-release-old runtime indefinitely with no signal,
and a refresh can silently overwrite a deliberate local change.

I want a way to ask a project "what has drifted, and which kind is it?"

## Requirements

1. It MUST report, per file, whether the vendored copy differs from what the currently
   installed plugin would generate.
2. It MUST distinguish stale-and-should-refresh from deliberately-customized. How to tell
   them apart is the hard part and I don't have an answer — that's what I want designed.
3. It MUST NOT change anything. Reporting only.
4. It MUST still produce a useful answer when no plugin is installed at all.
5. It MUST work on a project whose runtime was scaffolded before this feature existed —
   no cooperation from the past.

## Not doing

- Automatically fixing drift. I'll decide what to do with the report.
- Any change to how the runtime is version-controlled.

## Context

Ensemble vNext. See `.claude/rules/stack.md` and `.claude/rules/constitution.md` for the
stack and the project's absolutes.
