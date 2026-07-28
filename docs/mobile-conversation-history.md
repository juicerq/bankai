---
title: How the phone reads a conversation and why pulling older history re-reads the whole window
tags: [ui, activity]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## The tail opens at a byte offset, not at a message

`ConversationTail` backfills the last `CONVERSATION_BACKFILL_BYTES` of the JSONL, cut forward to the next line boundary, and reports where it started as `startOffset` plus `atStart`. That offset is the phone's cursor: it is the only thing it may ask for older history with, and a request whose `before` no longer equals the watch's current `startOffset` is dropped instead of served — after any restart of the watch the cursor is stale by definition.

## The parser is sequential, so history is a reset and not a page

`ConversationParser` carries state across lines: a tool row is labelled from the `tool_use` that preceded it, agent text and reasoning accumulate per `message.id`. A window parsed in isolation therefore strands every tool result whose call sits above it. Pulling older history re-opens the file at a lower offset, re-reads to the end, and pushes a whole `reset` — never a partial page prepended to what the client already has.

Each pull steps back one backfill window at a time, up to `CONVERSATION_HISTORY_STEPS`, until the first block id changes or the file starts. Comparing the first block's id is what detects "this step yielded nothing new"; block counts cannot be used, because the live end of the file keeps growing while the step runs.

## A block id is a slot, and the backfill collapses onto it

`ConversationParser` emits a tool twice — `running` from the `tool_use`, then `done`/`failed` from the `tool_result` — under the same block id, because a block id is a slot to be overwritten and not an append. The live path already merges by id (`mergeConversationBlocks`), so the backfill merges too instead of pushing: a call and its result read inside the same window are one settled step, not two rows. Anything that assembles blocks outside those two paths has to merge as well, or the reader sees every finished tool listed twice.

## One watch per address, and a subagent is an address

A watch is keyed by connection, shell and optional agent (`${connection.id} ${shellId} ${agent ?? ""}`), so a shell and a subagent opened from inside it are two independent tails over two files. Every `reset`/`appended` event echoes the address back, and the client ignores any event whose address is not exactly its own — matching on `shellId` alone would feed a subagent's blocks into the parent screen.
