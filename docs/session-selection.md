---
title: Which session is selected, and what inherits the selection when it goes away
tags: [continuity, store, ui]
updated_at: 2026-07-27
created_at: 2026-07-27
---

## Continuity holds one selection, and the Active project follows it

The continuity value carries a single top-level `selectedShellId` (schema v6). There is no per-workspace `activeShellId` and no stored `activeProjectId`: the Active project is derived in `src/renderer/src/routes/index.tsx` as the owner of the selected session, and `useWorkspaceActivation` only falls back to the first available project while nothing is selected.

The v5 migrator promotes the `activeShellId` of the workspace that was the active project, and leaves the store unselected when either field was missing. Every other workspace's `activeShellId` is dropped — it answered a question no surface has asked since the session list replaced the tab strip (`adr/0004`).

`useWorkspaceActivation` no longer decides who is active; it owns residency alone. A project stays mounted because it was activated or restored with shells, not because it holds the selection.

## The successor rule lives in the reducer, not in the route

`successorOf` in `src/shared/continuity-reducers.ts` is applied by `closeShell`, `archiveShell` and `purgeProject` whenever the session leaving is the selected one. It scans every workspace newest-first and takes the first match of, in order: an open session of the same project, any open session, an archived session of the same project, anything left. With nothing left the field is removed rather than set to a dead id.

"Open" here is the same judgement `pinnedIfStale` makes — not archived, and touched inside `SESSION_AUTO_ARCHIVE_MS`. The reducer cannot see agent activity, so a stale session with a live agent ranks below an open one; the sidebar would rank it above. The disagreement only decides a fallback, and it resolves on the next stamp.

Ordering matches the sidebar (`session-rows.ts`): newest `createdAt` first, ties broken by ascending id.

## Clicking a Project opens its newest session

`ProjectFooter` is pinned under the session list, sorted by name, closed by default, its open state persisted as `layout.projectsOpen`. Sorting is by name and not by store order because project order no longer exists: it was array order in the store, so removing it migrated nothing.

Clicking a project row opens its newest **open** session, falling back to its newest archived one, and creating one when it has none. It never sets an Active project directly — that is a consequence of the selection, never a thing the user sets (`session-creation.md`).

Removing a project with open shells asks first, naming the count. Removing the one that owns the selected session moves the selection through `purgeProject`, so the route hands nothing over; with no projects left the workspace region is empty and the existing `EmptyState` takes over.
