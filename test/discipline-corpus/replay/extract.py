#!/usr/bin/env python3
"""Turn every lead-session Stop in real transcripts into a replay case.

The offline corpus judged a final message alone. The live judge sees more: the payload
($ARGUMENTS) AND the recent conversation, inlined by the platform. A case here carries
all three, reconstructed from the transcript:

  last_assistant_message  text of the final assistant message before the Stop
  payload                 background_tasks / session_crons / stop_hook_active, rebuilt
                          from launches, completion notifications and wakeup fires
  context                 the recent conversation, rendered, newest last

Also recorded: what the live judge actually did (block / allow-leak / silent allow) and,
for blocks, its reason. Payload reconstruction is approximate -- the transcript does not
store the payload -- and that is stated, not hidden.

Usage: extract.py OUT.jsonl [--since 2026-08-26] [--context-chars 40000]
"""
import glob
import json
import os
import re
import sys

PROJECTS = os.path.expanduser('~/.claude/projects')
ALLOW_SHAPE = re.compile(
    r"\b(do(es)? not (claim|violate|offer|defer|assert)|is not a violation|no (violation|"
    r"deferral claim|async claim)|guard applies only|not running a workflow command|allowing)\b",
    re.I)
BANNER = 'STOP HOOK FIRED'


def text_of(content):
    if isinstance(content, str):
        return content
    out = []
    for c in content or []:
        if c.get('type') == 'text':
            out.append(c.get('text', ''))
    return '\n'.join(out)


def clip(s, n):
    s = s if isinstance(s, str) else json.dumps(s)
    return s if len(s) <= n else s[:n] + f'… [+{len(s) - n} chars]'


def render(r):
    """One transcript record -> zero or more context lines, as the judge might see them."""
    t = r.get('type')
    if t == 'assistant':
        out = []
        for c in r['message'].get('content', []):
            if c.get('type') == 'text' and c.get('text', '').strip():
                out.append('Assistant: ' + c['text'])
            elif c.get('type') == 'tool_use':
                out.append(f"Assistant [tool_use {c['name']}]: " + clip(c.get('input', {}), 400))
        return out
    if t == 'user':
        m = r['message'].get('content')
        if isinstance(m, list):
            out = []
            for c in m:
                if c.get('type') == 'tool_result':
                    out.append('[tool_result]: ' + clip(text_of(c.get('content')) if not isinstance(c.get('content'), str) else c['content'], 400))
                elif c.get('type') == 'text':
                    out.append(('[meta] ' if r.get('isMeta') else 'User: ') + clip(c['text'], 3000))
            return out
        if isinstance(m, str) and m.strip():
            return [('[meta] ' if r.get('isMeta') else 'User: ') + clip(m, 3000)]
    if t == 'attachment':
        a = r.get('attachment') or {}
        if a.get('type') == 'hook_additional_context':
            lines = [c.split('\n', 1)[0] for c in a.get('content', []) if 'ENSEMBLE_COMMAND' in c]
            return ['[hook context] ' + l for l in lines]
        if a.get('type') == 'queued_command' and 'task-notification' in str(a.get('prompt', '')):
            return ['[notification] ' + clip(a['prompt'], 600)]
    if t == 'system' and r.get('subtype') == 'scheduled_task_fire':
        return ['[wakeup fired] ' + clip(r.get('prompt', ''), 300)]
    return []


def classify(entries):
    """hookErrors entries from the discipline judge -> ('block'|'allow-leak', reason)."""
    for e in entries:
        if BANNER not in e:
            continue
        reason = e.split(']: ', 1)[1].strip() if ']: ' in e else ''
        return ('allow-leak' if ALLOW_SHAPE.search(reason) else 'block'), reason
    return None, ''


def judge_ran(summary):
    return any(BANNER in str(h.get('command', '')) for h in summary.get('hookInfos') or [])


def judge_ms(summary):
    for h in summary.get('hookInfos') or []:
        if BANNER in str(h.get('command', '')):
            return h.get('durationMs')
    return None


def extract(path, since, ctx_chars):
    recs = []
    for line in open(path, errors='replace'):
        try:
            recs.append(json.loads(line))
        except ValueError:
            pass
    session = os.path.basename(path)[:-6]
    project = os.path.basename(os.path.dirname(path))

    launches = {}     # task id -> {'id','type','status'}
    tooluse = {}      # tool_use id -> (name, input)
    crons = {}        # tool_use id -> {'prompt','delaySeconds'}
    ctx = []          # rendered lines
    last_msg = ''
    prev_block = False
    cases = []

    for r in recs:
        t = r.get('type')
        if t == 'assistant':
            texts = [c['text'] for c in r['message'].get('content', []) if c.get('type') == 'text']
            if texts:
                last_msg = '\n'.join(texts)
            for c in r['message'].get('content', []):
                if c.get('type') == 'tool_use':
                    tooluse[c['id']] = (c['name'], c.get('input', {}))
                    if c['name'] == 'ScheduleWakeup':
                        crons[c['id']] = {'prompt': clip(c['input'].get('prompt', ''), 200),
                                          'delaySeconds': c['input'].get('delaySeconds')}
        if t == 'user':
            m = r['message'].get('content')
            tur = r.get('toolUseResult') or {}
            if isinstance(tur, dict) and tur.get('status') == 'async_launched':
                tid = tur.get('taskId') or tur.get('agentId')
                if tid:
                    launches[tid] = {'id': tid,
                                     'type': 'workflow' if tur.get('taskType') == 'local_workflow' else 'agent',
                                     'status': 'running'}
            body = m if isinstance(m, str) else text_of(m)
            if not r.get('isMeta') and isinstance(m, str) and '<task-notification>' not in m:
                prev_block = False      # a real user prompt resets the loop guard
            for tid, st in re.findall(r'<task-id>([^<]+)</task-id>.*?<status>([^<]+)</status>', body, re.S):
                if tid in launches:
                    launches[tid]['status'] = st
        if t == 'attachment':
            a = r.get('attachment') or {}
            p = str(a.get('prompt', ''))
            for tid, st in re.findall(r'<task-id>([^<]+)</task-id>.*?<status>([^<]+)</status>', p, re.S):
                if tid in launches:
                    launches[tid]['status'] = st
        if t == 'system' and r.get('subtype') == 'scheduled_task_fire':
            # the oldest pending wakeup is the one that fired
            if crons:
                crons.pop(next(iter(crons)))

        if t == 'system' and r.get('subtype') == 'stop_hook_summary':
            ts = r.get('timestamp', '')
            if ts[:10] >= since and judge_ran(r) and last_msg.strip():
                verdict, reason = classify(r.get('hookErrors') or [])
                text = '\n'.join(ctx)
                cases.append({
                    'id': f'{session[:8]}-{len(cases):03d}',
                    'project': project, 'session': session, 'timestamp': ts,
                    'live_verdict': verdict or 'allow',
                    'live_reason': reason,
                    'live_judge_ms': judge_ms(r),
                    'last_assistant_message': last_msg,
                    'payload': {
                        'session_id': session,
                        'hook_event_name': 'Stop',
                        'stop_hook_active': prev_block,
                        'last_assistant_message': last_msg,
                        'background_tasks': list(dict((k, dict(v)) for k, v in launches.items()).values()),
                        'session_crons': [dict(v, id=k[-8:]) for k, v in crons.items()],
                    },
                    'context': text[-ctx_chars:],
                })
                prev_block = verdict == 'block'
            elif judge_ran(r):
                verdict, _ = classify(r.get('hookErrors') or [])
                prev_block = verdict == 'block'
            continue
        ctx.extend(render(r))
    return cases


def main():
    out = sys.argv[1]
    since = sys.argv[sys.argv.index('--since') + 1] if '--since' in sys.argv else '2026-08-26'
    n = int(sys.argv[sys.argv.index('--context-chars') + 1]) if '--context-chars' in sys.argv else 40000
    total = 0
    with open(out, 'w') as fh:
        for path in sorted(glob.glob(os.path.join(PROJECTS, '*', '*.jsonl'))):
            if '-private-tmp' in path:
                continue
            for c in extract(path, since, n):
                fh.write(json.dumps(c) + '\n')
                total += 1
    print(f'{total} cases -> {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
