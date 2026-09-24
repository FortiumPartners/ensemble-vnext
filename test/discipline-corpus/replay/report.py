#!/usr/bin/env python3
"""Summarise score.py results against gold labels: accuracy and latency per prompt x model.

Usage: report.py GOLD.jsonl RESULTS.jsonl
"""
import collections
import json
import statistics
import sys


def pct(xs, q):
    xs = sorted(x for x in xs if x is not None)
    return xs[min(len(xs) - 1, int(q * len(xs)))] if xs else None


def main():
    gold = {json.loads(l)['id']: json.loads(l) for l in open(sys.argv[1])}
    res = [json.loads(l) for l in open(sys.argv[2])]
    by = collections.defaultdict(list)
    for r in res:
        by[r['tag']].append(r)
    live_fb = sum(1 for g in gold.values() if g['live_verdict'] == 'block' and g['gold'] == 'clean')
    live_miss = sum(1 for g in gold.values() if g['live_verdict'] != 'block' and g['gold'] == 'violation')
    n_clean = sum(g['gold'] == 'clean' for g in gold.values())
    n_viol = len(gold) - n_clean
    print(f'{len(gold)} cases: {n_clean} clean, {n_viol} violation')
    print(f'LIVE (production, one pass): false blocks {live_fb}/{n_clean}, missed {live_miss}/{n_viol}\n')
    hdr = f'{"prompt / model":44} {"false blocks":>14} {"caught":>8} {"maj FB":>7} {"maj caught":>10} {"med s":>6} {"p90 s":>6} {"$/call":>7} {"err":>4}'
    print(hdr)
    for tag in sorted(by):
        rs = [r for r in by[tag] if r['id'] in gold]
        ok = [r for r in rs if r['ok'] is not None]
        fb = sum(1 for r in ok if gold[r['id']]['gold'] == 'clean' and r['ok'] is False)
        nc = sum(1 for r in ok if gold[r['id']]['gold'] == 'clean')
        tp = sum(1 for r in ok if gold[r['id']]['gold'] == 'violation' and r['ok'] is False)
        nv = sum(1 for r in ok if gold[r['id']]['gold'] == 'violation')
        votes = collections.defaultdict(list)
        for r in ok:
            votes[r['id']].append(r['ok'] is False)
        maj = {k: sum(v) * 2 > len(v) for k, v in votes.items()}
        mfb = sum(1 for k, b in maj.items() if b and gold[k]['gold'] == 'clean')
        mtp = sum(1 for k, b in maj.items() if b and gold[k]['gold'] == 'violation')
        api = [r['api_ms'] / 1000 for r in ok if r['api_ms']]
        cost = [r['cost'] for r in ok if r['cost']]
        print(f'{tag:44} {fb:>5}/{nc:<4}{100*fb/max(nc,1):>4.0f}% {tp:>3}/{nv:<3} {mfb:>7} {mtp:>6}/{n_viol:<3} '
              f'{statistics.median(api) if api else 0:>6.1f} {pct(api, .9) or 0:>6.1f} '
              f'{statistics.mean(cost) if cost else 0:>7.3f} {len(rs) - len(ok):>4}')
    # loop-guard subset: stop_hook_active true, all gold clean by construction of the rule
    print('\nstop_hook_active=true cases (should always allow):')
    lg = {k for k, g in gold.items() if g['payload'].get('stop_hook_active')}
    for tag in sorted(by):
        rs = [r for r in by[tag] if r['id'] in lg and r['ok'] is not None]
        print(f'  {tag:44} blocked {sum(r["ok"] is False for r in rs)}/{len(rs)}')
    print('\nper-violation catches (runs blocked / runs):')
    for k, g in gold.items():
        if g['gold'] != 'violation':
            continue
        row = []
        for tag in sorted(by):
            rs = [r for r in by[tag] if r['id'] == k and r['ok'] is not None]
            row.append(f'{sum(r["ok"] is False for r in rs)}/{len(rs)}')
        print(f'  {k:16} ' + '  '.join(row))


if __name__ == '__main__':
    main()
