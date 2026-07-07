# project-j

- `PROJECT.md` — what project-j is and why it exists (a canvas of live Claude Code sessions
  per project + a turn-by-turn code-review layer). Read it first for product context and scope.
- `src/ui/AGENTS.md` — UI rules (one component per file, namespaced barrel, no `useEffect` to derive state / fetch data).

## Commands

- `bun run dev` — run the TUI with `--watch` (openTUI on Bun)
- `bun run check` — typecheck + lint gate (tsgo + oxlint + jscpd + knip)
- `bun run test` — vitest
