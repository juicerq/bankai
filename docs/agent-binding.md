---
title: How a shell is matched to the agent running inside it
tags: [activity, fs]
updated_at: 2026-07-27
created_at: 2026-07-27
---

## Walk up from the agent, never down from the shell

`bindShells` in `src/main/activity/SessionBinder.ts` takes the shells' PTY pids and the pids the session registry published, and for each agent reads `/proc/<pid>/stat` upwards until the parent is one of those PTY pids. The agent's own pid is checked first, so an agent that *is* the PTY root binds at zero hops.

The direction is the whole design. There are few agents and their pids are handed to us; the shell's subtree is unbounded and has to be discovered. Walking up is two `stat` reads per agent on the real chain — `claude` → the shell — and it needs nothing from the kernel beyond `ppid`. Walking down needed `CONFIG_PROC_CHILDREN` and a fallback that read `/proc/<pid>/stat` for every process on the system: 541 processes, 15.1 ms, every 1500 ms tick. Benchmark either under `node`, not `bun` — see `main-process-runtime.md`.

The only premise is that the agent is a **descendant** of the pid `TerminalSessions` recorded. That holds for every spawn model — see `pty-spawn.md`.

## The process group is not a signal

The binder used to look for the agent under the tty's foreground process group, and refused to bind when that group was the shell's own pid, reading it as "the shell is sitting at its prompt". Running the harness inside the shell (`-i -c '<cmd>; exec <shell>'`) invalidated that: `fish` starts `claude` without job control, so `claude` shares the shell's process group and the tty's foreground pgid **is** the shell's pid. Every real shell hit the refusal, nothing ever bound, and the whole activity signal — state, trace, waiting reason, elapsed clock — went silent while every test stayed green, because the tests encoded the old premise as a passing case.

Nothing in the binder reads `tpgid` any more. `procFs` lost `foreground`, `children`, `supportsChildren` and `pids` with it.

## The nearest agent to a shell wins

Two live agents can sit under one shell: an agent whose Bash tool runs `claude -p` publishes its own registry file, as a grandchild of the same PTY. `bindShells` sorts candidates by hop count and binds the closest, so the interactive session the pane belongs to wins over anything it spawned. Without that, a headless run — which publishes **no** `status` and therefore reads as idle — would flip the pane's card to "Done" in the middle of its turn. See `claude-session-registry.md`.
