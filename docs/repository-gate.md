---
title: What the pre-commit gate actually checks, and what it lets through
tags: [build, test]
updated_at: 2026-07-28
created_at: 2026-07-26
---

## The gate does not run the tests

`simple-git-hooks` binds pre-commit to `bun run check`, which is `bun run routes:generate && juicerq-check` — oxlint, `tsc --build`, and knip. `bun test` is a separate script and nothing calls it on the way to a commit. A commit that breaks a test passes the hook green.

That is not theoretical: `04210d6` replaced the harness text on the session card with `ClaudeGlyph` and left `tests/web/session-sidebar.test.tsx` asserting on the word `claude`. It reached `main`, and shipped in v0.2.23, with that test red.

Run `bun test` yourself before committing. The hook does not cover you.

## oxlint --fix can leave the tree redder than it found it

`juicerq-check` autofixes, and a fix it makes is only checked against lint rules — not against the type checker in the same pass. Dropping an explicit `undefined` argument is a valid lint fix that breaks `tsc` when the parameter was declared `value: T | undefined` instead of `value?: T`. Re-run `bun run check` after any run that reports `oxlint --fix rewrote`.

## bun run check rewrites the whole tree, not the files you touched

The `--fix` pass is repo-wide. With several agents editing the same working tree concurrently, one agent's `bun run check` silently rewrites the others' in-flight files. When orchestrating parallel edits, have workers validate with `bun run typecheck` plus scoped `bun test`, and run `check` once at the end, from the orchestrator.
