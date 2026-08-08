# Sessions are named by the agent CLI, at turn milestones

Superseded by ADR-0012: Claude Code now publishes the name itself, so bankai reads it instead of paying an LLM for one.

A session's name was the first non-noise user message in its transcript, stamped once at the first turn and never revisited. `claude-transcript-format.md` measured what that costs: 7% of sessions get junk too short to identify anything, 11% have no user message at all, and every resumed transcript opens mid-conversation, so its "first" message is an answer rather than a subject. Bankai now derives the name with an LLM instead, run as a headless call to the same agent CLI the session belongs to, and reconsiders it at turn milestones rather than once.

## What was rejected

**An API key and an HTTP client.** It would be the only network dependency in the main process, plus a settings screen and a bill separate from the subscription the user already pays. The agent CLI is a hard dependency already — it is the harness's `launch` — so `claude -p --model haiku` costs no new dependency and no new credential. The price is 7.2s per name and 304 MB of transient RSS, both measured.

**Naming every harness with the LLM.** Codex publishes `thread_name` in `~/.codex/session_index.jsonl`, human-readable and already following the thread as it evolves, keyed by the same `sessionId` continuity persists. A published name of the conversation's content wins over one we pay to generate. Claude publishes `name` too, but with `nameSource: "derived"` it is the cwd basename plus a counter — which the card already shows as the project. Only `auto` and `user` are worth reading.

**Renaming on every turn.** The name is what the user aims at in the list; one that changes under the pointer stops being a landmark. Milestones at 3, 10, 30 and 100 turns give about four names across a long session, and how many times a shell has been named is persisted so the ladder does not restart on every app launch.

**Counting user messages in the transcript to place the milestones.** Across the 1292 transcripts on the author's machine the p90 is 1.6 MB and the p99 is 13 MB; reparsing that every turn scales with the session. `AgentActivity` already observes turn starts, so turns are counted in memory for free, and the transcript is read only when a milestone fires — a few hundred milliseconds against 7.2s of model time in the same operation.

## Consequences

- The name now has an origin. A name the user typed is final and the LLM never touches it again, which needs a field the store did not have; the eight shells that exist when this lands carry first-message names and none was renamed by hand, so they all enter as derived.
- The naming call runs with `--no-session-persistence`, so it writes nothing to `~/.claude/sessions/` and never appears as a phantom presence in harness discovery. That is stronger than relying on `bindShells` failing to attach it to a PTY.
- A resumed session starts counting turns again and is renamed after three. That is deliberate: resuming is exactly where the old title was most often wrong.
- Startup never renames anything. A name already in the store is kept as-is, so reopening with eight sessions spawns nothing.
- Two sessions can end up with the same name. Uniqueness is not enforced — the card already separates them by project and branch, and forcing a tiebreak only produces a worse name.
