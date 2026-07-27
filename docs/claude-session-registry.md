---
title: What the Claude session registry publishes about a live session
tags: [activity]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## One file per process, written on every edge

Claude Code writes `~/.claude/sessions/<pid>.json` for each running session and rewrites it whenever the session's state changes. It is the only live-state source the harness exposes passively; everything else bankai reads (the transcript, the PTY) is a log of what already finished.

`src/main/activity/claude.ts` is the boundary that normalizes it. The fields that carry anything on a real interactive session are `pid`, `sessionId`, `cwd`, `procStart`, `status`, `statusUpdatedAt` and `waitingFor`. `state`, `detail`, `tempo`, `jobId` and `agent` were null in all 11 live interactive session files sampled on this machine — do not build on them.

## The status vocabulary is four words

`busy`, `shell`, `idle`, `waiting`. `shell` is an agent inside a `!`-command or a bash tool it is blocked on; it is still the agent's turn, so bankai maps both `busy` and `shell` to `working`. Collapsing `shell` into `idle` would flip the card to "Done" mid-turn.

A subagent counts: while the main agent waits on one, the parent session stays `busy`.

## `waitingFor` names the blocking reason

Observed values: `permission prompt`, `dialog open`, `input needed`, `sandbox request`, `worker request`. In the harness binary the lookup falls back to `permission prompt` for any dialog it does not have a name for, over a read of the top of the dialog stack — so *any* open dialog sets `waitingFor`, and an unmapped one still arrives as a permission prompt rather than as nothing.

`WAITING_TRACE` in `src/main/activity/claude.ts` maps them to card labels and falls back to `WAITING_TRACE_FALLBACK` ("Waiting on you"), so a value added by a later harness version degrades to a correct-but-vague label.

## `statusUpdatedAt` is an exact turn clock

Measured on this machine: it lands 12ms after a prompt is submitted, and a status transition is written to disk 70–90ms after it happens. That is two to three orders of magnitude tighter than the transcript's visibility lag (see `agent-trace.md`), which is why the session card's elapsed clock is keyed to it and not to anything transcript-derived.

It restarts on every status edge, including `busy → shell → busy`. A clock keyed straight to it would reset to "0s" each time an agent ran a command mid-turn. `clockSince` in `src/main/activity/AgentActivity.ts` therefore holds the stamp it already had while the *card's* state is unchanged, and only adopts a new one when the card's state actually changes — so the number answers "how long has this card said this", which is what a reader of the card is asking.
