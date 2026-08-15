#!/usr/bin/env python3
"""Evidence collector for the old-vs-new generator A/B.

DELIBERATELY NOT A SCORER.

An earlier version of this file pattern-matched keywords to decide whether each of the
spec's five MUSTs was "present". That was wrong, and wrong in this project's signature way:
`re.search("stale")` establishes that a word occurs, not that a requirement is satisfied.
An artifact can name both halves of requirement 2 and design nothing; another can solve it
properly in different vocabulary and score zero. It is the same mistake as the regex
battery in `docs/TRD/discipline-judgment.md`, which missed a live violation because every
pattern said "waiting for" and the subagent wrote "waiting on".

So this file now does only what a script can honestly do: count the countable, and EXTRACT
the passages a human has to read. Satisfaction of a requirement, quality of a design, and
appropriateness of task sizing are judgment calls and are left to the assessment.

Usage:  python3 docs/modernization/runs/ab-test/collect.py [--extract]
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

# Search terms used ONLY to locate candidate passages for reading -- never to decide
# whether a requirement is met. A miss here means "nothing obvious to quote", not "absent".
LOCATORS = {
    "R1 per-file diff vs generated": [r"per[- ]file", r"file[- ]by[- ]file", r"\bdrift\b", r"\bdiffer"],
    "R2 stale vs customized (THE HARD ONE)": [r"\bstale\b", r"customi[sz]", r"deliberate"],
    "R3 report only, no mutation": [r"read[- ]only", r"report[- ]only", r"must not (modify|change|write)"],
    "R4 works with no plugin installed": [r"no plugin", r"plugin.{0,20}not installed", r"absent"],
    "R5 works on pre-existing runtimes": [r"scaffolded before", r"retroactiv", r"pre[- ]exist", r"no cooperation"],
    "NG1 auto-fix (non-goal)": [r"auto[- ]?fix", r"auto[- ]?repair", r"remediat"],
    "NG2 version control (non-goal)": [r"version[- ]control", r"vendor.{0,15}strateg"],
}

# A number with a unit. The spec contains none, so every hit is a candidate invention --
# but whether it is justified depends on the line, which is why hits are printed, not tallied
# into a verdict.
NUMBER_RE = re.compile(
    r"(?<![\w.\-/§])(\d+(?:\.\d+)?)\s*"
    r"(ms\b|s\b|sec\b|secs\b|seconds?\b|minutes?\b|%|MB\b|GB\b|KB\b|RPS\b|QPS\b|req/s)"
    r"(?![\w-])"
)

TASK_ID_RE = re.compile(r"^\|\s*\*{0,2}([A-Z][A-Z0-9]{1,}-[A-Z]\d{3})\*{0,2}\s*\|", re.M)


def read(p):
    try:
        with open(p, encoding="utf-8") as fh:
            return fh.read()
    except FileNotFoundError:
        return None


def countable(text):
    """Only things a script can state without interpreting anything."""
    ids = sorted(set(TASK_ID_RE.findall(text)))
    rows = [l for l in text.split("\n") if TASK_ID_RE.match(l)]
    paths = [len(set(re.findall(r"`([\w./-]+\.(?:sh|js|py|md|json|ts|tsx))`", r))) for r in rows]
    body = re.sub(r"```.*?```", "", text, flags=re.S)
    return {
        "bytes": len(text),
        "lines": text.count("\n"),
        "sections": len(re.findall(r"^## ", text, re.M)),
        "tasks": len(ids),
        "task_ids": ids,
        "loop_cost": len(ids) * 5,
        "files_per_task_mean": round(sum(paths) / len(paths), 1) if paths else 0,
        "tasks_naming_no_file": paths.count(0) if paths else 0,
        "numbers_with_units": [(m.group(0), body[body.rfind("\n", 0, m.start()) + 1:
                                                 (body.find("\n", m.end()) or len(body))].strip()[:100])
                               for m in NUMBER_RE.finditer(body)],
    }


def passages(text, terms, width=2):
    """Lines matching any locator, with context, for reading."""
    lines = text.split("\n")
    hits = set()
    for i, l in enumerate(lines):
        if any(re.search(t, l, re.I) for t in terms):
            hits.update(range(max(0, i - width), min(len(lines), i + width + 1)))
    out, prev = [], -99
    for i in sorted(hits):
        if i != prev + 1:
            out.append("    ...")
        out.append(f"    {lines[i][:150]}")
        prev = i
    return out


def main():
    extract = "--extract" in sys.argv
    for arm in ("old", "new"):
        for kind in ("PRD", "TRD"):
            p = os.path.join(ROOT, arm, f"{kind}.md")
            t = read(p)
            print("=" * 78)
            print(f"  {arm.upper()} / {kind}")
            print("=" * 78)
            if t is None:
                print("  not written yet\n")
                continue
            c = countable(t)
            print(f"  {c['bytes']:,} bytes | {c['lines']} lines | {c['sections']} sections")
            if c["tasks"]:
                print(f"  tasks: {c['tasks']}  -> {c['loop_cost']} implement-loop agent invocations")
                print(f"  files named per task: mean {c['files_per_task_mean']}, "
                      f"{c['tasks_naming_no_file']} tasks name none")
                print(f"  ids: {' '.join(c['task_ids'])}")
            n = c["numbers_with_units"]
            print(f"  numbers with units: {len(n)}  (spec has ZERO -- each needs justification)")
            for v, line in n[:12]:
                print(f"      {v:>10}  {line}")
            if len(n) > 12:
                print(f"      ... {len(n)-12} more")
            if extract:
                for name, terms in LOCATORS.items():
                    body = passages(t, terms)
                    print(f"\n  ---- passages near: {name} ----")
                    print("\n".join(body[:40]) if body else "    (nothing matched — read the doc, do not assume absent)")
            print()

    print("=" * 78)
    print("  THIS SCRIPT DOES NOT DECIDE WHETHER ANY REQUIREMENT IS MET.")
    print("  Counts above are inputs. Requirement satisfaction, design quality, task")
    print("  sizing, and whether a number is justified are judgment calls made by reading")
    print("  the artifacts. Run with --extract to dump the passages worth reading.")
    print("=" * 78)


if __name__ == "__main__":
    sys.exit(main())
