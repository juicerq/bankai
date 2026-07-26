---
title: Where the "last output line" on a session card comes from, and what it is worth
tags: [terminal, activity]
updated_at: 2026-07-25
created_at: 2026-07-25
---

## There was no such source before

Nothing in the app kept the terminal's last readable line. `src/main/terminal/ShellOutputLines.ts` is that source: `TerminalSessions` feeds it every PTY chunk, it carries a per-shell tail across chunk boundaries, splits on any newline flavour, strips OSC / CSI / bare-escape sequences and control characters, collapses whitespace, and keeps the newest segment that still contains a letter or a digit, capped at 160 chars.

Control characters are replaced with a **space**, not removed — replacing a tab with nothing glues words together.

## The line is gated at the activity snapshot

`snapshotsByProject` only emits `lastLineByShellId` for a shell that already has an activity state. Two reasons: an idle shell has nothing worth showing, and gating it stops a chatty idle process (`tail -f`) from churning a continuity push every 1500ms.

## What it is worth

It is scraped raw PTY text. A full-screen TUI redrawing its frame will hand over whatever line happened to land last, which may be a border or a status bar rather than anything meaningful. Treat it as a hint, never as a fact about what the agent is doing.
