---
title: The hook bankai installs in a harness and the spool it writes
tags: [activity, store]
updated_at: 2026-07-30
created_at: 2026-07-27
---

## The script is generated, never shipped

`installHookSource` in `src/main/activity/HookSource.ts` writes `<DATA_DIR>/hooks/bankai-trace.sh` and points the harness's `settings.json` at that path. It is generated because bankai's own binary path is not stable — an AppImage mounts somewhere new every run and an AUR upgrade replaces the file — and the hook has to keep working while bankai is closed or mid-upgrade. It writes to a file; nobody has to be listening.

Every install rewrites the script, so one that was deleted or edited is repaired on the next startup.

## The script may not think, only append

A hook runs inside the tool's critical path and hooks run serially, so anything slow here is slow for the user's agent (see `harness-hook-trace-source.md` for the measurements). The script therefore parses nothing: it appends the payload it received, prefixed with the moment it ran, and exits 0 on every path. Measured at 2.5ms per invocation against a budget of 2.8ms — the plain-shell number. `jq` would double it and Node would multiply it by seven.

The session id is cut out of the raw payload with parameter expansion alone — strip up to `session_id`, then to the `:`, then to the opening quote — and accepted only when what comes out is 36 characters of hex and dashes. A payload that fails the guard is dropped rather than written to a junk file. `session_id` is the first key Claude Code writes, so the first match is the real one.

Three failure paths matter and all are silent: no spool directory, an unwritable one, and a payload with no session. `2>/dev/null` is placed **before** the append redirection so the shell's own "cannot create" message is already discarded when the redirection fails. A pre-tool hook that exits non-zero denies the tool call, so the script's last line is always `exit 0`.

## Records are separated by NUL, not by newline

`<DATA_DIR>/hooks/spool/<harness>-<session_id>.spool` holds `<epoch millis> <payload>\0` per event. One flat directory serves every harness, so the harness id is part of the file name: two harnesses that happen to hold the same native session id would otherwise address the same file. Every reader and every cleanup path keys on that same `<harness>-<session_id>` string, never on the session id alone. The separator is NUL because bankai never has to assume the harness emits compact single-line JSON — an embedded newline cannot split a record. Reading takes the last 16KB and scans backwards, so the fragment at the head of the window and a half-written record at its tail both fail to parse and are skipped.

The stamp is the point of the whole file: it is the moment the event happened, which is what the elapsed counter must count from. The moment bankai read the line says nothing.

## Bankai's entries are recognised by the script's name

`installedSettings` in `src/main/activity/hookSettings.ts` merges into `hooks.<Event>[]` by dropping every group holding a command that contains `bankai-trace.sh` and then appending exactly one group per event, so installing twice leaves one entry and the user's own hooks are never rewritten. Uninstalling performs only the drop, and removes the `hooks` block when nothing else is left in it.

The five events are `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop` and `Notification`. Only the tool events carry `matcher: "*"`; the other three ignore a matcher entirely.

The file written is `<CLAUDE_CONFIG_DIR>/settings.json`, the same directory session discovery reads. It is rewritten only when the merge actually changes it, and a `settings.json` that does not parse aborts the install rather than being replaced — that file is the user's, and bankai is the only thing here that writes into the harness's own configuration.

Nothing is printed to stdout. On `UserPromptSubmit` the harness feeds a hook's stdout to the model as context, so a debug line there would end up in the user's conversation.

## The naming helper's own hook events are dropped at the script

Bankai's session namer runs the harness itself, and a harness that fires hooks would spool its own naming call as if it were the user's session. The script's first line exits 0 when `BANKAI_NAMING` is set, and the namer sets that variable in the child's environment. The guard sits in the script rather than in the reader because a record that was never written costs nothing to filter.

## One toggle per harness decides it, and it is on by default

`harness.profiles.<id>.liveTrace` — `DEFAULT_LIVE_TRACE` in `src/shared/activity.ts` — is applied by `applyLiveTrace` on startup and on every save of the harness panel. Off uninstalls that harness's hook, on reinstalls it. Each harness answers for itself: turning Codex's trace off leaves Claude's installed.

That single function carries the platform guard, and it has to: activity tracking is Linux-only, so anywhere else the install would write a `#!/bin/sh` script into the user's own `settings.json` — costing every tool call a shell — to feed a spool nothing will ever read. Both callers go through it for that reason, not for tidiness.

Off is not "fall back to the transcript". It means the card says only **Working** and **Done**, so `AgentActivity` stops calling the harness's `read` altogether, stops scanning PTY output for the compaction notice, and drops any compaction it was holding. A transcript-fed label is seconds stale and names a block that already finished; offering that as the quiet mode would be offering a worse version of the same feature rather than turning the feature off. The reason a shell was handed back to the user still shows — "Needs permission" is a state to act on, not a trace.

"Working" is written by the renderer, not the main process: `sessionTrace` in `src/renderer/src/routes/-utils/session-rows.ts` names the state whenever the shell is working and nothing was observed, the mirror of what it already did for "Done". So a gap in the live source shows the same word as the toggle being off, instead of falling through to the branch name.

## Spool files are bankai's to clean up, never the script's

The tick prunes at most every five minutes: a file whose session is no longer in the registry is removed, and a live one past `SPOOL_MAX_BYTES` is truncated to zero — appends continue at the new end and the card falls back to the transcript for one event. Pruning is skipped entirely when discovery returned no session at all, so a failed registry read never wipes the spool of a running agent.
