---
name: building-tool-orchestration
description: Provider-agnostic patterns for tool/function calling — agent loops, parallel tools, dynamic selection, failure recovery, structured outputs, guardrails.
when_to_use: >
  Reach for this when designing how an LLM invokes tools/functions — the agent loop, parallel
  vs sequential calls, dynamic tool selection across large tool sets, failure recovery and
  fallbacks, structured outputs vs tool-call hybrid, and observability hooks. For provider-
  specific tool-calling *wire shape and parameters* defer to the provider skill
  (using-anthropic-platform / using-openai-platform) — they own those Stay-current rules. For
  *graph-based* orchestration (state machines, branching, human-in-the-loop) use
  building-langgraph-agents; for retrieval tools see building-rag-pipelines; for
  memory-as-tools see building-agent-memory; for tracing tool invocations use using-langfuse.
  **ALWAYS WebFetch the relevant provider's tool-use docs BEFORE writing tool definitions or
  parsing tool-call responses — the request/response shapes (Anthropic Tool Use, OpenAI
  Function Calling / Responses, parallel call semantics, strict mode) change between releases
  faster than any training snapshot.**
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Building Tool Orchestration — Quick Reference

How LLM-driven agents use tools well: the loop, parallelism, dynamic selection, recovery, and
guardrails. This skill is provider-agnostic; for the exact JSON shape of `tool_use` blocks or
`function_call` deltas, defer to the provider skill.

---

## Stay current — DO NOT rely on training-data knowledge of tool-calling shapes or behaviors

Tool-calling APIs change faster than almost anything else in LLM platforms: Anthropic added/
revised parallel tool use, fine-grained streaming, and tool choice modes; OpenAI moved from
Chat Completions function calling → Assistants → Responses API with different tool envelopes,
strict mode, and built-in tools (web search, file search, code interpreter). **Before** you
(a) write a tool schema, (b) parse a tool-call response, (c) claim parallel/serial behavior,
(d) use strict / forced tool choice, or (e) use a provider-built-in tool, you **MUST** WebFetch
the live provider docs and cite them:

- **Anthropic Tool Use:** https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview
- **Anthropic Tool Use — parallel & streaming:**
  https://docs.claude.com/en/docs/agents-and-tools/tool-use/implement-tool-use
- **OpenAI Function Calling (Chat Completions):**
  https://platform.openai.com/docs/guides/function-calling
- **OpenAI Responses API (tools, built-ins):**
  https://platform.openai.com/docs/guides/responses
- **OpenAI structured outputs / strict mode:**
  https://platform.openai.com/docs/guides/structured-outputs

For *each* provider you target, the provider skill owns the wire-level Stay-current; this
skill defers to it for shape and inherits its currency rules. Cite source URL + fetch date for
every claim about a provider's tool-calling behavior.

---

## When to Use

Load this skill when:
- Building an agent that calls more than one tool
- Designing dynamic tool selection over a large tool registry (10+ tools)
- Diagnosing brittle tool-calling behavior (wrong tool, bad args, infinite loops)
- Adding parallel tool calls or streaming tool outputs
- Wiring tool observability (latency, success rate, cost per call)

---

## The Agent Loop (provider-agnostic)

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Send: system + messages + tool definitions → model        │
│ 2. Model returns: text  AND/OR  one+ tool_use blocks         │
│ 3. If no tool_use → done                                     │
│ 4. Execute each tool call (in parallel where safe)           │
│ 5. Append assistant message (with tool_use) + tool_results   │
│ 6. Loop back to step 1                                       │
│ 7. Bound by max_iterations to prevent runaway                │
└──────────────────────────────────────────────────────────────┘
```

```python
def agent_loop(messages, tools, executor, max_iterations=10):
    for i in range(max_iterations):
        response = llm.complete(messages=messages, tools=tools)
        if not response.tool_calls:
            return response.text
        results = executor.run_parallel(response.tool_calls)   # safe-to-parallel only
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": results})
    raise RuntimeError(f"Exceeded max_iterations={max_iterations}")
```

**Always bound iterations.** Even good models can loop.

---

## Tool Definition Quality

Tool selection accuracy is **dominated by tool description quality**. Treat descriptions as
prompts, not documentation.

```python
tool = {
    "name": "search_orders",
    # Description: what it does, when to use, when NOT to use, what it returns.
    "description": (
        "Search a customer's order history by date range and/or status. "
        "Use when the user asks about past purchases, refunds, or shipping. "
        "Do NOT use for product catalog questions — use `search_catalog` for that. "
        "Returns up to 50 orders sorted by date desc."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "customer_id": {"type": "string", "description": "Internal customer UUID"},
            "status": {
                "type": "string",
                "enum": ["pending", "shipped", "delivered", "returned"],
                "description": "Filter by order status",
            },
            "since": {
                "type": "string",
                "format": "date",
                "description": "ISO date; orders on or after this date",
            },
        },
        "required": ["customer_id"],
    },
}
```

Rules:
- **Distinct purposes.** Two tools should never both reasonably apply to the same intent.
- **Enums over free strings** when the value space is bounded.
- **Tight required set.** Optional args should genuinely be optional.
- **Mention sibling tools** in the description ("for X, use `other_tool`").

---

## Parallel Tool Calls

When the model returns multiple tool calls in one turn, execute them concurrently — *if* they
are side-effect-free or commutative.

```python
import asyncio

async def execute_parallel(calls):
    safe = [c for c in calls if TOOL_REGISTRY[c.name].safe_parallel]
    serial = [c for c in calls if not TOOL_REGISTRY[c.name].safe_parallel]

    safe_results = await asyncio.gather(*(execute(c) for c in safe))
    serial_results = []
    for c in serial:
        serial_results.append(await execute(c))
    return [*safe_results, *serial_results]
```

Mark tools `safe_parallel=False` when they mutate shared state, hold locks, or depend on each
other's results. Many providers expose a `disable_parallel_tool_use` flag — verify per provider.

---

## Dynamic Tool Selection (large tool sets)

Past ~20 tools, in-context tool definitions degrade accuracy and inflate cost. Strategies:

### 1. Tool retrieval (RAG over tools)

Embed tool name + description; at query time retrieve top-k tools and pass only those.

```python
def select_tools(user_query: str, k: int = 8) -> list[dict]:
    qvec = embed(user_query)
    hits = tool_index.search(qvec, top_k=k)
    return [TOOL_REGISTRY[h.id].schema for h in hits]
```

### 2. Two-stage routing

A cheap model picks the *category* / *namespace*; the main model gets only that namespace's
tools.

### 3. Hierarchical tools

Expose one `dispatch(namespace, action, args)` tool to the model; resolve internally to the
right concrete tool. Reduces tool-list size dramatically at the cost of one schema layer.

### 4. Tool reduction over the loop

After the first turn, drop tools the model demonstrably won't need. Reset on user turn.

---

## Failure Recovery

| Failure mode | Detection | Recovery |
|--------------|-----------|----------|
| Tool raises exception | try/except in executor | Return `{error: "..."}` as tool_result; let model react |
| Tool times out | per-tool timeout wrapper | Same — surface as error result |
| Wrong tool chosen | post-hoc heuristic / eval | Improve descriptions; add negative examples |
| Bad arguments (validation fail) | JSONSchema validation pre-call | Return validation error to model with hint |
| Model loops on same failure | iteration counter + repetition check | Break loop; escalate / fallback model |
| Tool returns huge payload | size cap in executor | Truncate + tell the model it was truncated |

```python
def safe_execute(call, timeout_s=10):
    try:
        validate(call.args, TOOL_REGISTRY[call.name].input_schema)
    except ValidationError as e:
        return {"error": "invalid_args", "detail": str(e)}
    try:
        result = with_timeout(TOOL_REGISTRY[call.name].fn, call.args, timeout_s)
    except TimeoutError:
        return {"error": "timeout", "tool": call.name}
    except Exception as e:
        return {"error": "tool_exception", "detail": str(e)[:500]}
    return truncate(result, max_chars=8000)
```

---

## Structured Outputs vs Tool Calls

| Use case | Pick |
|----------|------|
| "Get me an answer in JSON shape X" | **Structured output / strict mode** |
| "Take an action with side effects" | **Tool call** |
| "Choose one of N actions" | **Tool call** (tool choice = required) |
| "Extract typed data from text" | **Structured output** |

Don't shoehorn data extraction into a fake tool — most providers support structured outputs
natively now (JSON schema / strict mode). Verify via provider docs.

---

## Guardrails

- **Allow-list tools per user/role.** Don't pass admin tools to a customer-facing agent.
- **Input sanitization on tool args.** Treat them as untrusted; SQL injection / SSRF apply.
- **Output redaction.** Strip secrets from tool results before sending back to the model.
- **Rate limit per tool.** A model that loops on a paid API can run up a bill fast.
- **Human-in-the-loop for destructive actions.** `delete_*`, `transfer_funds`, `send_email`
  should require explicit confirmation — surface as proposed action, not auto-execute.
- **Sandbox code execution.** If exposing a Python/JS exec tool, run in a sandbox (e.g. gVisor,
  Firecracker, or a managed service). Never `exec()` model output in your process.

---

## Observability

Per tool call, log: tool name, input args (redacted), output size, latency, exit (ok/error/
timeout), cost (if external API), model call id. Pipe to `using-langfuse` (or your tracer).
Build dashboards on: success rate per tool, p95 latency per tool, tool-choice frequency,
loop length distribution. These metrics drive the next round of description tuning.

---

## TypeScript Example (provider-agnostic loop)

```typescript
interface ToolCall { id: string; name: string; args: Record<string, unknown>; }
interface ToolResult { tool_call_id: string; content: string; error?: string; }

async function agentLoop(
  messages: Message[],
  tools: ToolSpec[],
  exec: (c: ToolCall) => Promise<ToolResult>,
  maxIterations = 10,
): Promise<string> {
  for (let i = 0; i < maxIterations; i++) {
    const res = await llm.complete({ messages, tools });
    if (!res.toolCalls?.length) return res.text;
    const results = await Promise.all(res.toolCalls.map(exec));
    messages.push({ role: 'assistant', content: res.content });
    messages.push({ role: 'user', content: results });
  }
  throw new Error(`Exceeded max_iterations=${maxIterations}`);
}
```

---

## Common Patterns

- **Forced tool choice** for the first turn when intent is unambiguous (`tool_choice = required`).
- **Stop sequences** + tool definitions reduce stray prose mid-tool-call.
- **Tool result summarization** for verbose APIs — wrap with a summarizer before returning.
- **Idempotency keys** on tools that hit external APIs — survive model retries.
- **Tool "manifests" per persona** — different agents see different subsets of the registry.

---

## Anti-Patterns

- **Vague tool descriptions** ("does stuff with orders"). Tool choice will be poor.
- **Overlapping tools.** `get_user`, `fetch_user`, `lookup_user` — pick one.
- **Unbounded loops.** No `max_iterations` = production incident.
- **Raw exception strings to the model.** Strip stack traces / internal paths.
- **Auto-executing destructive tools.** Always confirm or escrow.
- **Re-sending the entire tool registry every turn** when only 2 of 50 are relevant.
- **Mixing structured output and tool use for the same job.** Pick one per turn.

---

## See Also

- `using-anthropic-platform` — Anthropic Tool Use wire shape + Stay-current.
- `using-openai-platform` — OpenAI Function Calling / Responses API wire shape + Stay-current.
- `building-langgraph-agents` — graph-based alternative when control flow is more than a loop.
- `building-rag-pipelines` — retrieval surfaces as a tool the model can call.
- `building-agent-memory` — memory save/recall exposed as tools.
- `using-langfuse` — trace every tool call, score them, A/B descriptions.
