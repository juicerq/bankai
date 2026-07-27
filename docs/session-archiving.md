---
title: What archiving a session means, from the two ways in to the one way out
tags: [ui, continuity, activity]
updated_at: 2026-07-26
created_at: 2026-07-25
---

## Open versus archived is the user's call, with two overrides

`partitionSessions` splits the rows against a `now` the caller passes in. A row is archived when:

- `archivedAt` is set — the explicit `Archive` gesture, from the row's hover box or its context menu
- or it has not been touched for `SESSION_AUTO_ARCHIVE_MS` (3 days), counting from `lastTouchedAt` and falling back to `createdAt`

The gesture wins over activity; the 3-day limb does not. `archivedNow` reads `archivedAt` before it looks at activity, so filing a row whose agent is mid-turn files it now instead of appearing to do nothing. The automatic limb still refuses to file a shell with any activity state, so running or blocked work can never leave the list on its own.

Auto-archive is a net, not the mechanism. It exists so an abandoned session eventually leaves without the user doing anything; the intended way out is the explicit gesture.

`now` comes from `Date.now()` read during the route's render, not from a timer. A session therefore crosses the window on the next render rather than at the instant it expires, which on a three-day threshold is not worth a tick.

## Archiving is not closing, and nothing undoes it by accident

Closing tears the PTY down and drops the shell from continuity. Archiving writes a timestamp and nothing else *to the store* — but the row leaving the open list also takes its process down, after a grace window. See `shell-residency.md`; the shell record and its session ref survive either way, which is what makes waking possible.

A row leaves the archive only through `Unarchive` — the row's own hover button, left of the cross, or the same item in its context menu. **Selecting an archived row opens it and leaves it archived.** That is deliberate and it is where this diverges from the model it was taken from, which un-settles a thread on any real activity: a glance at a filed session should not refile the list.

`Continuity.unarchiveShell` clears `archivedAt` **and** stamps `lastTouchedAt`. Without the stamp, unarchiving a row the 3-day window filed on its own would do nothing visible — the window would refile it on the same render. It is also why one command covers both kinds of archived row.

The mirror of that lives in `selectShell`, which pins a window-archived shell before stamping it — see `shell-facts.md`. `SESSION_AUTO_ARCHIVE_MS` sits in `src/shared/continuity.ts` because both sides now read it.

## Archiving the selected session moves the selection like closing does

`successorRow` over the **open** list picks the nearest remaining session of the same project, else the top of the list. A successor is never chosen out of the archive.
