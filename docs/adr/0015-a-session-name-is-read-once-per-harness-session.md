# A session name is read once per harness session

Amends ADR-0012, which had Bankai take the harness's latest published title and reapply it on every naming pass. `AgentActivity` names on every event pass, every session-ref change and every turn transition, so the card's name tracked whatever `Harness.title` answered at that instant — for a long session that is dozens of reads a turn, each one able to move the name under the pointer. ADR-0008 named the cost of that already: a name that changes while the user is aiming at it stops being a landmark.

The shell now records which harness session its name came from, in `titleSessionId`. `ShellFacts` skips the read when that id matches the session bound to the shell, so a title is read once per harness session and nothing published later for the same session replaces it — not a regenerated `ai-title`, not a Codex thread renamed mid-conversation. The read itself is skipped, not just the write, so a bound session costs no transcript tail after its first name.

A shell that binds a different session id is named again, which is the case ADR-0012 wanted: a resumed conversation, a `/clear`, a second agent started in the same shell. Renaming by hand still wins over both, by rank, and a shell whose harness has not published a title yet keeps its branch fallback until one appears.

The field is additive on store v10: a shell named before this lands carries no `titleSessionId`, so it takes one more harness title and freezes on that one.
