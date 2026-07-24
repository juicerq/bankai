# Passive agent detection, no hooks

To show Agent activity per Shell we need to know when an agent is working, waiting on the user, or done. We decided to detect this passively — process-tree binding via `/proc` (PTY foreground pgid → agent pid), each CLI's native session registry for discovery, transcript tailing for Working/Done, and light parsing of the PTY output we already own for Needs attention — instead of installing Claude Code hooks (or equivalents) into the user's configuration. Hooks would give structured, reliable events, but they mutate configuration bankai does not own and must be kept installed and correct across every CLI and machine; passive detection observes what the CLIs already expose and degrades to "no signal" instead of breaking.

## Consequences

- Detection is Linux-only (`/proc`). On other platforms the feature must disable itself gracefully — no signal, never a crash.
- Needs attention rests on output parsing heuristics per CLI, the one signal transcripts and process state cannot provide; it may lag or miss on CLI UI changes.
- The predecessor project (`~/projects/bankai`) validated the `/proc` binding and passive discovery for claude/codex/pi, including PID-recycling guards; its model stopped at active/idle, so the attention signal is new ground.
