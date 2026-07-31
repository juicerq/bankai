---
title: What the Claude session registry publishes about a live session
tags: [activity]
updated_at: 2026-07-31
created_at: 2026-07-26
---

## One file per process, written on every edge

Claude Code writes `~/.claude/sessions/<pid>.json` for each running session and rewrites it whenever the session's state changes. It is the only live-state source the harness exposes passively; everything else bankai reads (the transcript, the PTY) is a log of what already finished.

`src/main/activity/claude.ts` is the boundary that normalizes it. The fields that carry anything on a real interactive session are `pid`, `sessionId`, `cwd`, `procStart`, `status`, `statusUpdatedAt` and `waitingFor`. `state`, `detail`, `tempo`, `jobId` and `agent` were null in all 11 live interactive session files sampled on this machine — do not build on them.

## A headless run publishes a file too, and it says `interactive`

`claude -p` writes its own `<pid>.json`. Measured on version 2.1.220: `kind` is `"interactive"` there as well, so `kind` cannot tell a real session from a headless one — `entrypoint` can (`"cli"` against `"sdk-cli"`), and nothing in bankai filters on it, because an unversioned enum that silently gains a value would cost every session rather than one.

What that record does **not** carry is `status`. `presenceStatus` maps a missing status to `idle`, so a headless run bound to a pane would read as a finished turn. The defence is in the binder, not here: the nearest agent to the shell wins, and a headless run spawned by an agent's Bash tool is always further away. See `agent-binding.md`.

The file disappears when the process exits, and a file left behind by a killed process is caught by the `procStart` check in `AgentActivity`.

## Two states publish no file at all

Measured on 2026-07-27 by driving the TUI through a PTY:

- **The trust dialog.** While "Do you trust the files in this folder?" is open, no `<pid>.json` exists — the file appears ~680ms *after* acceptance, already `idle`. A live process with no registry file is the one state with no oracle. Trust is inherited by subdirectories of any folder with `hasTrustDialogAccepted` in `~/.claude.json`, so a project mounted through the desktop never shows this again.
- **A child of another agent.** A `claude` spawned with `CLAUDE_CODE_CHILD_SESSION` in its env writes no registry file and no transcript. Bankai's PTYs are spawned from the app, not from an agent, so this never bites production — it bites any test harness that spawns `claude` from inside an agent session without scrubbing `CLAUDE*`/`ANTHROPIC*`/`AI_AGENT` from the env.

The file is also keyed by content, not just name: `cwd` inside the JSON locates a session when the pid is not known, and the binary removes the file on SIGHUP.

## The status vocabulary is four words

`busy`, `shell`, `idle`, `waiting`. `shell` is an agent inside a `!`-command or a bash tool it is blocked on; it is still the agent's turn, so bankai maps both `busy` and `shell` to `working`. Collapsing `shell` into `idle` would flip the card to "Done" mid-turn.

A subagent counts: while the main agent waits on one, the parent session stays `busy`.

## `waitingFor` names the blocking reason

Observed values: `permission prompt`, `dialog open`, `input needed`, `sandbox request`, `worker request`. In the harness binary the lookup falls back to `permission prompt` for any dialog it does not have a name for, over a read of the top of the dialog stack — so *any* open dialog sets `waitingFor`, and an unmapped one still arrives as a permission prompt rather than as nothing.

Bankai reads none of them. `parseSessionRecord` takes `status: "waiting"` and stops there: the card, the phone and the push notification all have one thing to say — **Waiting on you**. A per-reason label mapped five registry strings onto four phrasings and told the user nothing the state did not. Nothing tells Bankai what was actually asked; the hook that once did was removed with `adr/0009-a-harness-is-watched-never-configured.md`.

## `statusUpdatedAt` is an exact turn clock

Measured on this machine: it lands 12ms after a prompt is submitted, and a status transition is written to disk 70–90ms after it happens. That is two to three orders of magnitude tighter than the transcript's visibility lag — a record becomes visible on disk 0.24s after its own timestamp at p50, and 3.2s for an `assistant` record whose block is a `tool_use`. That is why every question about the *turn* is keyed to it: when the residency grace starts counting, and how long a card has said "Done" or "Needs permission".

It restarts on every status edge, including `busy → shell → busy`. A clock keyed straight to it would reset to "0s" each time an agent ran a command mid-turn. `clockSince` in `src/main/activity/AgentActivity.ts` therefore holds the stamp it already had while the *card's* state is unchanged, and only adopts a new one when the card's state actually changes — so the number answers "how long has this card been in this state".

So the number beside a card measures the state, not the work inside it: a turn that ran twenty tools reads as one span of Working.
