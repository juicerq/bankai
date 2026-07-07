# bankai

bankai is a personal terminal app — a TUI (openTUI on Bun) — for reviewing the code
that Claude Code agents write.

## Why it exists

I build software through Claude Code and write no code by hand. My job shifted from
*writing* to *reviewing*: I skim everything the agents generate — across every file —
and judge it for quality, cleanliness, and architecture. Two things make that hard:

- I run 2+ projects with agents at once, and there's no single place that shows all my
  live sessions and their state at a glance.
- My review tools were built for the pre-agent era: they show a git/working-tree diff,
  not the unit I actually review in — the **agent turn**.

## What it is

A single-screen command center with two levels:

1. **Command center** — a left rail lists my projects; the right side hosts, per project, a
   set of tabbed shells. Each tab *is* a real terminal where I run `claude`/`cc` myself and
   read and prompt the agent right there — bankai doesn't wrap the process. It watches the
   tab's PID to bind it to the live Claude session, and a status badge shows what that session
   is doing and whether it has turns I haven't reviewed. Commands go through a tmux-style
   leader (`^X` then a key: `s` rail, `n` new tab, `d` close, `1-9` switch, `r` review).
2. **Review** — the `^X r` leader chord takes over the screen with a dense reading layout scoped to the focused
   session: a rail of the session's turns, the full readable diffs for the selected turn, and
   a feedback rail. Turns arrive live from Claude Code hooks or are backfilled from the session
   transcript. v1 is read-only (walk turns, mark reviewed); the feedback composer is architected
   but deferred to a later slice that sends feedback straight back into the live session.
