#!/usr/bin/env python3
"""Replay labelled Stop cases through a judge prompt on a given model; record verdict + latency.

What the judge is given, per case, mirrors what the live prompt-hook evaluator gets
(docs/modernization/probes/U2-prompt-payload.md §2):
  system  the platform's generic evaluator system prompt (tool lines dropped: no tools here)
  user    the configured prompt with $ARGUMENTS replaced by the payload JSON, followed by
          the recent conversation. The live evaluator's exact inlining format is not
          documented; this is an approximation and is stated as one.
Output is forced through a JSON schema {ok, reason}, the stand-in for the live `submit` tool.

Latency is `duration_api_ms` from `claude -p --output-format json`: model time without the
process-startup cost that inflated an earlier figure 4x.

Usage: score.py --cases CASES.jsonl --prompt PROMPT.md --model MODEL --runs N --out OUT.jsonl
                [--concurrency 8] [--tag NAME]
"""
import argparse
import concurrent.futures as cf
import json
import os
import subprocess
import time

SYSTEM = ("You are evaluating a Stop hook in Claude Code. Your task is to evaluate the "
          "condition described in the user message.\n\nWhen done, return your result with:\n"
          "- ok: true if the condition is met\n- ok: false with reason if the condition is not met")
SCHEMA = json.dumps({"type": "object",
                     "properties": {"ok": {"type": "boolean"}, "reason": {"type": "string"}},
                     "required": ["ok"]})


def user_message(prompt, case):
    body = prompt.replace('$ARGUMENTS', json.dumps(case['payload'], indent=2))
    return (body + "\n\n## Recent conversation (oldest first; earlier messages truncated)\n\n"
            + case['context'])


def judge(prompt, case, model):
    t0 = time.time()
    p = subprocess.run(
        ['claude', '-p', '--model', model, '--system-prompt', SYSTEM, '--tools', '',
         '--json-schema', SCHEMA, '--output-format', 'json', '--no-session-persistence',
         '--setting-sources', ''],
        input=user_message(prompt, case), capture_output=True, text=True, cwd='/tmp', timeout=300)
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
    a = ap.parse_args()
    prompt = open(a.prompt).read()
    cases = [json.loads(l) for l in open(a.cases)]
    jobs = [(c, r) for r in range(a.runs) for c in cases]
    done = 0
    with open(a.out, 'a') as fh, cf.ThreadPoolExecutor(a.concurrency) as ex:
        futs = {ex.submit(judge, prompt, c, a.model): (c, r) for c, r in jobs}
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
