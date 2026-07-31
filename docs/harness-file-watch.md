---
title: How a card reacts to a turn edge sooner than the activity poll
tags: [activity]
updated_at: 2026-07-31
created_at: 2026-07-31
---

## The mechanism

`AgentActivity` runs a full pass every `ACTIVITY_POLL_MS`. On its own that puts up to 1500ms between a harness writing a turn edge and the card moving between Working, Done and needs-attention.

A harness can shorten that by declaring the paths whose writes matter to it:

```ts
watch?: () => string[];
```

Every full pass calls `harnessWatchPaths()` and reconciles the open watchers against it. A write on any watched path runs an *event* pass, throttled at `EVENT_PASS_MS`: the first write acts at once and the rest of the burst coalesce into one trailing pass.

An event pass reuses the worktree map already held, so a cold Git call can never delay a Done. It is a shortcut, never a source: every state still comes from `discover()`.

## What each harness declares

- **Claude Code** declares `<CLAUDE_CONFIG_DIR>/sessions`, the registry directory it also discovers from. Claude rewrites the session file on every card-level status edge, so one directory watcher covers every live session.
- **Codex** declares the root rollout of each live session. `discover()` already resolves that path, so it keeps the list from the last pass and hands it back. A TUI that has not taken a turn yet declares nothing — its rollout does not exist, see `codex-session-runtime.md`.

## A declared path that does not exist

`fs.watch` throws `ENOENT` when the path is absent — the Claude registry directory before Claude has ever run, for example. That is an expected outcome, not a failure, so it is not logged; the next full pass tries again. Any other error is logged as `activity:harness-watch-failed`.

A watcher that errors later (its file was deleted) closes itself and drops out of the map. The next full pass re-attaches it if the harness still declares it.

## Why the full pass stays

This replaced the hook Bankai used to install into a harness's own configuration — see `adr/0009-a-harness-is-watched-never-configured.md`. `removeInstalledHooks` in `src/main/activity/hookRemoval.ts` takes that hook back out on every start.

The watchers only make the common edge fast. The periodic pass is what notices a dead session, a card whose state drifted, and any edge no watcher reported. With no watcher able to attach at all, every card still reaches every state — only slower.
