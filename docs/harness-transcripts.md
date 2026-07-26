---
title: What a harness transcript can and cannot tell us about a session, and which title sources are dead
tags: [activity, terminal]
updated_at: 2026-07-26
created_at: 2026-07-25
---

## Claude writes no summary record any more

`"type":"summary"` does not appear in a single one of the 1230 transcripts under `~/.claude/projects/` on this machine. Whatever version wrote that record, it is not the one in use. Anything that wants a one-line description of a Claude session has to derive it from the messages.

## The first user message of a Claude transcript is usually not the user's intent

Several families of block reach the transcript as `type: "user"` records without a human having written them, and they dominate the opening lines. `NOISE_PREFIXES` in `src/main/activity/claudeTranscript.ts` is the live list:

- `<local-command-caveat>`, `<command-name>`, `<command-message>`, `<command-args>`, `<local-command-stdout>`
- `<system-reminder>`, `<task-notification>`, `<skill …>`
- `Caveat:` and `Base directory for this skill: …` — the bodies a slash command injects
- `Another Claude session sent a message: …`
- the compaction and continuation preambles, which open a resumed transcript with the whole previous summary
- `[Request interrupted by user]` and image-only content
- any record carrying `isMeta: true`

`message.content` is either a plain string or a list of blocks; only `{type: "text"}` blocks hold user text, and a `tool_result` or an unknown block type is skipped.

Filtering those and taking the first remaining message yields, over 150 recent transcripts: 81% usable intent, 7% junk too short to identify anything (`oi`, `concordo.`), 11% no user message at all. This filter is a **list, not a rule** — it is third-party format, so a new block type degrades the result silently rather than failing.

## The tail of a Claude transcript says what the agent is doing right now

`src/main/activity/claudeTrace.ts` reads the last 64KB of the transcript, scans backwards for the newest `type: "assistant"` record, and takes its newest content block. Three block types carry the answer: `thinking`, `text`, and `tool_use` with a `name`. Over 7427 assistant records on this machine, no other block type appeared.

The tool name is mapped to a family — `Bash` is "Running commands", `Read`/`Grep`/`Glob`/`Find`/`Ls` are "Exploring", `Edit`/`Write` are "Editing files". An MCP tool arrives as `mcp__<server>__<tool>`, so only the segment after the last `__` is matched. An unmapped tool falls back to its own bare name rather than to nothing, so a tool Claude adds later degrades to a readable label instead of a blank card.

Records the tail must be skipped over, in order of how often they appear: `attachment`, `last-prompt`, `mode`, `ai-title`, `system`, `permission-mode`, `file-history-snapshot`, `file-history-delta`, `queue-operation`, `worktree-state`, `relocated`, `pr-link`. They are ~40% of the lines and none of them describes the agent.

A pasted image writes an `attachment` record that can exceed the whole 64KB window on its own. That is survivable because the agent's reply is written *after* it, so scanning from the end reaches the assistant record first; the only cost is a tick with no trace while the attachment is the newest line.

## The transcript goes silent for the whole of a compaction

A compaction writes exactly one record, `{"type":"system","subtype":"compact_boundary"}`, and it lands when the compaction is **over** — its own `compactMetadata.durationMs` was 148s in the sample measured on this machine. Nothing marks the start. So for those minutes the newest assistant record is still whatever the agent did last, and a transcript-derived trace shows a stale label ("Running commands") for the entire compaction.

That is why "Compacting" is scraped from the PTY instead: `matchesCompactionNotice` in `src/main/activity/compaction.ts` looks for the spinner message the harness paints, `Compacting conversation`. `compactMetadata.trigger` distinguishes `auto` from `manual` after the fact, but the spinner is the same for both, so the label is too.

The same silence is what ends it. The newest assistant record cannot change while the transcript is frozen, so its `uuid` — carried as `recordId` on `HarnessTrace`, present on all 46407 assistant records on this machine — is a free "has the agent moved?" bit: it holds "Compacting" for the whole compaction and drops it the moment the agent writes again. `uuid` is optional in the schema and falls back to the label, so a version that stops writing it costs the compaction's precision, never the trace itself.

The boundary record is worth nothing as a live signal, and it is a bad end marker too — the summary written right after it is large enough to push it out of the 64KB tail within a tick. It is still the only place the compaction is described at all: read it if you ever need pre/post token counts or which messages survived.

## The transcript folder is the working directory with its punctuation flattened

`~/.claude/projects/<slug>/<sessionId>.jsonl`, where the slug is the session's `cwd` with every `/` and `.` replaced by `-`: `/home/jui/app/.claude-worktrees/x` becomes `-home-jui-app--claude-worktrees-x`. Verified against every project folder on this machine. A missing folder or file is not an error — it just means no title.

## A resumed Claude session opens mid-conversation

A transcript created by resuming does not replay the original history, so its first user message is an answer, not a subject — the survey turned up titles like `"ok, concordo."`, `"1 - ótimo. 2 - ok. 3 - sim mas 6."` and `"[Request interrupted by user]"`. Anything derived from the opening of a transcript must account for the session possibly not starting at the beginning.

## Codex publishes a session index with a ready-made name

`~/.codex/session_index.jsonl` holds one line per session: `{ id, thread_name, updated_at }`, with `thread_name` already a human-readable title (`"Adaptar setup do Claude Code"`). Keyed by the same `sessionId` the continuity store persists, so it is a lookup rather than a scan. It is also live — `thread_name` follows the thread as it evolves.

## The claude binary emits no terminal title

There is no OSC 0/2 sequence anywhere in the shipped `claude` executable, so sniffing the PTY stream for a window title identifies plain shells only, never an agent session.

## A shell's OSC title is user configuration, not a contract

What a plain shell puts in its terminal title comes from the user's own shell config. `fish_title` as shipped with the `pure` theme emits `<folder>: <last command> ❯ <current command>` — so a shell running `bun run dev` announces `bankai-2: bun run dev ❯ fish`, not `dev`. Parsing a command out of that string works against one theme and breaks silently against the next.

## The terminal data buffer is not scrollback

`src/main/terminal/TerminalDataBuffer.ts` coalesces PTY writes on an 8ms flush timer and keeps nothing. Any "last output line" exists only in memory, only while the PTY is live, and is gone after a restart — it can decorate a live session, never identify a cold one.
