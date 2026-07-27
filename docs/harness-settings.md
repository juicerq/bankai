---
title: How autostart decides which harness a new shell launches
tags: [terminal, store, ui]
updated_at: 2026-07-27
created_at: 2026-07-26
---

## Autostart is one global setting, resolved in main

`settings.json` v3 carries `harness: { autostart, id, args?, liveTrace? }` — the last of those decides whether a card says what the agent is doing at all, and is documented in `hook-spool.md`. It is absent until the panel is used; `autostartCommandLine` in `src/main/terminal/autostart.ts` falls back to `DEFAULT_HARNESS_SETTINGS` — autostart on, Claude — so a fresh install and every store written before v3 behave the same.

Three things produce no command and open a bare shell rather than failing: autostart off, an `id` no registered harness claims, and an unreadable settings store. A terminal that will not open is worse than a terminal without an agent.

`launchableHarnesses` is what the settings panel lists, by id, label and binary. A harness with no `launch` — one Bankai can only observe, never start — is invisible there by construction. The binary never reaches the renderer: the router turns it into `available` and sends that.

`args` is a raw string the user types. `splitArguments` cuts it into words, honouring `'…'` and `"…"` so a quoted run survives as one argument, and `shellCommandLine` re-quotes each word — typed text can never become shell syntax. The extras are appended to autostart *and* to resume, but only while the stored session's harness is the configured one; resuming some other harness gets its plain command.

## Whether the harness exists is a question only the user's shell can answer

`harnessAvailable` in `src/main/terminal/harnessAvailability.ts` runs `$SHELL -i -c "command -v <file>"` and reads the exit code. `-i` is the point: the PATH that matters is the one the rc builds, not the one Electron inherited from the desktop session, so checking `process.env.PATH` would answer a different question than the one the shell will ask at launch.

Positive results are cached for the life of the process; negative ones are not, so installing the harness and reopening the panel is enough. Without this the only symptom of a missing binary is a `command not found` scrolling past inside a shell that then looks like autostart simply did nothing.
