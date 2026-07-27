---
title: How the trace line knows what an agent is doing right now
tags: [activity, terminal]
updated_at: 2026-07-27
created_at: 2026-07-25
---

## The tail of a Claude transcript says what the agent is doing

`src/main/activity/claudeTrace.ts` reads the last 64KB of the transcript, scans backwards for the newest record that is one side of the turn — `type: "assistant"` or `type: "user"` — and reads it. An `assistant` record gives its newest content block; three block types carry the answer: `thinking`, `text`, and `tool_use` with a `name`. Over 7427 assistant records on this machine, no other block type appeared.

A `user` record means the turn was just handed back to the agent — a human prompt, or a `tool_result` — and nothing has been written since, so it reads as "Thinking".

The label names what the tool is being used **on**, read from the block's `input`: `Editing session-rows.ts`, `Grepping tool_use`, `Loading code-standards`, `Fetching arktype.io`. `TOOL_SUBJECT` holds the verb and which input keys carry the subject; the key itself decides the shape, so `file_path` and `path` are reduced to a basename and `url` to a host without a per-tool rule. An MCP tool arrives as `mcp__<server>__<tool>`, so only the segment after the last `__` is matched.

Two fallbacks sit under that, and both matter. A tool with no subject in its input falls back to a family — `Bash` is "Running commands", `Read`/`Grep`/`Glob`/`Find`/`Ls` are "Exploring", `Edit`/`Write` are "Editing files". A tool in no family falls back to its own bare name, so a tool Claude adds later degrades to a readable label instead of a blank card. Measured over 6638 labels from this machine's transcripts, 1% land on a family label and none on a bare name.

`Bash` is 47% of all tool calls and is the one tool read from two keys. Its `description` wins over its `command`: it is authored to be read, it is present on 90% of calls, and its median length is 29 characters — the command's median is a pipeline that truncates into noise. Without a description the command is cut at the first shell operator, after dropping a leading `cd … &&`, and if that cut leaves a quote hanging open the dangling fragment goes with it (`grep -rn "ozone\|swiftshader" src` reads as `grep -rn`).

The whole label is capped at `LABEL_CAP` **after** shaping, never before: capping a path first and taking its basename second yields a card that says `Reading …`. A subject with no letter or digit in it is not a subject — `: > /tmp/probe.log` cut down to `:` — and falls back to the family, the same readability rule `outputLine` applies to scraped PTY text.

Records the tail must be skipped over, in order of how often they appear: `attachment`, `last-prompt`, `mode`, `ai-title`, `system`, `permission-mode`, `file-history-snapshot`, `file-history-delta`, `queue-operation`, `worktree-state`, `relocated`, `pr-link`. They are ~40% of the lines and none of them describes the agent.

A pasted image writes an `attachment` record that can exceed the whole 64KB window on its own. That is survivable because the agent's reply is written *after* it, so scanning from the end reaches the assistant record first; the only cost is a tick with no trace while the attachment is the newest line.

## The fresher of the two sources wins, and no flag says which

`claudeTrace` in `src/main/activity/claudeTraceSource.ts` reads the spool and the transcript at once and returns whichever carries the newer moment. That single comparison is the whole fallback rule: the hook fires 5–8ms after the record it mirrors, so while the source is installed the event always wins, and the transcript can only win once events have stopped. An uninstalled hook, a session that predates installation, and a stale spool all land on the transcript with no mode to configure and no state to get wrong.

`PreToolUse` names the tool, running `toolTrace` over `tool_input` — a hook-fed `Read` and a transcript-fed `Read` produce the same string, because the payload's `tool_input` has the same shape as a `tool_use` block's `input`. `UserPromptSubmit` and `PostToolUse` both read as "Thinking": a completion must not name the tool, or a call that returned in 20ms would paint a label nobody can read. `Stop` yields no label at all — the end of a turn is "Done", and that comes from the registry's status, not from the trace.

## A hook-fed label needs a floor, or it is correct and unreadable

Tools completed 10–30ms after they started in the measured turn, and two of four labels would have lived under half a second. `TraceDwell` holds each label `TRACE_DWELL_MS` before letting the next one take its place; labels arriving faster than that queue in order and drain, and the last label of a burst is always the one left on screen. The queue is capped at `TRACE_QUEUE_CAP`, dropping the middle of a long burst rather than falling seconds behind what the agent is doing.

The floor decides when a label is *shown*, never what its `since` is: a label held back still counts from the moment its event happened, so it appears already aged. A waiting reason and "Compacting" bypass the queue — a state the user has to act on is never delayed.

## A spool write wakes the tick; the interval stays as the floor

`AgentActivity` watches the spool directory and runs a pass on write, throttled to `SPOOL_PASS_MS` — the first event of a burst is acted on immediately and the rest coalesce into one trailing pass. Running faster would buy nothing, since a label cannot change on screen more often than the dwell floor anyway.

An event-driven pass holds the worktree map it already had instead of looking it up, so a cold Git call can never delay a label. The periodic pass keeps everything it always did: it is what notices a session dying, a status edge with no event behind it, and a harness that publishes nothing.

## A transcript is a log, so it is always one block behind

A record is written when its block **completes**. There is no record for "a block is being produced". So while the agent thinks, the newest record is whatever finished before it — which is why a card built only from the transcript said "Writing" for the whole of a thinking phase: the last thing written was the previous turn's reply. Reading `user` records closes that particular hole, but the structure remains: the transcript can only ever name a finished block.

It is also late. Measured on this machine, a record becomes visible on disk after its own timestamp by 0.24s at p50, consistently 3.2–3.3s for an `assistant` record whose block is a `tool_use`, and 8.09s at the worst sample. So the moment bankai *reads* a record says nothing about when the agent did it; only the record's own `timestamp` does. For the live state of the session — is it alive, is it waiting — the registry is the source, not this file: see `claude-session-registry.md`.

## The number beside the label counts from the record that produced the label

`recordTrace` carries the record's own `timestamp` out as `since`, and `sessionTraces` in `src/main/activity/AgentActivity.ts` anchors the card's elapsed clock to it. Anchoring on the observation instead would hide the whole read delay above: a `tool_use` seen 3s late would render `0s` and count from there.

The anchor moves when the **label** changes, never when the record does. The same label legitimately spans several records — `Thinking` is produced first by the `tool_result` record and then by the `thinking` block written after it — and restarting on each one understated one measured thought by 43s. The cost is that two consecutive `Bash` calls with no readable subject both read `Running commands` and count as one span; that is the intended reading, since the label is what the number measures.

Three labels have no record behind them and keep their own anchor: a waiting reason counts from the registry's status edge, `Compacting` from the tick that scraped the notice, and `Done` from the end of the turn (`sessionSince` in `session-rows.ts` picks the status stamp for `done-unseen`). A record whose timestamp is missing or unparseable still yields a trace and falls back to the observing tick — no record on this machine has ever needed it, across 38509 sampled.

## "Thinking" is the label for a block being streamed, not only for a thinking block

Because a record lands when its block finishes, the whole time the model spends *streaming* the next `tool_use` is time whose newest record is still the previous `tool_result` — and that reads as "Thinking". Measured over 120 recent transcripts, 9520 such spans totalling 74738s: 59% of that time the next record really is a `thinking` block, 11% the turn was already over and the session idle, and ~24% the model was composing a tool call. That last slice is short at the median — `Bash` 2.5s, `Edit` 3.9s, `Read` 1.8s — and only bites on a large `Write` (p50 8.7s, p90 19.2s) or a long batch. A rule reading the transcript alone cannot shrink it; only a source that leads the log can, and the harness spinner is the candidate: it carries a `thinking with high effort` suffix while a thinking block streams and drops it otherwise.

## A parallel tool batch reaches the transcript fully serialized

The model emits N `tool_use` blocks in one message and the tools run concurrently, but the file gets `tool_use A, tool_result A, tool_use B, tool_result B, …` — one result per `user` record, never two, verified over 9706 result records. Every parallel batch on this machine writes in that shape. So the transcript never shows "A returned while B is still running": there is no outstanding-tool state to read out of it, and a rule that tries to track unresolved `tool_use` ids to correct the label finds nothing to correct.

## The transcript goes silent for the whole of a compaction

A compaction writes exactly one record, `{"type":"system","subtype":"compact_boundary"}`, and it lands when the compaction is **over** — its own `compactMetadata.durationMs` was 148s in the sample measured on this machine. Nothing marks the start. So for those minutes the newest assistant record is still whatever the agent did last, and a transcript-derived trace shows a stale label ("Running commands") for the entire compaction.

That is why "Compacting" is scraped from the PTY instead: `matchesCompactionNotice` in `src/main/activity/compaction.ts` looks for the spinner message the harness paints, `Compacting conversation`. `compactMetadata.trigger` distinguishes `auto` from `manual` after the fact, but the spinner is the same for both, so the label is too.

The same silence is what ends it. The newest assistant record cannot change while the transcript is frozen, so its `uuid` — carried as `recordId` on `HarnessTrace`, present on all 46407 assistant records on this machine — is a free "has the agent moved?" bit: it holds "Compacting" for the whole compaction and drops it the moment the agent writes again. `uuid` is optional in the schema and falls back to the label, so a version that stops writing it costs the compaction's precision, never the trace itself.

The boundary record is worth nothing as a live signal, and it is a bad end marker too — the summary written right after it is large enough to push it out of the 64KB tail within a tick. It is still the only place the compaction is described at all: read it if you ever need pre/post token counts or which messages survived.
