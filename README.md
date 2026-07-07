# bankai

Personal desktop app: a **canvas of live Claude Code sessions grouped by project**, where clicking "Ver diff" on a session opens a **turn-by-turn code review** of what that agent generated.

Design & scope: [`grill/claude-canvas-review-03072026/prd.md`](./grill/claude-canvas-review-03072026/prd.md).

## Stack

- Electron 33 (native frame, `contextIsolation` + sandbox)
- electron-vite (main + preload + renderer)
- JSON store (`src/main/store`)
- ORPC over Electron IPC (renderer ↔ main, type-safe via `import type`) — control plane
- Raw IPC for the PTY byte stream — stream plane
- React 19 + TanStack Router (memory history) + TanStack Query
- Tailwind v4 (class-based dark mode)
- Arktype for boundary validation
- Vitest (in-process ORPC client)
- electron-builder + electron-updater (Linux AppImage)

## Comandos

```sh
bun install
bun run dev          # electron-vite dev (HMR + DevTools)
bun run test         # vitest run
bun run dist:linux   # build + AppImage
```

## Estrutura

```
src/
  main/          # Electron process (Node) — PTY supervisor, review model, ORPC routers, JSON store
  preload/       # bridges renderer ↔ main
  renderer/src/  # React + TanStack — canvas + review UI
tests/           # vitest
grill/           # PRD (design record)
```

_Copied from `~/projects/app-template`; template metadata (name, appId, repo) already swapped to `bankai`._
