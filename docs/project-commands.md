---
title: How a saved project command reaches a shell, and why it never types into one
tags: [store, terminal, ui]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## A command is a shell's launch line, not text typed into a live shell

The obvious implementation — write the command into the focused PTY and press Enter — is the one that cannot work here. In Bankai a shell almost always has a harness in it, so `bun run dev` would land in Claude's prompt as a message instead of running. The `prompt` stream message already guards that direction by *requiring* a live agent; a command needs the opposite guarantee.

So running a command opens a **new shell** whose launch line is the command. `TerminalSessions.open` reads `shell.launch` from the continuity record and hands it to `shellArgs`, which spawns `$SHELL -i -c "<command>; exec $SHELL"`. Three things follow from that:

- **No race.** Nothing waits for a PTY to attach before it can send anything. The command is part of the spawn.
- **The shell survives the command.** `exec $SHELL` runs after it, so output stays on screen and the directory is there to keep working in.
- **The command re-runs on a cold start.** After Bankai restarts the process is gone, so reopening the shell launches the command again — the same semantics harness autostart already has.

`shellLaunchLine` in `src/main/terminal/autostart.ts` owns the precedence: a saved command wins, then `plain` means launch nothing, otherwise the configured harness. A command shell is stored as `plain: true` *and* `launch: "<command>"`, so it can never also start a harness.

## The command's name is the shell's title, at user rank

`openCommandShell` stores `title` with `titleSource: "user"`. That is the highest rank in `TITLE_RANK`, so the session namer can never rename a command shell — the sidebar keeps saying "Dev server" instead of a summary of output the model read.

## Commands live in their own store, keyed by project

`commands.json` (`src/main/store/commands.ts`) holds a flat list of `{ id, projectId, label, command, createdAt }`. It is a sibling store rather than a field on `projects.json` because the two change at very different rates, and `Store` rewrites the whole file on every mutation.

`projects.remove` calls `ProjectCommands.purgeProject` alongside `Continuity.purgeProject`. A project removed from the list takes its commands with it.

## Where it is in the UI

`Ctrl+X C`, or the terminal glyph in the workspace header, opens the commands palette for the **active** project. Filter matches the name and the command line. `Enter` runs the highlighted one; the pencil and trash on a row edit and delete it; `NEW COMMAND` swaps the palette body for the editor.
