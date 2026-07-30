---
title: Which sources can name a session, and which ones are dead
tags: [activity, terminal, store]
updated_at: 2026-07-30
created_at: 2026-07-25
---

The live source for a Claude session is its transcript, and what can be pulled out of one is in `claude-transcript-format.md`. How the sources are ranked once found is in `session-naming.md`. The rest of the candidates are below; most of them do not work.

## Claude's own session name is the working directory, not the conversation

`~/.claude/sessions/<pid>.json` publishes `name` and `nameSource`, but every interactive session reports `nameSource: "derived"` and a name built from the cwd basename plus a counter — `bankai-2-94`, `app-04`. It identifies nothing the card does not already show. `"user"` appears when the session was started with `claude -n <name>`, and `"auto"` is written by Claude Code's own LLM namer, which only runs for background jobs. See `session-naming.md`.

## Codex's session index is not a live source

`~/.codex/session_index.jsonl` carries `{ id, thread_name, updated_at }`, but Codex 0.146.0 does not keep it complete or current. The file sampled on this machine repeats IDs as names change and omits the active session plus newer rollouts. It can supply a fallback name by taking the last entry for an ID, never establish that a session has no name and never stand as the only naming source.

## The claude binary emits no terminal title

There is no OSC 0/2 sequence anywhere in the shipped `claude` executable, so sniffing the PTY stream for a window title identifies plain shells only, never an agent session.

## A shell's OSC title is user configuration, not a contract

What a plain shell puts in its terminal title comes from the user's own shell config. `fish_title` as shipped with the `pure` theme emits `<folder>: <last command> ❯ <current command>` — so a shell running `bun run dev` announces `bankai-2: bun run dev ❯ fish`, not `dev`. Parsing a command out of that string works against one theme and breaks silently against the next.

## The terminal data buffer is not scrollback

`src/main/terminal/TerminalDataBuffer.ts` coalesces PTY writes on an 8ms flush timer and keeps nothing. Any "last output line" exists only in memory, only while the PTY is live, and is gone after a restart — it can decorate a live session, never identify a cold one.
