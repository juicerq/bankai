---
title: Where a subagent writes its transcript, and how it is linked to the call that spawned it
tags: [activity]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## The files sit under the parent session, one sidecar per agent

`~/.claude/projects/<slug>/<sessionId>/subagents/agent-a<name>-<hash>.jsonl`, beside a `agent-a<name>-<hash>.meta.json` of the same stem. The records inside are ordinary transcript records — the same parser reads them — plus `agentId` and `isSidechain: true` on every one.

## The link back to the parent call is in the sidecar, and it is not always the same field

Of the 746 sidecars on this machine, 379 carry `toolUseId` and 373 carry `name`; the two sets barely overlap, so **neither field can be assumed present**. Resolution therefore goes in two steps: match `meta.toolUseId` against the `tool_use` id first, and fall back to matching `meta.name`/`meta.description` against the `Agent` call's own input, accepting the fallback only when exactly one sidecar matches.

Nothing in the parent transcript closes this gap: it never mentions the `agentId`, and the Agent tool's result is only `{status: "teammate_spawned", prompt: …}`. A tool row can therefore be *offered* as openable from the tool name alone, but whether a transcript exists behind it is only known after the sidecar scan — so the screen behind the row has to be honest when it resolves to nothing.
