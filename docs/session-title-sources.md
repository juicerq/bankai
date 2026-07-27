---
title: Which sources can name a session, and which ones are dead
tags: [activity, terminal, store]
updated_at: 2026-07-27
created_at: 2026-07-25
---

The live source for a Claude session is its transcript, and what can be pulled out of one is in `claude-transcript-format.md`. How the sources are ranked once found is in `session-naming.md`. The rest of the candidates are below; most of them do not work.

## Claude's own session name is the working directory, not the conversation

`~/.claude/sessions/<pid>.json` publishes `name` and `nameSource`, but every interactive session reports `nameSource: "derived"` and a name built from the cwd basename plus a counter — `bankai-2-94`, `app-04`. It identifies nothing the card does not already show. `"user"` appears when the session was started with `claude -n <name>`, and `"auto"` is written by Claude Code's own LLM namer, which only runs for background jobs. See `session-naming.md`.

## Codex publishes a session index with a ready-made name

`~/.codex/session_index.jsonl` holds one line per session: `{ id, thread_name, updated_at }`, with `thread_name` already a human-readable title (`"Adaptar setup do Claude Code"`). Keyed by the same `sessionId` the continuity store persists, so it is a lookup rather than a scan. It is also live — `thread_name` follows the thread as it evolves.

## The claude binary emits no terminal title

There is no OSC 0/2 sequence anywhere in the shipped `claude` executable, so sniffing the PTY stream for a window title identifies plain shells only, never an agent session.

## A shell's OSC title is user configuration, not a contract

What a plain shell puts in its terminal title comes from the user's own shell config. `fish_title` as shipped with the `pure` theme emits `<folder>: <last command> ❯ <current command>` — so a shell running `bun run dev` announces `bankai-2: bun run dev ❯ fish`, not `dev`. Parsing a command out of that string works against one theme and breaks silently against the next.

## The terminal data buffer is not scrollback

`src/main/terminal/TerminalDataBuffer.ts` coalesces PTY writes on an 8ms flush timer and keeps nothing. Any "last output line" exists only in memory, only while the PTY is live, and is gone after a restart — it can decorate a live session, never identify a cold one.
