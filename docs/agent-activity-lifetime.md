---
title: Why Agent activity follows the turn while Done follows the Shell
tags: [activity, ui]
updated_at: 2026-07-29
created_at: 2026-07-25
---

## A live PTY is not activity

`nextShellActivity` in `src/main/activity/AgentActivity.ts` only discovers live state when `SessionBinder` matches the Shell to an Agent process. A Shell running a plain command, or nothing at all, never becomes Working or Needs attention — no matter that its PTY exists and its terminal is mounted.

Two states follow the live turn:

- `working` means the Agent is executing the turn.
- `needs-attention` means the turn is open but waiting on the user.

If the Agent process disappears during either state, the state disappears. Bankai does not invent a completion from a dead process.

## Done is a durable decision queue

When a live turn reaches `done`, `AgentActivity` writes its completion time to the Shell's `doneAt` fact through `Continuity.finishTurn`. The activity snapshot only publishes Done once that fact exists. A later Agent exit therefore cannot erase it, and restarting Bankai restores both Done and its original elapsed clock without needing a live PTY.

Done survives focus, selection, terminal input that does not begin a turn, and reading the Conversation. It is resolved only when:

- the Harness observes a later turn begin and `Continuity.startTurn` clears `doneAt`
- the user archives the Shell and `Continuity.archiveShell` clears `doneAt`
- the user closes the Shell and its record leaves Continuity

Unarchiving does not restore Done. Store v8 added the optional fact without backfilling old idle Shells, because an old timestamp cannot prove that an Agent completed a turn.

The completion push still follows the live `working` or `needs-attention` to `done` edge. Restoring `doneAt`, selecting the Shell, or restarting Bankai changes no live edge and sends no new push.

## Activity is keyed by the persistent Shell id

`snapshotsByProject` writes `shells` under `owner.shellId`, the same key `worktreeByShellId` already uses, not under the ephemeral session id a PTY spawn mints. Any surface can therefore join activity to a shell without a renderer-side map from one to the other; the map that used to do that is gone.

Working and Needs attention remain PTY-derived. Done is joined from Continuity, so a cold Shell can still carry it. The renderer also reads `doneAt` from its Continuity value as a startup fallback while the activity stream connects.

The sessions-first sidebar hit this twice. Its first prototype split `ACTIVE` from `IDLE` on `session.activity` being set, and the session being worked in fell into the shelf. The fix removed activity from the partition but left it choosing the row's height, so the session under the cursor still shrank the moment its turn ended — the same mistake, one layer down. Activity now decides paint only: a border colour, a dot, and what the card's trace line says. Placement comes from `createdAt`, and the open/archived split comes from the user (see `session-archiving.md`).

The one thing activity still decides is a hold. The 3-day auto-archive will not file a Shell with any state. Done can hold it indefinitely because that is the decision queue: the Shell stays easy to reach until the user starts the next turn, archives it, or closes it. Explicit archive still wins over every activity state.

## Aggregates are projections, not stored activity

`ProjectActivitySnapshot` carries Shell states, never a stored project state. Consumers derive the grouping they need from those Shells:

- the mobile Project picker chooses the most urgent open Shell for each Project
- the Review panel uses `aggregateActivity` for the Shells sharing one Worktree

Done restored from Continuity joins the same snapshot, so these projections do not need their own completion memory.
