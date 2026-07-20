---
title: Harness integration traps; read before changing companion setup or extension loading
tags: [harness]
updated_at: 2026-07-20
created_at: 2026-07-20
---

## A fresh Pi startup Session already contains metadata

Pi writes `model_change` and `thinking_level_change` entries before extensions receive
`session_start`. Eligibility cannot use an empty-entry check. A startup Session is still fresh while
it has no message, custom message, compaction, or branch summary.

## Pi file-tool overrides can preserve the built-in contract

An extension may re-register `write` and `edit` only to customize rendering while delegating execution
to Pi's built-in tool definitions. Source ownership alone therefore does not prove a conflict. The
companion captures the pre-call contents, derives the expected result from the standard tool contract,
and compares it with disk after successful execution. A mismatch makes Review unavailable as unsafe;
a matching override remains reviewable.

## Pi loads a symlink according to the extension filename

Pi parses a global extension using the extension path exposed in its extensions directory. A
`bankai-pi-companion.js` symlink that targets `src/pi-companion.ts` is therefore parsed as JavaScript
and fails on TypeScript-only syntax such as `import type`.

`bankai setup pi` must link only the compiled `dist/bankai-pi-companion.js` artifact. Source-mode
setup requires `bun run build` first and must fail with an actionable missing-artifact error rather
than falling back to the TypeScript source.
