# Ensemble vNext Skills Library

This directory contains skill definitions for the Ensemble vNext plugin.

## What are Skills?

Skills are Markdown files that encode domain expertise and best practices. They are interpreted by Claude at runtime, not executed as code.

## Skill Structure

Each skill is organized in its own directory:

```
skills/
  skill-name/
    SKILL.md        # Quick reference (<100KB)
    REFERENCE.md    # Comprehensive patterns (optional, <1MB)
    examples/       # Real-world examples (optional)
    templates/      # Code templates (optional)
```

## Creating a New Skill

1. Create a directory with the skill name (kebab-case)
2. Create `SKILL.md` with YAML frontmatter:

```markdown
---
name: skill-name
description: Brief description of the skill
allowed-tools: Read, Write, Edit, Bash
---

# Skill Name

Content here...
```

## Available Skills

Skills are loaded dynamically based on the project's technology stack.

See individual skill directories for documentation.

## Framework skills

Every skill named in `framework-skills.txt` (this directory) ships to every project
regardless of stack selection or `--copy-skills`. That file is the one list (D14,
docs/TRD/verification-fix-loop.md §3.8): one skill per line as `<name> <role>`, with
`#` comments allowed. `role` is `check` (selectable as an optional functional-verification
check — design/flow/data comparisons, docs/TRD/verification-artifacts.md) or `support`
(shipped, but not offered as a check — e.g. `verification-setup`, the
owner-invoked interview that writes `.claude/rules/verification.md`).

`scaffold-project.sh`'s `copy_framework_skills()` reads this file at runtime (there is no
hardcoded skill name anywhere else) to build its `FRAMEWORK_SKILLS` array, installs every
listed skill on scaffold, adds any missing one on `--refresh`, and ships the list file
itself to `.claude/skills/framework-skills.txt`. Adding a skill means adding a line here —
no other file changes. `/rebase-project` treats every listed skill as always-installed
rather than stack-derived.
