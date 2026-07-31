---
title: How the sidebar session list is assembled and ordered
tags: [ui, continuity, activity]
updated_at: 2026-07-30
created_at: 2026-07-25
---

## The list is a flat model built from continuity, not from mounted workspaces

`sessionRows` in `src/renderer/src/routes/-utils/session-rows.ts` flattens every workspace in the pushed continuity value, so a project that was never mounted this session still contributes rows. A workspace whose project no longer exists is skipped.

A row's title is the first non-blank of `shell.title`, `shell.branch`, `shell.label` — content-aware, so an empty string never wins.

## Order is `createdAt` descending and nothing else moves it

Activity never reorders the list, and neither does being touched. A row holds its position from the moment it is opened until it leaves for the archive, so the list only moves at lifecycle transitions. `shellId` breaks ties, which matters for the block of shells the v4→v5 migration stamped `0`.

This is why there is no freeze mechanism. The previous list ordered by `lastTouchedAt`, which moved rows under the pointer, and `frozenRows` / `holdForPointer` / `holdForModifier` existed only to hold it still while the user aimed. A stable order removes the problem instead of managing it; all four were deleted.

The open list orders by creation; the archive orders by when the work ended — `archivedAt ?? lastTouchedAt ?? createdAt`, descending. Two lists, two questions, two orders. See `session-archiving.md` for which list a row lands in.

## Every open session is a card; activity only decorates it

A card is three lines at a fixed height: project and harness, then the title, then a state line. That line names the activity — Working, Done, Waiting on you — while there is one, and the branch otherwise, so the row never changes height as a turn starts and ends. The left edge is a permanent 2px border, transparent without activity and coloured by state with it.

The earlier list made the card conditional on activity, so the session the user was reading shrank to a 28px row the moment its turn ended. That was the same mistake `agent-activity-lifetime.md` records for partitioning, one layer down: activity decides paint, never size or place.

Archived rows keep the slim 28px form — they are history, and the card's three lines have nothing to say about them.

## Nothing splits by viewport height

The open list scrolls, the archive is a collapsed section under it, closed by default and not persisted. `sessionRowHeight`, `splitSessions` and the height constants were deleted with the split — CSS owns the card's size now.
