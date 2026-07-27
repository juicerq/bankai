---
title: Why every PTY is the user's login shell with the harness inside it
tags: [terminal]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## The shell is the process; the harness is its child

`spawnSession` in `src/main/terminal/TerminalSessions.ts` always spawns `process.env.SHELL`. Both ways of starting an agent — autostart from settings and resume of a stored session — produce a command line, and `shellArgs` turns it into `-i -c "<command>; exec <shell>"`. With no command the shell gets no arguments at all.

`-i` makes the shell read its rc, which is the whole reason the harness runs through a shell. `exec` replaces the `-c` shell in place once the harness exits, so the pane becomes an ordinary interactive shell with no extra process left over.

Nothing spawns `claude` as the PTY's root process any more. Two things follow from that, and both are the point:

- quitting the agent with Ctrl+C twice leaves the shell running, so the pane becomes a plain terminal instead of printing `[process exited 0]`
- the command is resolved by the user's own interactive shell, so a `claude` installed by a version manager configured in `.zshrc` is found. Spawning it directly resolved against the Electron process env, which inherits from the desktop session and not from any rc file.

The harness is a **child** of the pid `TerminalSessions` records, and it is in the shell's own process group — the shell starts it without job control, so the tty's foreground pgid is the shell's pid, not the harness's. Anything that identifies the agent from process state depends on the first fact and must not depend on the second; `agent-binding.md` records what that cost once.

Arguments are quoted by `shellCommandLine` in `src/main/terminal/commandLine.ts`, and so is the shell path in the `exec`. Anything outside `[A-Za-z0-9_@%+=:,./-]` is single-quoted, because the shell parses this string and a bare `;` would be syntax.

## Do not type the command into the PTY — the tty echoes it twice

The obvious alternative is to spawn a bare shell and write `claude\r` into the PTY. It works, and it looks broken: the tty is still in canonical mode with ECHO on, so the kernel prints the raw bytes, and then the shell's line editor reads the buffered line and draws it again under the prompt. The user sees `claude` twice, once above the prompt with no prompt attached to it. Waiting for a quiet window before typing only trades that for a timing heuristic.

Measured with node-pty against fish 4.8, bash and zsh: `-i -c '<cmd>; exec "$SHELL"'` runs the command, prints no echo before the prompt, and leaves a working interactive shell behind in all three.

The trap when measuring any of this is that it needs a faithful terminal on the other end. Fish opens by querying the terminal — kitty keyboard protocol (`\e[?u`), XTVERSION (`\e[>0q`), background colour (OSC 11), XTGETTCAP (`\eP+q…`), primary DA (`\e[0c`) — and blocks until it gets answers. A probe harness that only reads and never replies leaves fish stuck before its first prompt, which reads exactly like "fish discards early input". It does not. xterm.js answers those queries, so the app never sees this; only a hand-rolled node-pty probe does.
