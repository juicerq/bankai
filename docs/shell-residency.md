---
title: Which shells keep a live process, and what puts one to sleep
tags: [ui, terminal, activity]
updated_at: 2026-07-27
created_at: 2026-07-26
---

## Residency is derived, and it decides whether a pane mounts

`shellResidency` in `src/renderer/src/routes/-utils/shell-residency.ts` answers one question per shell: should it be put to sleep? `ProjectWorkspaceShells` mounts a `TerminalPane` for every tab it is *not* asleep, and that mount is the whole mechanism — unmounting disposes the renderer session, which closes the PTY, which stops the agent.

A shell sleeps only when all of these hold:

- it is archived (`archivedAt` set)
- it carries a `session` ref, so waking it can resume the conversation
- it was not woken this run — `wake` is called when the shell is selected
- it has no activity state, or that state is older than `SHELL_ARCHIVE_GRACE_MS`

The set is deliberately the sleeping shells and not the running ones. A tab exists in local state the instant it is opened, but the continuity store only echoes it back after a disk write, so for a frame or two the shell is unknown to this rule. Asking "is it asleep?" answers no for an unknown shell and the terminal mounts; asking "is it running?" would have answered no as well, and the tab would have opened blank.

Nothing here is persisted. `useShellResidency` holds only the woken set; everything else is read live from continuity and from the activity snapshot.

The workspace's empty state is keyed to residency, not to the tab count. Archiving the last session in a project leaves tabs behind with no pane in them, and without that the region would render blank with no way out of it.

## The grace runs from when the state began

The deadline is `statusSince + SHELL_ARCHIVE_GRACE_MS`, not archive time plus the grace. An agent that has been waiting on the user for an hour is killed the moment it is archived; one that just started a turn gets the full window. `archivedAt` is the fallback anchor when no `statusSince` was published, which errs toward keeping the process alive.

The window is ten minutes for every activity state. `working` ends on its own well inside it in the normal case; `needs-attention` never ends on its own, which is what the deadline exists for.

Residency is recomputed on a thirty-second clock (`useClock`), which is coarse against a ten-minute grace and costs one interval for the whole app.

## Why the three-day window cannot touch this

`archivedNow` in `session-rows.ts` files a row after `SESSION_AUTO_ARCHIVE_MS` of no touch. It never writes `archivedAt` — it is a display rule evaluated against a `now` the caller passes. Residency reads `archivedAt` directly and therefore only ever changes when the user archives, unarchives, or selects a stale row. No clock can kill a process behind the user's back.

The two rules share a veto and differ in where it sits. `archivedNow` checks `archivedAt` **before** activity, so the explicit gesture files a working row immediately; the three-day limb still refuses to file one. Residency applies the grace instead of a veto, because a permanent hold would pin a waiting agent forever.

## Resumability is the same fact, exposed twice

`shellResidency` also returns `resumable`: every shell carrying a `session` ref. `TerminalPane` reads it as `resumeOnMount`. It has to be live rather than computed once at start-up — a shell that hibernated and is being woken needs to know it has a ref *now*, which is why `initialShellTopology` no longer carries `resumableShellIds`.
