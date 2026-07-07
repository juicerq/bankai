# bankai

A terminal cockpit for the Claude Code sessions you run across your projects, with a
turn-by-turn code-review layer for judging what the agents write.

Built for a workflow where you don't write code by hand — your job shifts from *writing*
to *reviewing*, and the unit you review is the **agent turn**, not a git working-tree diff.
See [`PROJECT.md`](./PROJECT.md) for the full product rationale.

## What it does

- **Command center** — a rail of your projects; each project hosts tabbed, *real* terminals
  where you run `claude` yourself. bankai doesn't wrap the process — it watches each tab's PID
  through `/proc` to bind it to the live Claude session, and a status badge shows whether that
  session is generating, idle, blocked, or has turns you haven't reviewed.
- **Review** — a tmux-style leader (`^X` then a key; `r` enters review) takes over the screen
  with a dense, scoped reading layout: a rail of the session's turns, the full readable diffs
  for the selected turn, and a feedback rail. Turns arrive live from Claude Code hooks or are
  backfilled from the session transcript.

## Stack

- openTUI (`@opentui/core` + `@opentui/react`) on **Bun** — a single terminal process,
  React 19 reconciling over terminal renderables
- `@xterm/headless` for the PTY tabs
- tree-sitter (WASM) for syntax highlighting in diffs
- Atomic JSON store on disk (XDG data dir)
- Arktype for boundary validation
- Vitest for tests; `lobomfz-check` (tsgo + oxlint + jscpd + knip) for the typecheck/lint gate

## Commands

```sh
bun install
bun run dev     # TUI with --watch (src/index.tsx)
bun run check   # typecheck + lint gate
bun run test    # vitest
```

## Structure

```
src/
  index.tsx       entry point
  core/           domain logic, no TUI
    session/      bind a tab's PID to its live Claude session (/proc, sessionsFs)
    hooks/        Claude Code hook gateway + installer
    review/       turn model, transcript backfill, diff, accumulation
    terminal/     PTY tab supervisor (xterm headless)
    highlight/    tree-sitter syntax highlighting
    store/        atomic JSON store
  ui/             openTUI React — components, hooks (-utils), theme
tests/            vitest
```

Domain glossary lives in [`CONTEXT.md`](./CONTEXT.md); UI conventions in
[`src/ui/AGENTS.md`](./src/ui/AGENTS.md).
