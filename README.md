# bankai

A terminal cockpit for interactive Claude Code, Codex, and Pi sessions, with a turn-by-turn
code-review layer for judging what the agents write.

Built for a workflow where you don't write code by hand — your job shifts from *writing*
to *reviewing*, and the unit you review is the **agent turn**, not a git working-tree diff.
See [`PROJECT.md`](./PROJECT.md) for the full product rationale.

## What it does

- **Command center** — a rail of your projects; each project hosts tabbed, *real* terminals
  where you run `claude`, Codex, or Pi yourself. bankai watches the terminal foreground through
  `/proc` to bind it to the interactive Harness Session. Non-interactive Harness modes are excluded.
- **Review** — a tmux-style leader (`^X` then a key; `r` enters review) takes over the screen
  with a dense, scoped reading layout: a rail of the session's turns and the full readable diffs
  for the selected turn. Turns arrive live from each Harness Transcript;
  only structured file changes attributed by that Transcript become Diffs.

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
bun run build   # production executable

# One-time setup for live Pi Session binding and Review capture
bankai setup pi
```

## Structure

```
src/
  index.tsx       entry point
  core/           domain logic, no TUI
    harness/      built-in Harness identities and capabilities
    session/      bind terminal foreground to an interactive Session through /proc
    review/       persistent Transcript projection, turn model, diff, accumulation
    terminal/     PTY tab supervisor (xterm headless)
    workspace/    project/tab runtime, restore planning, and persistence
    highlight/    tree-sitter syntax highlighting
    store/        atomic JSON store
  ui/             openTUI React — components, hooks (-utils), theme
tests/            vitest
```

Domain glossary lives in [`CONTEXT.md`](./CONTEXT.md); UI conventions in
[`src/ui/AGENTS.md`](./src/ui/AGENTS.md).
