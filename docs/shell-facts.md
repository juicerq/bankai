---
title: What a shell record persists beyond its id and label, and when those facts are written
tags: [continuity, store, git]
updated_at: 2026-07-25
created_at: 2026-07-25
---

## Store v5 carries the facts the session list sorts and renders by

A shell record persists `createdAt` (epoch ms, required) plus the optional `lastTouchedAt`, `branch`, `title`, `archivedAt` and session ref, alongside `id` and `label`.

`createdAt` is the one required fact because the sidebar's open list orders by it and an absent value would have no defensible position. The v4→v5 migration cannot invent one — nothing recorded when an old shell was opened — so it writes `lastTouchedAt ?? 0`. Shells migrated with `0` land at the bottom of the list in id order, stable but arbitrary; every shell opened since carries a real stamp.

`lastTouchedAt`, `branch` and `title` stay optional and are invented by nothing: a shell restored from an older store has none of them until it is next stamped. A shell with no `title` falls back to `branch` and then to `label`.

## Exactly two events stamp a shell

`stampShell` in `src/main/continuity/ShellFacts.ts` is the only writer, called from:

- turn start — `AgentActivity.commit` walks `turnStartShells` and stamps the owning shell, passing the agent's worktree as the directory when one is known
- shell selection — `openShell` and `selectShell` in `src/main/router/continuity.ts`

PTY output stamps nothing. A watch build or a `tail -f` would otherwise keep a dead session out of the archive forever.

`lastTouchedAt` no longer places a session in the list — it only feeds the auto-archive window and orders the archive.

Selecting never unarchives. `archivedAt` is cleared by `Continuity.unarchiveShell` and by nothing else. Because select stamps `lastTouchedAt`, a session the 3-day window had filed would otherwise walk out of the archive the moment it was opened, which is the one thing the explicit gesture exists to prevent — so `selectShell` first runs the shell through `pinnedIfStale`, writing `archivedAt` to the idle timestamp the window was already judging it by. Implicit becomes explicit on the way in, the archive's order does not move, and the stamp that follows is harmless.

## The branch is a snapshot, not a subscription

`branchLabel` in `src/main/git/branch.ts` runs `git branch --show-current` against the shell's directory — the agent session's `cwd` when it has one, otherwise the project path. A detached HEAD and a directory outside any repository both fall back to the folder's basename.

Nothing watches for branch changes. Switching branches in a terminal leaves the stored value stale until the next stamp. That is the accepted behaviour, not an oversight.

## The title is derived once and then frozen

The same two events that stamp `lastTouchedAt` also derive a title, but only for a shell that has none. `Continuity.touchShell` keeps `shell.title ?? input.title`, so the freeze holds inside the store's queue and no caller can race it. A session resumed under a new session id therefore keeps the title of the conversation it continues, which is the point — a resumed transcript opens mid-conversation and its first message is an answer, not a subject.

Where the title comes from depends on what the shell is running:

- a shell with an agent session asks its harness through the optional `title` method on `Harness`, so no caller knows any harness's format. `ClaudeHarness` scans `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl` for the first user message that is real intent
- a shell with no agent gets the raw OSC 0/2 title its own shell wrote, sniffed off the PTY stream by `src/main/terminal/ShellTitles.ts` and stored unparsed

Deriving nothing is a normal outcome, not an error path: roughly a fifth of Claude transcripts yield no usable intent, an unknown harness has no `title` method at all, and a shell that never set a terminal title has nothing to sniff. Those shells stay untitled and the consumer falls back.

The OSC title is kept in memory per shell id, keyed to the shell rather than the PTY session, and dropped when the PTY exits. It is a live signal — only the freeze makes it a durable fact.

## A rename writes the same `title` field, and the freeze then protects it

`Continuity.renameShell` overwrites `title` unconditionally — it is the one writer that does not respect the freeze. Every later stamp does respect it, so a renamed session keeps its name across turns, restarts and a resume that mints a new session id, with no extra flag to carry.

The rename deliberately does not touch `label`. `label` stays the `Shell N` slot name that `nextShellNumberFrom` counts from, and the session list renders `title ?? branch ?? label` — writing a rename into `label` would be invisible on any shell that already has a derived title.
