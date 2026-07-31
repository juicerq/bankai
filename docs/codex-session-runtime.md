---
title: How a live Codex TUI exposes its root session and turn edges
tags: [activity, terminal]
updated_at: 2026-07-31
created_at: 2026-07-29
---

## The native process owns every rollout in its agent tree

Codex 0.146.0 launches a Node wrapper and a native `codex` child. The native process keeps its active rollout open under `~/.codex/sessions/YYYY/MM/DD/`, so `/proc/<pid>/fd` ties a live process to its session without scanning the whole history directory.

One native process can hold several rollout files at once. A live sample held one root and three subagent rollouts simultaneously, so selecting the first open JSONL can bind the Shell to a subagent.

The first record of every observed rollout was `session_meta`. The root carried `source: "cli"` and `parent_thread_id: null`; each subagent carried its root in `parent_thread_id` plus `source.subagent.thread_spawn`, `agent_path`, and `agent_nickname`. Discovery has to validate every candidate's first record and select the root explicitly.

## The rollout is born with the first turn, not with the TUI

A TUI sitting at its prompt has written nothing. Measured on 0.146.0: a `codex` started at 09:06:42 still held no rollout, no descriptor and no session file four minutes later. Two live sessions started at 07:19:59 and 08:18:56 wrote their first byte at 07:33:50 and 08:20:40 — the same millisecond as their first `task_started`.

The file name lies about this. `rollout-2026-07-31T07-20-00-<uuid>.jsonl` stamps the moment the session *opened*; the file itself appeared fourteen minutes later. Only the `timestamp` inside the `session_meta` record dates the file.

So a Codex session id cannot be discovered before the user's first prompt — it lives in memory until then. `codexPresence` still reports the process as an idle Agent using `/proc/<pid>/cwd`, with no `sessionId`. `captureSessionRefs` skips a presence with no session id, so nothing resumable is persisted until the rollout exists. Claude differs here: it writes its registry file at startup, so its card carries a session id from the first tick.

That is why the sidebar's harness mark reads `harnessByShellId` from the activity snapshot and falls back to the persisted ref, never the reverse. The ref answers "what can I resume"; the snapshot answers "what is running now", and only the second one knows about a Codex that has not written anything yet.

## Turn edges are events, not process edges

The root rollout emits `event_msg` records. In the observed version, `task_started` opens a turn and carries its `turn_id` and start time. `task_complete` closes it with start, completion, and duration fields; `turn_aborted` also closes it. The native process stays alive between turns, so process presence alone cannot distinguish Working from idle.

A resumed session replays its whole history into the new rollout, and every replayed record carries the wall clock of the replay, not of the original turn. Only the `started_at` and `completed_at` fields inside a payload date a turn; the record's own timestamp dates the read. A card that trusted the record timestamp would show a finished turn as if it had just started.

Tool activity and subagent activity appear in the same stream, but the rollout format is external and unversioned. Every record has to be validated at the harness boundary. An unknown or malformed event costs that event's detail, never the Shell, Continuity, or the activity loop.

## Naming and Mobile read different validated slices

Observed root rollouts publish each submitted prompt as `event_msg` with `payload.type: "user_message"` and the text in `payload.message`. That is enough to build the bounded naming sample at a milestone. That observation alone does not justify feeding `response_item`, tool output, reasoning, or the whole rollout into Claude's conversation parser.

Mobile has its own Codex parser at the harness boundary. It reads prompts from `event_msg.user_message`, assistant text from assistant `response_item.message` records, and tool state from matching function/custom call and output records. Developer and user response items are ignored so replayed context does not become visible conversation. Reasoning without a readable summary is ignored instead of exposing encrypted or opaque data.

## Interactive sessions are one Codex mode

`codex` starts a local interactive session and `codex resume <UUID>` resumes one. Every other subcommand — including `exec`, `review`, `fork`, cloud, app-server, session-management commands, and code-mode helpers — is a different process role and is not an interactive Agent session. A TUI connected through `--remote` is outside the measured local-session contract.

`codex exec --ephemeral` is useful for a bounded helper call because it writes no session files. Measured directly: the sessions directory held 314 rollouts before such a call and 314 after it. It remains a headless shell process, never a Session ref or an Agent presence — `interactiveCommandLine` rejects its argv on the subcommand alone.

`codex exec` reads its prompt from stdin whenever stdin stays open, even when the prompt is already an argument. A helper that spawns it must close the child's stdin or the call never returns.
