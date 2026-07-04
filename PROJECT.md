# project-j

project-j is a personal Linux desktop app (Electron) for reviewing the code that
Claude Code agents write.

## Why it exists

I build software through Claude Code and write no code by hand. My job shifted from
*writing* to *reviewing*: I skim everything the agents generate — across every file —
and judge it for quality, cleanliness, and architecture. Two things make that hard:

- I run 2+ projects with agents at once, and there's no single place that shows all my
  live sessions and their state at a glance.
- My review tools were built for the pre-agent era: they show a git/working-tree diff,
  not the unit I actually review in — the **agent turn**.

## What it is

A desktop app with two levels:

1. **Canvas** — a pannable/zoomable board of my live Claude Code sessions, grouped inside
   dashed per-project frames. Each session node *is* a real `claude` process in an embedded
   terminal (not a summary card): I read and prompt the agent right there. A status badge
   shows what each session is doing and whether it has turns I haven't reviewed.
2. **Review** — clicking "Ver diff" replaces the canvas with a full-width, dense reading
   layout scoped to one session: a rail of the session's turns, the full readable diffs for
   the selected turn, and a feedback rail. v1 is read-only (walk turns, mark reviewed); it's
   architected so a later version can send feedback straight back into the live session.
