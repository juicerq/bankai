# Development data

Development must use its own Bankai Dev data, never production Bankai data. To run more than one development instance, give each instance a different `DATA_DIR`.

# Validation

- Before committing, run both `bun test` and `bun run check`. The pre-commit hook runs only `bun run check`; it does not run tests.
- `bun run check` generates routes and runs `juicerq-check`, whose lint step can rewrite files across the repository. Inspect every rewrite and run the command again when it changes files.
- In a shared working tree, workers use `bun run typecheck` and focused tests. Run the repo-wide `bun run check` once after changes are integrated.
- The repository has no configured formatter. Match the surrounding source instead of running one.
