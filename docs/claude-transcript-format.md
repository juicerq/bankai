---
title: What a Claude transcript holds, and what has to be filtered out of it
tags: [activity]
updated_at: 2026-07-28
created_at: 2026-07-25
---

## The transcript folder is the working directory with its punctuation flattened

`~/.claude/projects/<slug>/<sessionId>.jsonl`, where the slug is the session's `cwd` with every `/` and `.` replaced by `-`: `/home/jui/app/.claude-worktrees/x` becomes `-home-jui-app--claude-worktrees-x`. Verified against every project folder on this machine. A missing folder or file is not an error — it just means no title.

## Claude writes no summary record any more

`"type":"summary"` does not appear in a single one of the 1230 transcripts under `~/.claude/projects/` on this machine. Whatever version wrote that record, it is not the one in use. Anything that wants a one-line description of a Claude session has to derive it from the messages.

## The first user message is usually not the user's intent

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

## Reasoning is its own block, and one message can hold two of them

Over the transcripts on this machine every `{type: "thinking"}` block carries exactly `{signature, thinking, type}` — `thinking` is the text, `signature` is opaque and useless to a reader. An assistant record holds at most two of them, and consecutive records can share one `message.id`, so a reader that keys reasoning by `message.id` has to append rather than replace (this is what `ConversationParser` does, same as it does for agent text).

## How many lines an edit moved is only in `toolUseResult`, and its shape depends on the tool

The `tool_result` block itself carries the tool's stdout, never the diff. The sibling `toolUseResult` field on the same `user` record carries it, in three shapes:

- an `Edit` result has **no** `type` field and carries `filePath`, `oldString`, `newString` and a real `structuredPatch`
- `type: "update"` (MultiEdit and friends) also carries a real `structuredPatch`
- `type: "create"` (a `Write` of a new file) always carries an **empty** `structuredPatch` plus the whole `content`

So counting `+`/`-` lines in the patch is right for the first two and yields `0/0` for a creation; the honest count there is the line count of `content`. Anything else — a Bash result, a Read result — validates against neither and simply has no counts.

## Resuming appends to the same file, and no transcript points at another

Measured on 2.1.220, both headless (`claude -p --resume <id>`) and through the TUI: resuming a session appends to `<sessionId>.jsonl` and creates no second file. One file therefore holds a whole conversation, and reading it from byte zero reaches the real beginning of it.

Older transcripts on this machine do open mid-conversation — a survey of their first user message turned up answers rather than subjects (`"ok, concordo."`, `"1 - ótimo. 2 - ok. 3 - sim mas 6."`, `"[Request interrupted by user]"`), so anything derived from the opening of a *stored* transcript still has to tolerate a file that starts in the middle.

There is no link to a predecessor either way. Across the 568 transcripts here, the first `user`/`assistant` record has no `parentUuid` in 548 of them and a parent inside its own file in the other 10 — never a uuid living in another file. `leafUuid` on a `last-prompt` record names a message, not a session. So a reader that runs out of file has nowhere else to go, and honest copy is "the beginning of this transcript".
