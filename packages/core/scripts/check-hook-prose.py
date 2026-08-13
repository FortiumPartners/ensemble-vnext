#!/usr/bin/env python3
"""Assert every hook-MANAGING command carries the generated hook table.

Why this exists
---------------
init-project.md carried the generated ENSEMBLE:HOOKS-TABLE block and stayed correct
through the 4.1.9-4.1.11 discipline-hook conversion. rebase-project.md described the
same hook set in hand-written prose and rotted the moment that set changed — shipping a
settings-merge rule that silently preserved a stale hooks block and dropped three
model-judged hooks in a real user project, with no error at any point.

generate-hooks-artifacts.sh --check validated three generated consumers and was
structurally blind to the fourth. The defect was not that the prose was wrong; it was
that a hook-managing command was allowed to describe the hook set in prose at all.

Why an explicit list, not a heuristic
-------------------------------------
The first version of this guard flagged any command naming two or more hook files. That
caught six commands that legitimately REFERENCE hooks without describing the installed
set — implement-trd.md names five while explaining its own loop, which is correct and
useful. A guard that fires on correct code gets disabled, and then it protects nothing.

The distinction that matters is not "mentions hooks" but "tells you what an install must
CONTAIN". That is a small, knowable set of commands, so it is listed rather than guessed.

Adding a command that installs, verifies, or migrates the hook set? Add it here AND give
it the ENSEMBLE:HOOKS-TABLE markers. That is the whole contract.
"""
import os
import sys

# Commands that make claims about what a project's installed hook set contains.
HOOK_MANAGING = ("init-project.md", "rebase-project.md")

MARKER = "ENSEMBLE:HOOKS-TABLE:BEGIN"


def main(repo):
    cmd_dir = os.path.join(repo, "packages/core/commands")
    problems = []

    for name in HOOK_MANAGING:
        path = os.path.join(cmd_dir, name)
        if not os.path.isfile(path):
            problems.append(f"{name}: listed as hook-managing but not found at {path}")
            continue
        if MARKER not in open(path).read():
            problems.append(
                f"{name}: manages the hook set but carries no generated "
                f"ENSEMBLE:HOOKS-TABLE block — its description WILL rot the next time "
                f"the hook set changes"
            )

    for p in problems:
        print(p, file=sys.stderr)
    if problems:
        print(
            "\nAdd the markers and re-run generate-hooks-artifacts.sh.",
            file=sys.stderr,
        )
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
