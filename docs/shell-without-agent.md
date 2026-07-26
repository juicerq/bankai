---
title: How a shell ends up with no agent in it, on purpose or after one exits
tags: [terminal, continuity, activity]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## A shell can opt out of the harness one at a time, and it is remembered

Alt+click on New shell, or Ctrl+X Shift+T, records `plain: true` on the shell in `continuity.json`, and `TerminalSessions.open` reads it back and skips the launch command. The two requests travel different channels — the shell record over oRPC, the terminal over `window.bankaiTerminal` — so nothing orders them, and a `plain` that arrives late would open with a harness. It is left as a race on purpose: `scheduleAfterPaint` in `use-terminal-session.ts` puts two animation frames between the click and the terminal request, the store serialises reads behind writes, and losing costs one Ctrl+C. Threading `plain` through the pane to remove the race would spread the field across six more files for that. Ctrl+C twice still works and is the escape hatch for a shell already running; `plain` is for the shells you know up front you do not want an agent in, and it survives a restart because the shell that reopens should be the shell you had.

## A harness that exits inside its shell still clears its session ref

`terminal.onExit` only fires when the *shell* dies, so it can no longer stand for "the agent is gone". Nothing was added for this: `captureSessionRefs` in `AgentActivity` already observes every live PTY each tick and emits a `clear` for one with no bound agent. Ctrl+C out of Claude and the ref is dropped within a poll, so the next app start opens the shell fresh instead of resuming a conversation that was deliberately abandoned.
