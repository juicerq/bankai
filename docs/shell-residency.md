---
title: Which shells keep a live process, and what puts one to sleep
tags: [ui, terminal, activity]
updated_at: 2026-07-31
created_at: 2026-07-26
---

## Residency is derived, and it decides whether a pane mounts

`useShellResidency` answers one question per shell: should its pane be mounted? `ProjectWorkspaceShells` mounts a `TerminalPane` for every shell that is not asleep. Unmounting detaches the renderer from the PTY; the main process closes the PTY when it handles the archive mutation.

A shell sleeps only when all of these hold:

- it is archived (`archivedAt` set)
- it was not woken this run — `wake` is called by `useSessions` when the shell is selected

The set is deliberately the sleeping shells and not the running ones: asking "is it asleep?" answers no for a shell this rule has never seen, so an unknown shell mounts its terminal instead of opening blank.

Nothing here is persisted. `useShellResidency` holds only the woken set, and `useSessions` is what calls into it — selecting wakes and archiving sleeps, one call per intent.

The workspace's empty state is keyed to residency, not to the tab count. Archiving the last session in a project leaves tabs behind with no pane in them, and without that the region would render blank with no way out of it.

## Archiving captures the resume target before stopping the process

The continuity router waits for a fresh `AgentActivity` pass before closing the shell. The pass captures the harness, native session id and cwd that are live at the archive gesture, including a harness that replaced another one in the same shell. Its store mutation is queued before `archiveShell`.

`ShellProcesses.list` omits a process as soon as closing begins. Later activity passes therefore cannot observe the intentional shutdown as a shell that returned to its prompt and clear the resume target. The PTY exit is also marked intentional, so its exit callback preserves the same reference.

## Why the three-day window cannot stop a process

`archivedNow` in `session-rows.ts` files a row after `SESSION_AUTO_ARCHIVE_MS` of no touch. It never writes `archivedAt` — it is a display rule evaluated against a `now` the caller passes. Residency reads `archivedAt` directly and therefore only ever changes when the user archives, unarchives, or selects a stale row. No clock can kill a process behind the user's back.

The explicit archive mutation is the only path that closes the PTY. The three-day display rule leaves it alone.

## Resumability is the same fact, exposed twice

`useShellResidency` also returns `resumable`: every shell carrying a `session` ref. `TerminalPane` reads it as `resumeOnMount`. It has to be live rather than computed once at start-up — the archive mutation's final activity pass can replace a Claude ref with Codex or a Codex ref with Claude immediately before the pane sleeps.
