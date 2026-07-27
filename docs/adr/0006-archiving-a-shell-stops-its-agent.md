# Archiving a shell stops its agent instead of only filing the row

`session-archiving.md` used to state that archiving "writes a timestamp and nothing else: the terminal stays alive". With thirteen archived sessions that meant thirteen `claude` processes resident for as long as the app ran, and thirteen `claude --resume` spawns on every start. Closing the app and reopening it was the only way to get the memory back, and it cost every session.

Archiving now unmounts the shell's `TerminalPane`, which kills its PTY. The shell's session ref survives — `TerminalSessions.close` removes the session from its map before killing, so `onExit` does not read as spontaneous and does not clear the ref — so selecting the row later resumes the same agent conversation.

## What was rejected

**A persisted `hibernatedAt` field.** It would always move with `archivedAt` and never independently. Residency is derived instead, so there is no second state to keep true and no store migration.

**Letting the three-day auto-archive window put processes to sleep.** That window is evaluated against a `Date.now()` read during render and never writes anything. Wiring it to process lifetime would mean a clock killing a PTY at an arbitrary render. It stays a display rule; only `archivedAt`, which only the user's gesture writes, decides residency.

**Killing on the click.** A misclick would cost an in-flight turn. Every archived shell with an activity state gets a grace window instead.

## Consequences

- The explicit `Archive` gesture now files a row even while its agent is working. Previously activity vetoed it and the click appeared to do nothing. The three-day window keeps its veto.
- A shell with no session ref never sleeps. Killing it would destroy something nothing can restore, and a bare login shell costs little.
- The grace is one uniform ten minutes for every activity state, measured from when that state began rather than from the archiving. A turn that has already run longer than the grace is killed mid-work when archived; the conversation returns on resume but that turn's remaining work does not. A uniform rule was chosen over per-state windows because it is explainable in one sentence.
- Selecting an archived row wakes it and leaves it filed, as before, but waking is now a spawn rather than a no-op. The `RESUMING SESSION` mark covers the wait, and only appears once the wait has lasted a second.
- Hibernating loses the shell's xterm scrollback, its live terminal title, and its last output line. `claude --resume` repaints its own history; the persisted title keeps naming the row.
