---
title: What the Claude session registry publishes about a live session
tags: [activity]
updated_at: 2026-07-27
created_at: 2026-07-26
---

## One file per process, written on every edge

Claude Code writes `~/.claude/sessions/<pid>.json` for each running session and rewrites it whenever the session's state changes. It is the only live-state source the harness exposes passively; everything else bankai reads (the transcript, the PTY) is a log of what already finished.

`src/main/activity/claude.ts` is the boundary that normalizes it. The fields that carry anything on a real interactive session are `pid`, `sessionId`, `cwd`, `procStart`, `status`, `statusUpdatedAt` and `waitingFor`. `state`, `detail`, `tempo`, `jobId` and `agent` were null in all 11 live interactive session files sampled on this machine — do not build on them.

## A headless run publishes a file too, and it says `interactive`

`claude -p` writes its own `<pid>.json`. Measured on version 2.1.220: `kind` is `"interactive"` there as well, so `kind` cannot tell a real session from a headless one — `entrypoint` can (`"cli"` against `"sdk-cli"`), and nothing in bankai filters on it, because an unversioned enum that silently gains a value would cost every session rather than one.

What that record does **not** carry is `status`. `presenceStatus` maps a missing status to `idle`, so a headless run bound to a pane would read as a finished turn. The defence is in the binder, not here: the nearest agent to the shell wins, and a headless run spawned by an agent's Bash tool is always further away. See `agent-binding.md`.

The file disappears when the process exits, and a file left behind by a killed process is caught by the `procStart` check in `AgentActivity`.

## The status vocabulary is four words

`busy`, `shell`, `idle`, `waiting`. `shell` is an agent inside a `!`-command or a bash tool it is blocked on; it is still the agent's turn, so bankai maps both `busy` and `shell` to `working`. Collapsing `shell` into `idle` would flip the card to "Done" mid-turn.

A subagent counts: while the main agent waits on one, the parent session stays `busy`.

## `waitingFor` names the blocking reason

Observed values: `permission prompt`, `dialog open`, `input needed`, `sandbox request`, `worker request`. In the harness binary the lookup falls back to `permission prompt` for any dialog it does not have a name for, over a read of the top of the dialog stack — so *any* open dialog sets `waitingFor`, and an unmapped one still arrives as a permission prompt rather than as nothing.

`WAITING_TRACE` in `src/main/activity/claude.ts` maps them to card labels and falls back to `WAITING_TRACE_FALLBACK` ("Waiting on you"), so a value added by a later harness version degrades to a correct-but-vague label.

## `statusUpdatedAt` is an exact turn clock

Measured on this machine: it lands 12ms after a prompt is submitted, and a status transition is written to disk 70–90ms after it happens. That is two to three orders of magnitude tighter than the transcript's visibility lag (see `agent-trace.md`), which is why every question about the *turn* is keyed to it: when the residency grace starts counting, and how long a card has said "Done" or "Needs permission".

It restarts on every status edge, including `busy → shell → busy`. A clock keyed straight to it would reset to "0s" each time an agent ran a command mid-turn. `clockSince` in `src/main/activity/AgentActivity.ts` therefore holds the stamp it already had while the *card's* state is unchanged, and only adopts a new one when the card's state actually changes — so the number answers "how long has this card been in this state".

What it cannot answer is how long the agent has been doing the thing the trace names, because a turn holds many traces. Keying the card's elapsed clock to it printed `Thinking · 1m` over a thought that was six seconds old. That number now comes from the trace itself — see `agent-trace.md`.
