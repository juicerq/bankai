# project-j

- `PROJECT.md` — what project-j is and why it exists (a canvas of live Claude Code sessions
  per project + a turn-by-turn code-review layer). Read it first for product context and scope.
- `src/renderer/AGENTS.md` — renderer rules (e.g. no `useEffect` to derive state / fetch data).

## Commands

- `bun run dev` — electron-vite dev (HMR + DevTools)
- `bun check` — typecheck + lint gate (tsgo + oxlint + jscpd + knip)
- `bun run test` — vitest
- `bun run dist:linux` — build + AppImage
