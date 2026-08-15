# Feature request: coordinated multi-platform publish

Today a draft is published to one platform at a time. I want to publish the same piece to
several platforms as one action — LinkedIn, X, Reddit — and have the result be
comprehensible when it doesn't fully succeed.

The failure that motivates this: I publish to three platforms, two succeed, one fails on a
rate limit. Right now I have no single place that tells me what the state of that piece is,
and retrying is a manual decision per platform with no memory of what already went out.

## Requirements

1. It MUST treat a multi-platform publish as one addressable thing with its own state, not
   three unrelated publish attempts.
2. It MUST never double-post to a platform that already succeeded, no matter how many times
   a retry is triggered.
3. It MUST make partial success visible in the dashboard — which platforms are done, which
   failed, and why — without the operator having to read logs.
4. It MUST respect each platform's own rate limiting independently, so one throttled
   platform does not block or delay the others.
5. It MUST survive the process restarting mid-publish: a coordinated publish interrupted
   halfway is resumable and does not lose what already succeeded.

## Not doing

- Adding a new platform. Work with the publishers that already exist.
- Changing how content is generated or edited. This is about delivery only.

## The hard part

Requirement 2 and requirement 5 together are the difficulty, and I don't have an answer.
Surviving a restart means the state has to be durable, but durability and "exactly once"
are not the same thing — a publish that succeeded remotely but crashed before recording
locally looks identical to one that never went out. I don't know how you tell those apart
for these platforms, or what the honest fallback is when you can't.

## Context

Herald, at `/Users/james/dev/herald`. Its governance files are in `.claude/rules/`, and it
has an existing corpus in `docs/PRD/` and `docs/TRD/` — including prior design work on
publishers, rate limiting, queueing and automation. Use what is already decided.
