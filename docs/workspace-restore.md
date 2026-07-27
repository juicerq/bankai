---
title: Which projects come back mounted when Bankai restarts
tags: [ui, continuity]
updated_at: 2026-07-27
created_at: 2026-07-27
---

## A workspace with no shells does not come back

`restoredResidentProjectIds` in `src/renderer/src/routes/-utils/use-workspace-activation.ts` seeds `useWorkspaceActivation` from continuity, keeping only the workspaces that still hold at least one shell. The active project is resident regardless — `useWorkspaceActivation` appends it — so opening the app always lands in a mounted workspace.

`Continuity.closeShell` drops the shell but leaves the workspace entry behind, so a project whose last session was closed still has a `{ projectId, shells: [] }` record. Restoring residency straight from that list mounted the project again, and a workspace mounting with no restored shells opens a default shell through `registerDefaultShell` (`session-commands.md`) — which autostarts a harness. Every restart therefore resurrected one live agent session per emptied project, and the sidebar showed sessions the user had closed days earlier.

A workspace whose shells are all archived stays resident. It restores tabs, so no default shell is invented, and the panes sleep on their own (`shell-residency.md`).
