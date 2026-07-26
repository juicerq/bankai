---
title: Why agent activity is a per-turn signal and cannot stand for "this session is alive"
tags: [activity, ui]
updated_at: 2026-07-25
created_at: 2026-07-25
---

## A live PTY is not activity

`nextShellActivity` in `src/main/activity/AgentActivity.ts` only produces a state when `SessionBinder` matches the shell to an agent process that has a turn open. A shell running a plain command, or nothing at all, never has a state — no matter that its PTY exists and its terminal is mounted.

The three states are shorter-lived than they look:

- `working` ends when the turn ends.
- `done-unseen` is cleared by `markViewed` the moment the user looks at the shell.
- `needs-attention` is the only one that survives the user reading the row, and only while the agent is still waiting.

## The session you are working in has no activity

Reading a shell clears `done-unseen`; typing in it while the agent is idle produces nothing. So any UI that partitions sessions into "active" and "inactive" by the presence of an activity state puts the session under the user's cursor on the inactive side.

## Activity is keyed by the persistent shell id

`snapshotsByProject` writes `shells` under `owner.shellId`, the same key `worktreeByShellId` already uses, not under the ephemeral session id a PTY spawn mints. Any surface can therefore join activity to a shell without a renderer-side map from one to the other; the map that used to do that is gone.

This does not make activity available for cold shells — it is still PTY-derived, so a shell whose terminal is not mounted has no state at all.

The sessions-first sidebar hit this twice. Its first prototype split `ACTIVE` from `IDLE` on `session.activity` being set, and the session being worked in fell into the shelf. The fix removed activity from the partition but left it choosing the row's height, so the session under the cursor still shrank the moment its turn ended — the same mistake, one layer down. Activity now decides paint only: a border colour, a dot, and what the card's trace line says. Placement comes from `createdAt`, and the open/archived split comes from the user (see `session-archiving.md`).

The one thing activity still decides is a veto: a shell with any state cannot be archived, explicitly or automatically. That is safe only because these states are short-lived — a permanent signal used the same way would pin a row open forever.

## There is no per-project aggregate any more

`ProjectActivitySnapshot` used to carry a `state` field — `aggregateActivity` over the project's shells. Two surfaces consumed it: the rail's per-project dot and the fullscreen header's cross-project announcement strip, which numbered a project with the same digit `Ctrl+1..9` used. Both died with the project rail, and the digit they shared has no owner left, so the field went with them.

`aggregateActivity` itself is still alive — the review panel aggregates a worktree's shells with it.

What is lost is real and was accepted: activity in a project the user is not looking at is now seen by bringing the pointer to the sidebar edge, not passively from the header. The per-session replacement for that passive signal is a separate effort.
