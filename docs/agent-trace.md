---
title: How the trace line knows what an agent is doing right now
tags: [activity, terminal]
updated_at: 2026-07-26
created_at: 2026-07-25
---

## The tail of a Claude transcript says what the agent is doing

`src/main/activity/claudeTrace.ts` reads the last 64KB of the transcript, scans backwards for the newest `type: "assistant"` record, and takes its newest content block. Three block types carry the answer: `thinking`, `text`, and `tool_use` with a `name`. Over 7427 assistant records on this machine, no other block type appeared.

The tool name is mapped to a family — `Bash` is "Running commands", `Read`/`Grep`/`Glob`/`Find`/`Ls` are "Exploring", `Edit`/`Write` are "Editing files". An MCP tool arrives as `mcp__<server>__<tool>`, so only the segment after the last `__` is matched. An unmapped tool falls back to its own bare name rather than to nothing, so a tool Claude adds later degrades to a readable label instead of a blank card.

Records the tail must be skipped over, in order of how often they appear: `attachment`, `last-prompt`, `mode`, `ai-title`, `system`, `permission-mode`, `file-history-snapshot`, `file-history-delta`, `queue-operation`, `worktree-state`, `relocated`, `pr-link`. They are ~40% of the lines and none of them describes the agent.

A pasted image writes an `attachment` record that can exceed the whole 64KB window on its own. That is survivable because the agent's reply is written *after* it, so scanning from the end reaches the assistant record first; the only cost is a tick with no trace while the attachment is the newest line.

## The transcript goes silent for the whole of a compaction

A compaction writes exactly one record, `{"type":"system","subtype":"compact_boundary"}`, and it lands when the compaction is **over** — its own `compactMetadata.durationMs` was 148s in the sample measured on this machine. Nothing marks the start. So for those minutes the newest assistant record is still whatever the agent did last, and a transcript-derived trace shows a stale label ("Running commands") for the entire compaction.

That is why "Compacting" is scraped from the PTY instead: `matchesCompactionNotice` in `src/main/activity/compaction.ts` looks for the spinner message the harness paints, `Compacting conversation`. `compactMetadata.trigger` distinguishes `auto` from `manual` after the fact, but the spinner is the same for both, so the label is too.

The same silence is what ends it. The newest assistant record cannot change while the transcript is frozen, so its `uuid` — carried as `recordId` on `HarnessTrace`, present on all 46407 assistant records on this machine — is a free "has the agent moved?" bit: it holds "Compacting" for the whole compaction and drops it the moment the agent writes again. `uuid` is optional in the schema and falls back to the label, so a version that stops writing it costs the compaction's precision, never the trace itself.

The boundary record is worth nothing as a live signal, and it is a bad end marker too — the summary written right after it is large enough to push it out of the 64KB tail within a tick. It is still the only place the compaction is described at all: read it if you ever need pre/post token counts or which messages survived.
