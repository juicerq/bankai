# Development data

Development must use its own Bankai Dev data, never production Bankai data. To run more than one development instance, give each instance a different `DATA_DIR`.

# Validation

- Before committing, run both `bun test` and `bun run check`. The pre-commit hook runs only `bun run check`; it does not run tests.
- `bun run check` generates routes and runs `juicerq-check`, whose lint step can rewrite files across the repository. Inspect every rewrite and run the command again when it changes files.
- In a shared working tree, workers use `bun run typecheck` and focused tests. Run the repo-wide `bun run check` once after changes are integrated.
- The repository has no configured formatter. Match the surrounding source instead of running one.

# Docs

Knowledge that cannot be discovered cheaply from the repo lives in `docs/*.md`, one concept per file, with frontmatter:

```
---
title: {what is here and when you need to read it}
tags: [git, ui]
updated_at: 2026-07-25
created_at: 2026-07-25
---
```

Tags are the folder names under `src/main/`, plus `ui`, `build`, `test`, `env` — never invented; `ls -d src/main/*/` shows the code half.

- Session start: `rg "^title:" docs/` is the map. Task has a domain? Grep it against `tags:` and read only what matches. ADRs live in `docs/adr/`.
- ADR vs doc: an ADR is a historic decision, immutable once written; a doc is a current fact, mutable and deletable. A trap or fact goes in a doc even when it originated from a decision.
- Session end: were you surprised, did you correct a wrong assumption, or did the user state a fact that lives nowhere in the repo? Record it as a `##` heading in the doc that owns the subject — create the doc if missing, bump `updated_at`.
- An entry you can tell is wrong or expired: delete it on the spot.
