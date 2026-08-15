#!/usr/bin/env python3
"""Cost / time profile collector for the create -> refine -> audit pipeline.

Reads the workflow run records under
  ~/.claude/projects/<slug>/<session>/workflows/wf_*.json
and joins each to its agents' transcripts under <session>/subagents/agent-<id>.jsonl,
which are the ONLY place the full token breakdown lives.

WHY NOT wf.totalTokens: it is a single scalar. An earlier measurement in this project used
a figure that excluded cache reads and understated a pipeline by 36-159%. Cache reads are
billed (at 0.1x) and on a fan-out workflow they dominate the count, so any honest comparison
has to carry all four fields:

    input_tokens                 1.00x
    cache_creation_input_tokens  1.25x   (writing the prompt cache)
    cache_read_input_tokens      0.10x   (re-reading it -- cheap per token, huge in volume)
    output_tokens                model-dependent multiple of input

DOLLAR FIGURES ARE INDICATIVE. Rates below are list prices per MTok at the time of writing
and are not fetched live. Compare the arms to each other, not to an invoice.

Usage:
    python3 collect-profile.py --session <session-id> [--since <iso8601>] [--json]
    python3 collect-profile.py --list
"""
import argparse
import glob
import json
import os
import sys
from collections import defaultdict

PROJECTS = os.path.expanduser('~/.claude/projects')

# USD per million tokens: (input, output). Cache write = 1.25x input, read = 0.10x input.
RATES = {
    'opus':   (15.00, 75.00),
    'sonnet':  (3.00, 15.00),
    'haiku':   (1.00,  5.00),
}


def rate_for(model):
    m = (model or '').lower()
    for key in RATES:
        if key in m:
            return RATES[key]
    return RATES['sonnet']          # unknown model: mid-tier, and say so in the output


def cost(usage, model):
    inp, out = rate_for(model)
    return (
        usage['input']        * inp / 1e6 +
        usage['cache_write']  * inp * 1.25 / 1e6 +
        usage['cache_read']   * inp * 0.10 / 1e6 +
        usage['output']       * out / 1e6
    )


def zero():
    return {'input': 0, 'cache_write': 0, 'cache_read': 0, 'output': 0, 'turns': 0, 'tools': 0}


def add(dst, src):
    for k in ('input', 'cache_write', 'cache_read', 'output', 'turns', 'tools'):
        dst[k] += src[k]
    return dst


def read_agent(path):
    """Sum every assistant turn's usage in one agent transcript."""
    u = zero()
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            msg = rec.get('message') or {}
            usage = msg.get('usage')
            if usage:
                u['input']       += usage.get('input_tokens', 0)
                u['cache_write'] += usage.get('cache_creation_input_tokens', 0)
                u['cache_read']  += usage.get('cache_read_input_tokens', 0)
                u['output']      += usage.get('output_tokens', 0)
                u['turns']       += 1
            for block in (msg.get('content') or []) if isinstance(msg.get('content'), list) else []:
                if isinstance(block, dict) and block.get('type') == 'tool_use':
                    u['tools'] += 1
    return u


def collect(session_dir, since=None):
    runs = []
    for wf_path in sorted(glob.glob(os.path.join(session_dir, 'workflows', 'wf_*.json'))):
        try:
            wf = json.load(open(wf_path, encoding='utf-8'))
        except ValueError:
            continue
        if since and wf.get('timestamp', '') < since:
            continue
        agents, missing = [], 0
        for entry in wf.get('workflowProgress') or []:
            if entry.get('type') != 'workflow_agent':
                continue
            aid = entry.get('agentId')
            # Workflow agents write under subagents/workflows/<runId>/; plain Agent-tool
            # subagents write directly under subagents/. Try both.
            u = None
            if aid:
                for cand in (
                    os.path.join(session_dir, 'subagents', 'workflows', wf.get('runId') or '', f'agent-{aid}.jsonl'),
                    os.path.join(session_dir, 'subagents', f'agent-{aid}.jsonl'),
                ):
                    u = read_agent(cand)
                    if u is not None:
                        break
            if u is None:
                missing += 1
                continue
            agents.append({
                'label': entry.get('label') or entry.get('agentType') or '?',
                'phase': entry.get('phaseTitle') or '-',
                'model': entry.get('model') or '?',
                'state': entry.get('state'),
                'usage': u,
                'cost': cost(u, entry.get('model')),
            })
        runs.append({
            'runId': wf.get('runId'),
            'name': wf.get('workflowName'),
            'status': wf.get('status'),
            'timestamp': wf.get('timestamp'),
            'minutes': round((wf.get('durationMs') or 0) / 60000.0, 1),
            'agent_count': wf.get('agentCount'),
            'agents': agents,
            'transcripts_missing': missing,
            'args': wf.get('args'),
            'result': wf.get('result'),
        })
    return runs


def render(runs):
    if not runs:
        print('no workflow runs matched'); return
    grand, gcost, gmin = zero(), 0.0, 0.0
    for r in runs:
        tot, tcost = zero(), 0.0
        for a in r['agents']:
            add(tot, a['usage']); tcost += a['cost']
        add(grand, tot); gcost += tcost; gmin += r['minutes']

        print('=' * 92)
        print(f"  {r['name']}   [{r['status']}]   {r['minutes']} min   "
              f"{len(r['agents'])} agents   ${tcost:.2f}")
        if r['args']:
            a = r['args'] if isinstance(r['args'], dict) else {}
            bits = [f"{k}={v}" for k, v in a.items() if v]
            if bits: print('  args: ' + '  '.join(bits))
        if r['transcripts_missing']:
            print(f"  WARNING: {r['transcripts_missing']} agent transcript(s) not found — "
                  f"totals below are INCOMPLETE")
        print('-' * 92)
        print(f"  {'agent':<28} {'phase':<10} {'model':<8} {'in':>7} {'cwrite':>9} "
              f"{'cread':>10} {'out':>7} {'turns':>6} {'$':>7}")
        for a in sorted(r['agents'], key=lambda x: -x['cost']):
            u = a['usage']
            print(f"  {a['label'][:28]:<28} {a['phase'][:10]:<10} "
                  f"{a['model'].replace('claude-','')[:8]:<8} "
                  f"{u['input']:>7,} {u['cache_write']:>9,} {u['cache_read']:>10,} "
                  f"{u['output']:>7,} {u['turns']:>6} {a['cost']:>7.2f}")
        print(f"  {'TOTAL':<28} {'':<10} {'':<8} {tot['input']:>7,} {tot['cache_write']:>9,} "
              f"{tot['cache_read']:>10,} {tot['output']:>7,} {tot['turns']:>6} {tcost:>7.2f}")
        raw = tot['input'] + tot['cache_write'] + tot['cache_read'] + tot['output']
        if raw:
            print(f"  raw tokens {raw:,}   "
                  f"cache-write {100*tot['cache_write']/raw:.0f}%  "
                  f"cache-read {100*tot['cache_read']/raw:.0f}%  "
                  f"output {100*tot['output']/raw:.1f}%")
        print()

    raw = grand['input'] + grand['cache_write'] + grand['cache_read'] + grand['output']
    print('=' * 92)
    print(f"  ALL RUNS: {len(runs)} workflows, {gmin:.1f} min wall-clock (sum, not elapsed), "
          f"{raw:,} raw tokens, ${gcost:.2f}")
    print(f"  output tokens {grand['output']:,} ({100*grand['output']/raw:.1f}% of raw) — "
          f"the only part that is actual generated text")
    print('  Dollar figures use list rates and are indicative. Compare arms, not invoices.')
    print('=' * 92)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--session')
    ap.add_argument('--project', default='-Users-james-dev-fortium-ensemble-vnext')
    ap.add_argument('--since', help='ISO8601; only runs at or after this timestamp')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    base = os.path.join(PROJECTS, args.project)
    if args.list:
        for d in sorted(glob.glob(os.path.join(base, '*', 'workflows'))):
            n = len(glob.glob(os.path.join(d, 'wf_*.json')))
            print(f"{os.path.basename(os.path.dirname(d))}  {n} workflow runs")
        return 0

    sessions = [os.path.join(base, args.session)] if args.session else \
               [os.path.dirname(d) for d in glob.glob(os.path.join(base, '*', 'workflows'))]
    runs = []
    for s in sessions:
        runs.extend(collect(s, args.since))
    runs.sort(key=lambda r: r.get('timestamp') or '')

    if args.json:
        print(json.dumps(runs, indent=1))
    else:
        render(runs)
    return 0


if __name__ == '__main__':
    sys.exit(main())
