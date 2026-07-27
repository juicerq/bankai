# "Needs attention" is read from the session registry, not scraped from the PTY

ADR-0001 chose passive detection and noted that "needs attention" rested on per-CLI output parsing — "the one signal transcripts and process state cannot provide". That premise was wrong for Claude Code. Its session registry (`~/.claude/sessions/<pid>.json`) publishes `status: "waiting"` plus a `waitingFor` string naming the reason, and bankai was already reading that file for discovery and throwing three quarters of it away. We deleted `src/main/activity/attention.ts` — which matched prompt strings such as `tell Claude what to do differently` in scraped PTY text — and take `waiting` and its reason from the registry instead.

The scrape was structurally unfit, not merely fragile: the Claude TUI repaints only changed cells, so a prompt's text is written **once** and never again while it sits on screen. A scraped match is an event, and "the user is being asked something" is a state. The registry is a state, written on the edge, and it also says *what* is being asked.

This is not a reversal of ADR-0001. Nothing is installed into the user's configuration; the registry is a file the harness already writes, read passively, and a version that stops writing it degrades to no signal.

## Consequences

- The attention signal is exact for Claude and gains a reason label (`Needs permission`, `Needs input`, `Waiting on you`), instead of a single heuristic bit.
- Another harness gains nothing here. A CLI without an equivalent registry has no attention signal at all now — the PTY heuristic that used to cover it is gone, and re-adding one is a per-CLI decision to be made on that CLI's evidence.
- `waitingFor` is an unversioned string from a tool bankai does not own. `WAITING_TRACE` maps the five observed values and falls back to "Waiting on you", so an added value costs precision, never the signal.
- The registry also carries `statusUpdatedAt`, which is what the card's elapsed clock is keyed to. Both now depend on that one file being readable.
