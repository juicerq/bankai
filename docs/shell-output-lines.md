---
title: Where the "last output line" on a session card comes from
tags: [terminal, activity]
updated_at: 2026-07-29
created_at: 2026-07-25
---

## There was no such source before

Nothing in the app kept the terminal's last readable line. `src/main/terminal/ShellOutputLines.ts` is that source: `TerminalSessions` feeds it every PTY chunk, it carries a per-shell tail across chunk boundaries, splits on any newline flavour, strips OSC / CSI / bare-escape sequences and control characters, collapses whitespace, and keeps the newest segment that still contains a letter or a digit, capped at 160 chars.

Control characters are replaced with a **space**, not removed — replacing a tab with nothing glues words together.

## The line is gated at the activity snapshot

`snapshotsByProject` only emits `traceByShellId` for a shell that already has an activity state. Two reasons: an idle shell has nothing worth showing, and gating it stops a chatty idle process (`tail -f`) from churning a continuity push every 1500ms.

## A shell with an agent in it never shows this line

The session card's trace slot is `traceByShellId`, and `sessionTraces` in `src/main/activity/AgentActivity.ts` fills it from four sources, weakest first: the scraped PTY line, the harness status, what the agent is waiting for, then "Compacting". The scraped line is **skipped entirely** for any shell bound to an agent, so it is the source for a plain shell and nothing else.

Overriding it was not enough. The harness status is missing for a tick or two in real cases — the first turn of a brand-new session, or any tick where a pasted image fills the 64KB transcript tail — and in exactly those ticks a card with a live agent fell through to raw TUI repaint garbage: a diff line number, half a sentence, a spinner frame. It now shows the branch, like a card with nothing to say, which is at least true. If a harness ever ships without a transcript reader, this is the line to revisit: today "has an agent" and "has a trace reader" are the same shells.

Compaction has to sit on top because it is the one moment the transcript lies by omission — see `agent-trace.md`.

## A scraped spinner message is an event, not a state

The claude TUI repaints **only the cells that changed**. Captured from a real PTY, a frame while the agent works is `ESC[H \r ESC[16B <colour> ✻ ESC[39m` — the spinner glyph and nothing else. The message beside it (`Hashing…`, `thinking with medium effort`) is written once, when it changes, and then only rewritten if its own pixels change — a shimmer sweep rewrites the whole string every frame, a plain message never does.

So anything scraped from that row is a **one-shot event**. A freshness window is the wrong shape for it: `Compacting conversation` may be painted once and then sit on screen, unwritten, for the two minutes the compaction lasts.

`matchesCompactionNotice` therefore only says *started*. The end comes from the transcript: `nextCompactionAnchor` in `src/main/activity/AgentActivity.ts` records which transcript record the agent stopped at when the notice arrived, and holds "Compacting" until that record is no longer the newest — which is exactly when the agent resumes — or until the turn ends. See `agent-trace.md` for why the transcript is frozen throughout.

The match runs on `plainText`, the same strip-and-collapse `outputLine` uses, because a message is painted between colour escapes and cursor jumps. That is safe for the *first* paint of a message, which the TUI writes as one contiguous string with real spaces; it is hopeless for a per-cell diff, where the phrase arrives as scattered single characters. Only the first paint has to match, and it does.

Two known holes, both accepted: a paint that wraps *inside* a word defeats the match, and a terminal that merely prints the words "Compacting conversation" is a false positive that lasts until the next transcript record.

## A finished agent is not described by what it last did

`sessionTrace` in `src/renderer/src/routes/-utils/session-rows.ts` overrides the observed trace for `done` only. A stopped agent's newest transcript block is always `text`, because a turn ends with the reply — so replaying it leaves "Writing" pinned to a card that finished minutes ago. It says "Done" instead.

A waiting agent is no longer overridden here: the main process already put the reason on the trace, read from `waitingFor` in the session registry, so the renderer would only be fabricating a vaguer version of a label it was handed. See `claude-session-registry.md`.

This is safe to key on activity alone: an activity state only exists for a shell bound to a live agent, so a plain shell never reaches those labels.

## What the scraped line is worth

It is raw PTY text. A full-screen TUI redrawing its frame hands over whatever landed last, and for Claude that was observed to be a diff line number (`5`, `-7`), half a sentence, or a spinner frame — the label changed on every repaint. Scraping cannot be fixed by better filtering: the redraw emits no complete lines to pick from. Treat it as a hint for a plain shell, never as a fact about what an agent is doing.
