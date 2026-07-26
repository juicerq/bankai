---
title: What a Claude transcript holds, and what has to be filtered out of it
tags: [activity]
updated_at: 2026-07-26
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

## A resumed session opens mid-conversation

A transcript created by resuming does not replay the original history, so its first user message is an answer, not a subject — the survey turned up titles like `"ok, concordo."`, `"1 - ótimo. 2 - ok. 3 - sim mas 6."` and `"[Request interrupted by user]"`. Anything derived from the opening of a transcript must account for the session possibly not starting at the beginning.
