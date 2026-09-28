#!/usr/bin/env python3
"""Replay labelled Stop cases through a judge prompt on a given model; record verdict + latency.

What the judge is given, per case, mirrors the live prompt-hook evaluator. Two wrappers:
  stop-condition (default)  Claude Code 2.1.281+ for Stop/SubagentStop: the system prompt and
      user-message framing below, copied from the 2.1.283 binary on 2026-09-28. The hook
      prompt arrives as `Condition: <prompt>` under "has the following stopping condition been
      satisfied?", after the transcript. The official docs describe none of this.
  legacy  the generic evaluator probed in 2026-08 (docs/modernization/probes/U2-prompt-payload.md),
      kept so the September baseline in FINDINGS.md stays reproducible.
The transcript is the case's rendered recent conversation; the live evaluator passes real
messages and, on long sessions, truncates them with a note of its own (not reproduced here).
Output is forced through a JSON schema {ok, reason}, the stand-in for the live `submit` tool.

Latency is `duration_api_ms` from `claude -p --output-format json`: model time without the
process-startup cost that inflated an earlier figure 4x.

Usage: score.py --cases CASES.jsonl --prompt PROMPT.md --model MODEL --runs N --out OUT.jsonl
                [--concurrency 8] [--tag NAME] [--wrapper stop-condition|legacy]
"""
import argparse
import concurrent.futures as cf
import json
import os
import subprocess
import time

SYSTEM_LEGACY = ("You are evaluating a Stop hook in Claude Code. Your task is to evaluate the "
                 "condition described in the user message.\n\nWhen done, return your result with:\n"
                 "- ok: true if the condition is met\n- ok: false with reason if the condition is not met")
SYSTEM_STOP_CONDITION = (
    "You are evaluating a stop-condition hook in Claude Code. Read the conversation transcript "
    "carefully, then judge whether the user-provided condition is satisfied.\n\n"
    "Your response must be a JSON object with one of these shapes:\n"
    '- {"ok": true, "reason": "<quote evidence from the transcript that satisfies the condition>"}\n'
    '- {"ok": false, "reason": "<quote what is missing or what blocks the condition>"}\n'
    '- {"ok": false, "impossible": true, "reason": "<explain why the condition can never be satisfied>"}\n\n'
    'Always include a "reason" field, quoting specific text from the transcript whenever possible. '
    'If the transcript does not contain clear evidence that the condition is satisfied, return '
    '{"ok": false, "reason": "insufficient evidence in transcript"}.\n\n'
    'Only use {"ok": false, "impossible": true} when the condition is genuinely unachievable in this '
    "session \u2014 for example: the condition is self-contradictory, it depends on a resource or "
    "capability that is unavailable, or the assistant has explicitly tried, exhausted reasonable "
    "approaches, and stated it cannot be done. Apply your own judgment when deciding this \u2014 the "
    "assistant claiming the goal is impossible is evidence, not proof; independently confirm the "
    "condition is genuinely unachievable rather than deferring to the assistant's self-assessment. "
    "Do not use it just because the goal has not been reached yet or because progress is slow. "
    'When in doubt, return {"ok": false} without "impossible".')
SCHEMA_LEGACY = json.dumps({"type": "object",
                            "properties": {"ok": {"type": "boolean"}, "reason": {"type": "string"}},
                            "required": ["ok"]})
SCHEMA_STOP_CONDITION = json.dumps({"type": "object",
                                    "properties": {"ok": {"type": "boolean"}, "reason": {"type": "string"},
                                                   "impossible": {"type": "boolean"}},
                                    "required": ["ok", "reason"], "additionalProperties": False})
STOP_QUESTION = ("Based on the conversation transcript above, has the following stopping condition "
                 "been satisfied? Answer based on transcript evidence only.\n\nCondition: ")


def user_message(prompt, case, wrapper='stop-condition'):
    body = prompt.replace('$ARGUMENTS', json.dumps(case['payload'], indent=2))
    if wrapper == 'legacy':
        return (body + "\n\n## Recent conversation (oldest first; earlier messages truncated)\n\n"
                + case['context'])
    return ("## Conversation transcript (oldest first; earlier messages truncated)\n\n"
            + case['context'] + "\n\n" + STOP_QUESTION + body)


def judge(prompt, case, model, wrapper='stop-condition'):
    t0 = time.time()
    p = subprocess.run(
        ['claude', '-p', '--model', model, '--system-prompt',
         SYSTEM_LEGACY if wrapper == 'legacy' else SYSTEM_STOP_CONDITION, '--tools', '',
         '--json-schema', SCHEMA_LEGACY if wrapper == 'legacy' else SCHEMA_STOP_CONDITION, '--output-format', 'json', '--no-session-persistence',
         '--setting-sources', ''],
        input=user_message(prompt, case, wrapper), capture_output=True, text=True, cwd='/tmp', timeout=300)
    wall = int((time.time() - t0) * 1000)
    try:
        d = json.loads(p.stdout)
        so = d.get('structured_output') or {}
        return {'ok': so.get('ok'), 'reason': so.get('reason', ''),
                'api_ms': d.get('duration_api_ms'), 'wall_ms': wall,
                'cost': d.get('total_cost_usd'), 'error': d.get('is_error')}
    except ValueError:
        return {'ok': None, 'reason': '', 'api_ms': None, 'wall_ms': wall, 'cost': None,
                'error': (p.stderr or p.stdout)[-300:]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cases', required=True)
    ap.add_argument('--prompt', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--runs', type=int, default=3)
    ap.add_argument('--out', required=True)
    ap.add_argument('--concurrency', type=int, default=8)
    ap.add_argument('--tag', default='')
    ap.add_argument('--wrapper', choices=['stop-condition', 'legacy'], default='stop-condition')
    a = ap.parse_args()
    prompt = open(a.prompt).read()
    cases = [json.loads(l) for l in open(a.cases)]
    jobs = [(c, r) for r in range(a.runs) for c in cases]
    done = 0
    with open(a.out, 'a') as fh, cf.ThreadPoolExecutor(a.concurrency) as ex:
        futs = {ex.submit(judge, prompt, c, a.model, a.wrapper): (c, r) for c, r in jobs}
        for f in cf.as_completed(futs):
            c, r = futs[f]
            res = f.result()
            fh.write(json.dumps({'tag': a.tag, 'model': a.model, 'prompt': os.path.basename(a.prompt),
                                 'id': c['id'], 'run': r, **res}) + '\n')
            fh.flush()
            done += 1
            if done % 25 == 0:
                print(f'{a.tag}: {done}/{len(jobs)}', flush=True)


if __name__ == '__main__':
    main()
