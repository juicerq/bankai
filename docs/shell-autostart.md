---
title: How a shell starts its harness, why the harness is a child of the shell instead of the PTY root, and why the command is an argument instead of typed input
tags: [terminal, store, ui]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## Every PTY is the user's login shell, and the harness runs inside it

`spawnSession` in `src/main/terminal/TerminalSessions.ts` always spawns `process.env.SHELL`. Both ways of starting an agent — autostart from settings and resume of a stored session — produce a command line, and `shellArgs` turns it into `-i -c "<command>; exec <shell>"`. With no command the shell gets no arguments at all.

`-i` makes the shell read its rc, which is the whole reason the harness runs through a shell. `exec` replaces the `-c` shell in place once the harness exits, so the pane becomes an ordinary interactive shell with no extra process left over.

Nothing spawns `claude` as the PTY's root process any more. Two things follow from that, and both are the point:

- quitting the agent with Ctrl+C twice leaves the shell running, so the pane becomes a plain terminal instead of printing `[process exited 0]`
- the command is resolved by the user's own interactive shell, so a `claude` installed by a version manager configured in `.zshrc` is found. Spawning it directly resolved against the Electron process env, which inherits from the desktop session and not from any rc file.

Arguments are quoted by `shellCommandLine` in `src/main/terminal/commandLine.ts`, and so is the shell path in the `exec`. Anything outside `[A-Za-z0-9_@%+=:,./-]` is single-quoted, because the shell parses this string and a bare `;` would be syntax.

## Do not type the command into the PTY — the tty echoes it twice

The obvious alternative is to spawn a bare shell and write `claude\r` into the PTY. It works, and it looks broken: the tty is still in canonical mode with ECHO on, so the kernel prints the raw bytes, and then the shell's line editor reads the buffered line and draws it again under the prompt. The user sees `claude` twice, once above the prompt with no prompt attached to it. Waiting for a quiet window before typing only trades that for a timing heuristic.

Measured with node-pty against fish 4.8, bash and zsh: `-i -c '<cmd>; exec "$SHELL"'` runs the command, prints no echo before the prompt, and leaves a working interactive shell behind in all three.

The trap when measuring any of this is that it needs a faithful terminal on the other end. Fish opens by querying the terminal — kitty keyboard protocol (`\e[?u`), XTVERSION (`\e[>0q`), background colour (OSC 11), XTGETTCAP (`\eP+q…`), primary DA (`\e[0c`) — and blocks until it gets answers. A probe harness that only reads and never replies leaves fish stuck before its first prompt, which reads exactly like "fish discards early input". It does not. xterm.js answers those queries, so the app never sees this; only a hand-rolled node-pty probe does.

## Autostart is one global setting, resolved in main

`settings.json` v3 carries `harness: { autostart, id }`. It is absent until the panel is used; `autostartCommandLine` in `src/main/terminal/autostart.ts` falls back to `DEFAULT_HARNESS_SETTINGS` — autostart on, Claude — so a fresh install and every store written before v3 behave the same.

Three things produce no command and open a bare shell rather than failing: autostart off, an `id` no registered harness claims, and an unreadable settings store. A terminal that will not open is worse than a terminal without an agent.

`launchableHarnesses` is what the settings panel lists, by id and label. A harness with no `launch` — one Bankai can only observe, never start — is invisible there by construction.

## A harness that exits inside its shell still clears its session ref

`terminal.onExit` only fires when the *shell* dies, so it can no longer stand for "the agent is gone". Nothing was added for this: `captureSessionRefs` in `AgentActivity` already observes every live PTY each tick and emits a `clear` for one with no bound agent. Ctrl+C out of Claude and the ref is dropped within a poll, so the next app start opens the shell fresh instead of resuming a conversation that was deliberately abandoned.
