# bankai

bankai is a personal terminal app — a TUI (openTUI on Bun) — for reviewing the code
that interactive Claude Code and Codex Harnesses write.

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
   set of tabbed shells. Each tab *is* a real terminal where I run Claude Code or Codex myself and
   read and prompt the agent right there — bankai doesn't wrap the process. It watches the
   terminal foreground to bind it to the live Harness Session, and a status badge shows what that
   Session is doing and whether it has turns I haven't reviewed. Commands go through a tmux-style
   leader (`^X` then a key: `s` rail, `n` new tab, `d` close, `1-9` switch, `r` review).
2. **Review** — the `^X r` leader chord takes over the screen with a dense reading layout scoped to
   the focused session: a rail of the session's turns and the full readable diffs for the selected turn.
   Turns arrive live from the canonical Harness Transcript and persist as a normalized projection.
   Review is read-only: walk turns and mark completed or interrupted turns as reviewed.
