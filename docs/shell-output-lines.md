---
title: Where the "last output line" on a session card comes from, and what it is worth
tags: [terminal, activity]
updated_at: 2026-07-26
created_at: 2026-07-25
---

## There was no such source before

Nothing in the app kept the terminal's last readable line. `src/main/terminal/ShellOutputLines.ts` is that source: `TerminalSessions` feeds it every PTY chunk, it carries a per-shell tail across chunk boundaries, splits on any newline flavour, strips OSC / CSI / bare-escape sequences and control characters, collapses whitespace, and keeps the newest segment that still contains a letter or a digit, capped at 160 chars.

Control characters are replaced with a **space**, not removed — replacing a tab with nothing glues words together.

## The line is gated at the activity snapshot

`snapshotsByProject` only emits `traceByShellId` for a shell that already has an activity state. Two reasons: an idle shell has nothing worth showing, and gating it stops a chatty idle process (`tail -f`) from churning a continuity push every 1500ms.

## It is the fallback, not the source, for an agent session

The session card's trace slot is `traceByShellId`, and `sessionTraces` in `src/main/activity/AgentActivity.ts` fills it from two sources: the harness status wins, the scraped PTY line is what is left. A shell running Claude reads its status from the transcript; a plain shell has no harness and keeps the scraped line, which is what that source is actually good for.

## What the scraped line is worth

It is raw PTY text. A full-screen TUI redrawing its frame hands over whatever landed last, and for Claude that was observed to be a diff line number (`5`, `-7`), half a sentence, or a spinner frame — the label changed on every repaint. Scraping cannot be fixed by better filtering: the redraw emits no complete lines to pick from. Treat it as a hint for a plain shell, never as a fact about what an agent is doing.
