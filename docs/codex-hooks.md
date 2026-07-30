---
title: Where Codex loads hooks and why Bankai cannot silently trust one
tags: [activity, store]
updated_at: 2026-07-30
created_at: 2026-07-29
---

## User hooks are additive and trust is explicit

Codex 0.146.0 loads lifecycle hooks from `hooks.json` or inline hook tables beside each active config layer. The user-level JSON file is `~/.codex/hooks.json`; project and plugin layers can add more hooks, and matching hooks from every layer run.

The JSON shape is `hooks.<Event>[]`, where each event holds matcher groups and each group holds command handlers. A real user file on this machine already carries `UserPromptSubmit`, `PostToolUse`, and `Stop`, so an integration must merge its own groups and preserve every unknown field and user-owned handler. Invalid JSON is a stop condition, never permission to replace the file.

Codex merges `hooks.json` with inline hooks from `config.toml` at the same layer but warns on every startup when both representations exist. Creating a new user-level `hooks.json` beside existing inline user hooks would therefore make the user's clean configuration noisy. That case has to degrade instead of silently adding the second representation.

Codex requires non-managed command hooks to be reviewed and trusted. It keys trust to the exact hook definition and skips new or changed definitions until the user reviews them through `/hooks`. Bankai must not pass `--dangerously-bypass-hook-trust`; an untrusted Bankai hook degrades to no detailed trace while the rollout still supplies Working and Done.

## The payload is structured but the transcript is not a contract

Every command hook receives one JSON object on stdin. Shared fields include `session_id`, nullable `transcript_path`, `cwd`, `hook_event_name`, and `model`; turn-scoped events can also carry `turn_id`.

The official hook contract explicitly says the file at `transcript_path` is not a stable interface. Bankai can validate the hook payload and use the rollout format it has measured, but it cannot treat either external JSON shape as trusted TypeScript data.

## A trust key holds the hook's position, so Bankai's group goes last

Codex stores trust in `config.toml` under `hooks.state."<file>:<snake_case_event>:<groupIndex>:<hookIndex>"`. Inserting a group before a user's group shifts that user's index and invalidates their trust, which would send them back to `/hooks` for a hook they already reviewed. Bankai appends its group to the end of each event's list for that reason alone.

## The measured payload, and what is still unmeasured

A live Codex 0.146.0 sent `session_id`, `turn_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `permission_mode`, and `prompt` for `UserPromptSubmit`, and the same plus `stop_hook_active` and `last_assistant_message` for `Stop`. `hook_event_name` is PascalCase. The spool script's text search for `session_id` works against this payload.

⚠️ The tool events are unmeasured. The matcher value Bankai writes (`.*`) and the `tool_name` field it reads on `PreToolUse` and `PostToolUse` come from the published contract, not from a captured payload. Measuring them needs a hook this machine's user has trusted for a matcher that Codex's own edit tool (`apply_patch`) hits, which no existing hook does.
