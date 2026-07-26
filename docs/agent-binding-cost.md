---
title: Why binding a shell to an agent reads a /proc subtree instead of all of /proc
tags: [activity, fs]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## The full walk cost 15.1 ms every tick

`SessionBinder` needs the agent process sitting under a shell's foreground process group. It used to build a complete parent→children map by reading `/proc/<pid>/stat` for every process on the system — 541 processes and 15.1 ms on a normal desktop, repeated every 1500 ms tick for as long as any shell ran a non-agent command.

It now walks down from the foreground pid on demand, reading `/proc/<pid>/task/<tid>/children`. A typical shell subtree is 3 processes: 0.49 ms. Benchmark this under `node`, not `bun` — see `main-process-runtime.md`.

## Read every thread's children file, not just the leader's

A process that spawns from a non-main thread registers the child under that thread's `children`, and reading only `/proc/<pid>/task/<pid>/children` would miss it. Verified equivalent to the parent-pid walk across every live process on the system; `tests/agent-activity.test.ts` keeps that check.

`children` needs `CONFIG_PROC_CHILDREN`, so `procFs.supportsChildren` probes once and `childrenReader` falls back to the old full walk when it is missing. Nothing above `bindShells` knows which path served the request — it takes a `ChildrenOf` function.
