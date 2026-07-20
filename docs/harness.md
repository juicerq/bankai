---
title: Harness integration traps; read before changing companion setup or extension loading
tags: [harness]
updated_at: 2026-07-20
created_at: 2026-07-20
---

## Pi loads a symlink according to the extension filename

Pi parses a global extension using the extension path exposed in its extensions directory. A
`bankai-pi-companion.js` symlink that targets `src/pi-companion.ts` is therefore parsed as JavaScript
and fails on TypeScript-only syntax such as `import type`.

`bankai setup pi` must link only the compiled `dist/bankai-pi-companion.js` artifact. Source-mode
setup requires `bun run build` first and must fail with an actionable missing-artifact error rather
than falling back to the TypeScript source.
