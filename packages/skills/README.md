# Ensemble skill library

69 skills, one directory each. A skill is a Markdown prompt that Claude reads at runtime; it
carries no executable code. The plugin ships this directory as `skills-lib/`
(`packages/full/skills-lib` is a symlink to it), and `/init-project` copies the skills a
project needs into that project's `.claude/skills/`.

## How a skill reaches a project

| Kind | Which ones | How it is installed |
|---|---|---|
| Framework skills | The 8 named in `framework-skills.txt` | Always, whatever the stack. Scaffold installs them, `--refresh` adds any that are missing, and `/rebase-project` treats them as always installed |
| Stack skills | Everything else | Chosen by `/init-project` from the project's stack and written to `.claude/selected-skills.txt`; scaffold's `--copy-skills` copies that list |

## Framework skills

`framework-skills.txt` is the one list of framework skills: one `<name> <role>` per line, `#`
comments allowed. `scaffold-project.sh` reads it at runtime, so adding a framework skill means
adding a line there and nothing else. Role `check` means the skill can be selected as an
optional check in the functional-verification loop; `support` means it ships but is not
offered as a check.

| Skill | Role | What it does |
|---|---|---|
| `verify-design-comparison` | check | Compares the build screen by screen against design frames (Figma or exported PNGs) and renders a design / build / diff / overlay page with a verdict per frame |
| `verify-flow-as-built` | check | Walks a designed screen-to-screen journey in the build and compares designed and as-built flow, step by step |
| `verify-data-fidelity` | check | Compares the rows a screen renders with a fresh read-only fetch of the data behind them, field by field |
| `verify-design-structure` | check | Checks that the components a design board names appear at that board's route in the running build (React and react-native-web only; elsewhere it reports "not verifiable here") |
| `verification-setup` | support | Owner-run interview that writes `.claude/rules/verification.md`: environments, capacity, refresh and deploy commands, where credentials live, known gaps, coverage floor |
| `design-setup` | support | Owner-run interview that writes `.claude/rules/design.md`: the design system, per-platform settings, how to reach a screen, design rules |
| `designing-on-canvas` | support | This framework's board conventions for drawing screens on a Design canvas; used by `/create-design`, `/refine-design` and `/design-system` |
| `design-grounding` | support | How a read-only agent inventories an existing product's screens, components, flows and data before anything is drawn; used by `/create-design` and `/design-system` |

`verification-setup` and `design-setup` set `disable-model-invocation: true`: only the owner
runs them, because their answers are policy (what may be touched, where credentials live) that
an agent should not infer.

## Stack skills

| Area | Skills |
|---|---|
| Languages and frameworks | `developing-with-python`, `developing-with-typescript`, `developing-with-react`, `developing-with-dotnet`, `developing-with-flutter`, `developing-with-laravel`, `developing-with-php`, `nestjs`, `phoenix`, `rails`, `blazor`, `styling-with-tailwind`, `frontend-design` |
| Test runners | `jest`, `pytest`, `rspec`, `exunit`, `xunit`, `writing-playwright-tests`, `playwright-automation` |
| Detection | `test-detector`, `framework-detector`, `tooling-detector`, `cloud-provider-detector` |
| Infrastructure and deploy | `aws-cloud`, `using-terraform-azure`, `using-azure-functions`, `kubernetes`, `helm`, `flyio`, `managing-railway`, `managing-vercel`, `managing-supabase`, `managing-azure-devops`, `act-local-ci` |
| Data and services | `using-prisma`, `using-pgvector`, `using-weaviate`, `using-celery`, `using-clerk`, `building-integrations` |
| AI and agents | `using-anthropic-platform`, `using-openai-platform`, `using-perplexity-platform`, `using-langfuse`, `building-rag-pipelines`, `building-langgraph-agents`, `building-agent-memory`, `building-tool-orchestration` |
| Smoke tests | `smoke-test-runner`, `smoke-test-api`, `smoke-test-auth`, `smoke-test-database`, `smoke-test-external-services`, `smoke-test-critical-paths` |
| Design and verification | `figma-pixel-perfect`, `verify-goal` (drives a TRD to "all assertions pass" under `/goal`) |
| Workflow tools | `git-town`, `managing-jira-issues`, `managing-linear-issues`, `changelog-generator` |

## Skill layout

```
<skill-name>/
  SKILL.md       required: frontmatter plus the quick reference
  REFERENCE.md   optional: fuller patterns (35 skills have one)
  ...            optional: templates, examples, tests (__tests__/)
```

`SKILL.md` frontmatter:

```markdown
---
name: skill-name
description: What the skill does, in one or two sentences.
when_to_use: When an agent should reach for it, and when not.
allowed-tools: Read, Write, Edit, Bash
---
```

`name` and `description` are required. Most skills also set `allowed-tools` and
`when_to_use`; owner-only skills add `disable-model-invocation: true`.

## Adding a skill

1. Create `<skill-name>/SKILL.md` (kebab-case name) with the frontmatter above.
2. For a stack skill, write `description` and `when_to_use` so they name the stacks it serves:
   `/init-project` selects stack skills by reading them, not from a lookup table. To preload
   it into an agent, add it to `packages/core/agents/skill-affinity.json`.
3. For a framework skill, add `<skill-name> <check|support>` to `framework-skills.txt`.
