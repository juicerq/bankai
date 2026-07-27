---
title: How a session gets its name, and what decides when the name changes
tags: [naming, continuity, activity]
updated_at: 2026-07-27
created_at: 2026-07-27
---

## Four sources, ranked, and the user always wins

`shell.titleSource` records where the name in `shell.title` came from, and `ContinuityReducers.nameShell` refuses any write whose rank is lower than the stored one. The ranks are `user` 3, `published` 2, `model` 1, and absent 0 — absent being a name the old first-message stamping left behind, which every other source may replace.

`renameShell` is the only writer of `user`, so a name typed by hand is permanent: `namingDue` refuses to run the model against it, `stampShell` refuses to apply a published name over it, and the reducer refuses the write even if both were wrong. Three layers for one rule, because the outer two save a subprocess and the innermost one is what makes a rename landing mid-call still win.

## The registry's `name` is only worth reading for two of its sources

`~/.claude/sessions/<pid>.json` carries `name` and `nameSource`. `derived` is the cwd's basename plus a counter (`bankai-2-94`) — the card already shows the project, so it is dropped at the schema boundary in `claude.ts` and never becomes a presence field. Only `auto` and `user` become `publishedName`.

`user` is what `claude -n <name>` writes. `auto` is written by Claude Code's own LLM namer, which exists — its telemetry key is `job_name` and its output is in `~/.claude/jobs/*/state.json`, with names like `"Filtros de NF-e com select de 3 opções"` — but it only runs for background jobs. No interactive session on this machine has ever published `auto`. The branch is kept because it costs one set entry and pays for itself the day that changes.

## Milestones are counted in turns, and two counters decide them

`namingDue` fires when `turns >= NAMING_MILESTONES.at(max(attempts, namings))`. The two counters answer different questions and both are needed:

- `namings` is persisted on the shell and counts names actually written. It is what keeps the ladder from restarting at 3 every time Bankai launches.
- `attempts` is in memory and counts calls made, successful or not. Without it a rejected name would leave `namings` unmoved, the threshold would stay where it was, and every following turn would re-fire the model.

Turn counts themselves are in memory and reset with the app, so a resumed session is renamed again after three fresh turns. That is deliberate: resuming is where the first-message name was most often an answer rather than a subject.

`noteTurn` re-checks the in-memory floor before touching the store, because `Continuity.findShell` and `Settings.get` both re-read and re-validate their whole file — there is no cache — and a turn start already pays for one of those in `stampShell`.

## The name contract checks shape, never wording

`acceptedName` collapses whitespace, strips surrounding quotes and trailing punctuation, and rejects only what is empty or past `NAME_MAX_CHARS`. It deliberately judges nothing about the words themselves.

An earlier version carried two blocklists — generic verb labels (`fix`, `ajuste`) and conversational openers (`ok`, `here's`, `não entendi`) — and a `NAME_MAX_WORDS` of 5. All three were the same mistake. The blocklists were written in English and Portuguese, so a session in any third language had no filter at all; the word count taxed every language that spends words on particles, and it was what rejected `"Revisão e melhorias de sessão CLI"` — 33 characters, six words, a perfectly good name. A weak name is evidence the prompt failed, and no downstream string match repairs that. The milestone ladder does: a weak name at turn 3 is replaced at turn 10 with more of the conversation behind it. Rejecting instead leaves the card with no name, which is worse than a mediocre one.

## What the prompt asks for is not what the contract refuses

`NAME_TARGET_CHARS` is 40 and goes in the prompt; `NAME_MAX_CHARS` is 60 and is the only thing that rejects. They were one constant at 40, and against seven real transcripts that threw away two good names for overshooting by two characters each — 29% of calls, at 7.8s apiece. Asking for brevity and refusing everything that misses is not the same decision, so it does not get one number. With them split, the same eight transcripts produce eight accepted names, the longest 49 characters.

Do not tighten `NAME_MAX_CHARS` toward what the card displays. The card truncates at around 33 characters on its own; the constant exists to tell a name apart from a sentence, and a truncated name still identifies the session while a rejected one leaves it anonymous for another milestone.

## The naming call must not look like a session

`claude -p … --no-session-persistence` is load-bearing, not hygiene. Without that flag the naming subprocess writes its own `~/.claude/sessions/<pid>.json`, `discover()` picks it up, and it becomes a presence with no `status` — which `presenceStatus` reads as idle. Relying on `bindShells` failing to attach it to a PTY would work today and break the moment anything about process ancestry changes.

Measured on this machine, against the real binary: 7.2–7.9s per call, 304 MB peak RSS, ~20% CPU — it is network-bound, so several at once cost memory and nothing else. `NAMING_SLOTS` caps that at five.
