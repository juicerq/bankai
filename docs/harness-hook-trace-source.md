---
title: What a Claude Code hook adds as a trace source, measured against the transcript
tags: [activity]
updated_at: 2026-07-27
created_at: 2026-07-27
---

## A hook fires with the record, not before it

Measured with a headless `claude -p` run against four tool calls, stamping every hook and polling the transcript every 50ms: `PreToolUse` fires **5–8ms after** the `tool_use` record's own timestamp. `UserPromptSubmit` lands 20ms after the prompt record, `Stop` 23ms after the last assistant record.

So a hook is the same event on another channel. It does **not** see the model composing the block — the gap between one record and the next (0.43s to 3.9s in that run, p50 8.7s for a large `Write`) stays exactly as wide. Nothing a hook offers shrinks the window in which the card says "Thinking" while the model writes the next tool call. That window is not lag: the model is generating tokens and no tool is running, so "Thinking" is the honest label for it.

## What it does buy is the path to the screen

The record's timestamp is not when bankai can read it. In the same run, records were written at +6.10s, +6.58s and +7.03s and none became readable before **+7.16s**, when six landed at once. On a live interactive session the delay measured 0.2s to 3.6s. `ACTIVITY_POLL_MS` adds up to 1.5s more.

The consequence is not a late label but a missing one. In that turn the agent ran a command, read two files and ran `ls`; polling the transcript showed one of the four, and the card sat on "Thinking" from +4.5s to +10.5s while three tools came and went. A hook pushes each one at the instant it happens, so all four exist on screen.

## The hook's resolution is too high to render raw

Those tools completed 10–30ms after they started. A card that also listens to the completion event and reverts to "Thinking" paints labels that live for ten milliseconds. The start event must set the label and nothing may clear it until the next event — which is what reading the transcript already does by accident. Even then, two of the four labels lasted under half a second, so a trace fed by hooks needs a minimum time on screen before it gives way.

## A hook runs inside the tool's critical path, and hooks run serially

Measured with a hook that sleeps 2s: every tool call gained 2s, and a parallel batch of two tools was serialized — the second hook started only after the first returned. So whatever gets installed is in the way of the user's agent, not beside it. It must never wait on anything (no socket, no lock, no network, no process that can hang) and must exit 0 on every path, since a non-zero exit from a pre-tool hook can deny the call.

Startup cost per invocation, 10 runs each: a plain shell script 2.8ms, the same with `jq` 6.8ms, Bun 8.0ms, Node 19.8ms. The shell number is the budget; parsing the payload belongs in bankai, after the fact.

The payload carries `session_id`, `cwd`, `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id`, `transcript_path` and `permission_mode`. `tool_input` has the same shape as a transcript `tool_use` block's `input`, so `toolTrace` applies to it unchanged. There is no event for "the model started thinking" — the events are `UserPromptSubmit`, `PreToolUse`, `PostToolUse` and `Stop`, so "Thinking" stays an interval between events, inferred live instead of from the log.

## The cost is that bankai starts writing to the harness's config

Everything bankai reads today is a file Claude Code already writes on its own. A hook has to be installed — globally or per project — pointing at an executable of bankai's. That is the first write into the harness's own configuration, and an uninstalled bankai leaves the hook behind. The transcript has to stay as the fallback for any session with no hook installed.
