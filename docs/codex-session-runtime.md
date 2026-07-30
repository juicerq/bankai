---
title: How a live Codex TUI exposes its root session and turn edges
tags: [activity, terminal]
updated_at: 2026-07-30
created_at: 2026-07-29
---

## The native process owns every rollout in its agent tree

Codex 0.146.0 launches a Node wrapper and a native `codex` child. The native process keeps its active rollout open under `~/.codex/sessions/YYYY/MM/DD/`, so `/proc/<pid>/fd` ties a live process to its session without scanning the whole history directory.

One native process can hold several rollout files at once. A live sample held one root and three subagent rollouts simultaneously, so selecting the first open JSONL can bind the Shell to a subagent.

The first record of every observed rollout was `session_meta`. The root carried `source: "cli"` and `parent_thread_id: null`; each subagent carried its root in `parent_thread_id` plus `source.subagent.thread_spawn`, `agent_path`, and `agent_nickname`. Discovery has to validate every candidate's first record and select the root explicitly.

## Turn edges are events, not process edges

The root rollout emits `event_msg` records. In the observed version, `task_started` opens a turn and carries its `turn_id` and start time. `task_complete` closes it with start, completion, and duration fields; `turn_aborted` also closes it. The native process stays alive between turns, so process presence alone cannot distinguish Working from idle.

A resumed session replays its whole history into the new rollout, and every replayed record carries the wall clock of the replay, not of the original turn. Only the `started_at` and `completed_at` fields inside a payload date a turn; the record's own timestamp dates the read. A card that trusted the record timestamp would show a finished turn as if it had just started.

Tool activity and subagent activity appear in the same stream, but the rollout format is external and unversioned. Every record has to be validated at the harness boundary. An unknown or malformed event costs that event's detail, never the Shell, Continuity, or the activity loop.

## Naming needs one narrow message source, not a conversation parser

Observed root rollouts publish each submitted prompt as `event_msg` with `payload.type: "user_message"` and the text in `payload.message`. That is enough to build the bounded naming sample at a milestone. It does not justify feeding `response_item`, tool output, reasoning, or the whole rollout into Claude's conversation parser, and it does not establish a stable Mobile conversation contract.

## Interactive sessions are one Codex mode

`codex` starts a local interactive session and `codex resume <UUID>` resumes one. Every other subcommand — including `exec`, `review`, `fork`, cloud, app-server, session-management commands, and code-mode helpers — is a different process role and is not an interactive Agent session. A TUI connected through `--remote` is outside the measured local-session contract.

`codex exec --ephemeral` is useful for a bounded helper call because it writes no session files. Measured directly: the sessions directory held 314 rollouts before such a call and 314 after it. It remains a headless shell process, never a Session ref or an Agent presence — `interactiveCommandLine` rejects its argv on the subcommand alone.

`codex exec` reads its prompt from stdin whenever stdin stays open, even when the prompt is already an argument. A helper that spawns it must close the child's stdin or the call never returns.
