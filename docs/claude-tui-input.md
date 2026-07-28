---
title: How the Claude Code TUI accepts input written blindly to its PTY
tags: [terminal, activity]
updated_at: 2026-07-27
created_at: 2026-07-27
---

All facts below were measured on 2026-07-27 by writing bytes to a real `claude` PTY without reading the screen, using `~/.claude/sessions/<pid>.json` as the oracle (25ms polling). Full log: bankai-mobile work, `assets/experimento-tui-pty.md`.

## Submitting a prompt

`\r` submits; a raw `\n` inserts a line break in the composer and never submits. Multiline text wrapped in bracketed paste (`ESC[200~ … ESC[201~`) followed by a separate `\r` arrives as one message. Typing during `busy` queues — the composer is never a wrong place to write.

## Dialog keys

Digit keys select **and confirm** in one stroke, no Enter — `1` accepts a permission prompt even when the arrow selection visibly sits on another option. `y`/`n` do nothing. Arrows (`ESC[B`) move the selection; Enter confirms it. `Esc` cancels the dialog and ends the turn.

Two traps: `2` on a permission prompt is "allow all edits during this session" — it silently flips the session's mode, so a button sending `2` must say so; and both `Esc` and choosing "No" land on `waiting→idle`, indistinguishable from a normally finished turn in the registry.

`Esc` during `busy` interrupts the turn (flip in 83ms). Two `Esc` within ~80ms clear the composer; ~1s apart they do not.

## The registry flip is the acknowledgement

Every key that had an effect moved the status file within 36–163ms; the dead key (`y`) moved nothing. "Input accepted" = any status change within ~1s of the byte. It acknowledges acceptance, not semantics — it never says which option won.

## Reading the dialog is not an option

The TUI repaints only changed cells, so a dialog's text is written to the PTY once and never again while it is on screen (ADR 0005 — this killed `attention.ts`). Labelling a dialog needs a data source outside the PTY: the hook spool and the registry's `waitingFor` category.
