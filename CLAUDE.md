# bankai

- `PROJECT.md` — what bankai is and why it exists: a command center for interactive Harness
  Sessions with a turn-by-turn code-review layer. Read it first for product context and scope.
- `src/ui/AGENTS.md` — UI rules and the required React/component guides.

## Docs

Knowledge that cannot be discovered cheaply from the repo lives in `docs/*.md`, one concept per file, with frontmatter:

```
---
title: {what is here and when you need to read it}
tags: [terminal, ui]
updated_at: 2026-07-17
created_at: 2026-06-17
---
```

Tags are the folder names under `src/core/` plus `ui` — never invented; `ls src/core` shows the rest of the valid set.

- Session start: `rg "^title:" docs/` is the map. Task has a domain? Grep it against `tags:` and read only what matches. ADRs live in `docs/adr/`.
- ADR vs doc: an ADR is a historic decision, immutable once written; a doc is a current fact, mutable and deletable. A trap or fact goes in a doc even when it originated from a decision.
- Session end: were you surprised, did you correct a wrong assumption, or did the user state a fact that lives nowhere in the repo? Record it as a `##` heading in the doc that owns the subject — create the doc if missing, bump `updated_at`.
- An entry you can tell is wrong or expired: delete it on the spot.

## Commands

- `bun run dev` — run the TUI with `--watch` (openTUI on Bun)
- `bun run check` — typecheck + lint gate (tsgo + oxlint + jscpd + knip)
- `bun run test` — vitest
- `bun run build` — compile the executable
