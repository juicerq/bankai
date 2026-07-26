---
title: How the sidebar session list orders and partitions itself, what archiving means, and how a session gets selected across projects
tags: [ui, continuity, activity]
updated_at: 2026-07-25
created_at: 2026-07-25
---

## The list is a flat model built from continuity, not from mounted workspaces

`sessionRows` in `src/renderer/src/routes/-utils/session-rows.ts` flattens every workspace in the pushed continuity value, so a project that was never mounted this session still contributes rows. A workspace whose project no longer exists is skipped.

A row's title is the first non-blank of `shell.title`, `shell.branch`, `shell.label` — content-aware, so an empty string never wins.

## Order is `createdAt` descending and nothing else moves it

Activity never reorders the list, and neither does being touched. A row holds its position from the moment it is opened until it leaves for the archive, so the list only moves at lifecycle transitions. `shellId` breaks ties, which matters for the block of shells the v4→v5 migration stamped `0`.

This is why there is no freeze mechanism. The previous list ordered by `lastTouchedAt`, which moved rows under the pointer, and `frozenRows` / `holdForPointer` / `holdForModifier` existed only to hold it still while the user aimed. A stable order removes the problem instead of managing it; all four were deleted.

## Open versus archived is the user's call, with two overrides

`partitionSessions` splits the rows against a `now` the caller passes in. A row is archived when:

- `archivedAt` is set — the explicit `Archive` gesture, from the row's hover box or its context menu
- or it has not been touched for `SESSION_AUTO_ARCHIVE_MS` (3 days), counting from `lastTouchedAt` and falling back to `createdAt`

Activity beats both. A shell with any activity state is held open even if the user filed it, so blocked or running work can never disappear from the list. That is safe precisely because all three states are short-lived (see `agent-activity-lifetime.md`): the hold expires on its own.

Auto-archive is a net, not the mechanism. It exists so an abandoned session eventually leaves without the user doing anything; the intended way out is the explicit gesture.

`now` comes from `Date.now()` read during the route's render, not from a timer. A session therefore crosses the window on the next render rather than at the instant it expires, which on a three-day threshold is not worth a tick.

Nothing splits by viewport height any more. The open list scrolls, the archive is a collapsed section under it, closed by default and not persisted. `sessionRowHeight`, `splitSessions` and the height constants were deleted with the split — CSS owns the card's size now.

The open list orders by creation; the archive orders by when the work ended — `archivedAt ?? lastTouchedAt ?? createdAt`, descending. Two lists, two questions, two orders.

## Every open session is a card; activity only decorates it

A card is three lines at a fixed height: project and harness, then the title, then a trace line. The trace carries the agent's last output line while there is activity and the branch otherwise, so the row never changes height as a turn starts and ends. The left edge is a permanent 2px border, transparent without activity and coloured by state with it.

The earlier list made the card conditional on activity, so the session the user was reading shrank to a 28px row the moment its turn ended. That was the same mistake `agent-activity-lifetime.md` records for partitioning, one layer down: activity decides paint, never size or place.

Archived rows keep the slim 28px form — they are history, and the card's three lines have nothing to say about them.

## Keyboard reach stops at what is rendered

Holding `Alt` paints `1..9` over the rendered rows in visual order: the open list, then the archive if it is open, capped at nine. `Ctrl+Tab` jumps to the first `needs-attention` session in the open list. There is no bonus band any more: a waiting session cannot be archived, so it is already in the open list where its border and dot mark it.

`Alt` and not `Ctrl`: holding `Ctrl` collides with `Ctrl+C`, `Ctrl+D`, `Ctrl+L` and `Ctrl+R` inside an agent, which would paint numbers and throw the sidebar open on every interruption. There is no native menu bar for `Alt` to focus. No timing threshold gates the paint — a quick `Alt+1` simply jumps and the numbers are gone by the time `Alt` comes up.

In fullscreen, holding `Alt` reveals the sidebar through the same `canWithdraw` predicate the pointer edge, menus, drags and the picker already feed. `Ctrl+1..9` no longer activates a project and has no replacement.

## Archiving is not closing, and nothing undoes it by accident

Closing tears the PTY down and drops the shell from continuity. Archiving writes a timestamp and nothing else: the terminal stays alive and the session ref survives.

A row leaves the archive only through `Unarchive` — the row's own hover button, left of the cross, or the same item in its context menu. **Selecting an archived row opens it and leaves it archived.** That is deliberate and it is where this diverges from the model it was taken from, which un-settles a thread on any real activity: a glance at a filed session should not refile the list.

`Continuity.unarchiveShell` clears `archivedAt` **and** stamps `lastTouchedAt`. Without the stamp, unarchiving a row the 3-day window filed on its own would do nothing visible — the window would refile it on the same render. It is also why one command covers both kinds of archived row.

The mirror of that lives in `selectShell`, which pins a window-archived shell before stamping it — see `shell-facts.md`. `SESSION_AUTO_ARCHIVE_MS` sits in `src/shared/continuity.ts` because both sides now read it.

Archiving and closing move the selection the same way when they hit the selected session: `successorRow` over the **open** list picks the nearest remaining session of the same project, else the top of the list. A successor is never chosen out of the archive.

## Every gesture goes through one command channel

`useSessionCommands` keeps `byProject` seeded from each workspace's persisted `activeShellId`, and each mounted workspace registers `{ selectShell, openShell, closeShell }` under its project id. A gesture on a **mounted** project runs that command, so the workspace's own shell state stays authoritative.

The three fall back differently when the project is not mounted:

- **select** records the selection optimistically and persists it; the workspace mounting in the same commit reads it through `restoredActiveShellId`
- **create** has no fallback — it activates the project and queues the open, which drains the moment that workspace registers. This is why creating into a non-resident project reads as "activate, then create"
- **close** writes straight to continuity; there is no PTY to tear down

Archive is not on this channel. It writes to continuity directly, because no workspace state depends on it.

## Projects are a footer section, and nothing selects one

`ProjectFooter` is pinned under the session list, sorted by name, closed by default, its open state persisted as `layout.projectsOpen`. Sorting is by name and not by store order because project order no longer exists: it was array order in the store, so removing it migrated nothing.

Clicking a project row does not select the project — it opens its newest **open** session, falling back to its newest archived one, and creating one when it has none. That is the only way in: `activeProjectId` is now a consequence of which session is selected, never a thing the user sets. Adding a project lands inside a session in it for free, because a workspace mounting with no restored shells opens a default shell through `registerDefaultShell`.

Removing a project with open shells asks first, naming the count. Removing the one that owns the selected session moves the selection to the next session in list order; with no projects left the workspace region is empty and the existing `EmptyState` takes over.

## The tab strip is gone

`project-workspace-shell-tabs.tsx` and `Continuity.moveShell` were deleted with the session list. Creating, archiving and closing live on the sidebar: the header `+`, the row's hover box and cross, and the row context menu. `Ctrl+X T` and `Ctrl+X X` moved out of the per-workspace shortcut hook into `useBankaiShortcuts`, where they act on the selected session with no gate on a workspace being active — the workspace hook now owns only `Ctrl+X R`.
