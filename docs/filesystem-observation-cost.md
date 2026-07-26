---
title: What the activity tick and the review panel cost the filesystem, and which cheap paths replaced the expensive ones
tags: [activity, git]
updated_at: 2026-07-26
created_at: 2026-07-26
---

# The main process is Node, never Bun

Bankai ships as an Electron app, so `src/main` and `src/preload` run on Electron's Node runtime and `src/renderer` runs in Chromium. `Bun.file`, `Bun.spawn` and `Bun.$` do not exist in any of them. Bun owns the package manager, `bun test`, and the release workflow — nothing at runtime.

A swap to a Bun API in `src/main` passes `bun test`, because tests do run under Bun, and then fails in the packaged app. Benchmarks for main-process code must be run under `node`, not `bun`: Bun's I/O is several times faster and will understate the real cost. Measured on the same `/proc` walk: 2.4 ms under Bun, 15.1 ms under Node.

# Binding a shell to an agent reads a subtree, not all of /proc

`SessionBinder` needs the agent process sitting under a shell's foreground process group. It used to build a complete parent→children map by reading `/proc/<pid>/stat` for every process on the system — 541 processes and 15.1 ms on a normal desktop, repeated every 1500 ms tick for as long as any shell ran a non-agent command.

It now walks down from the foreground pid on demand, reading `/proc/<pid>/task/<tid>/children`. A typical shell subtree is 3 processes: 0.49 ms.

Read **every** thread's `children` file, not just the thread-group leader's. A process that spawns from a non-main thread registers the child under that thread's `children`, and reading only `/proc/<pid>/task/<pid>/children` would miss it. Verified equivalent to the parent-pid walk across every live process on the system; `tests/agent-activity.test.ts` keeps that check.

`children` needs `CONFIG_PROC_CHILDREN`, so `procFs.supportsChildren` probes once and `childrenReader` falls back to the old full walk when it is missing. Nothing above `bindShells` knows which path served the request — it takes a `ChildrenOf` function.

# A recursive watch on a project root watches node_modules

`fs.watch(root, { recursive: true })` on Linux registers an inotify watch per directory, and it does so synchronously. On this repo that meant **787 ms of blocked main process, 146 MB of RSS, and 40005 watch descriptors** — 95% of it `node_modules`. With `fs.inotify.max_user_watches` at 524288, roughly a dozen observed projects exhaust the system limit.

Node offers no exclusion filter for a recursive watch, so `reviewWatchPlan` asks Git instead: one `git check-ignore --stdin` over the top-level directories, then a recursive watch on each directory Git does not ignore, plus a non-recursive watch on the root itself. Same repo: **9.5 ms, 9.8 MB, 267 descriptors.** The `check-ignore` call blocks for ~3 ms, once per observed project.

Asking Git is not a heuristic — the review panel renders a Git diff, so a path Git ignores can never appear in it.

Two traps this arrangement has to dodge:

- **`.git` must stay watched.** In a normal repository `.git` is a directory and the old recursive root watch covered it; a commit is what invalidates the panel. `check-ignore` does not report `.git` as ignored, so it survives as a recursive target. In a linked worktree `.git` is a file, and `gitMetadataPaths` resolves the real gitdir and commondir.
- **A non-recursive root watch never sees into a directory created later.** `ReviewChanges.adopt` re-plans on the debounce whenever `readdirSync` (0.02 ms) shows a top-level name it has not classified.

Outside a Git repository `check-ignore` exits 128 and the plan degrades to the original single recursive watch, so a plain directory behaves exactly as before.

## Known gap

A directory that stops being ignored — you delete a line from `.gitignore` while the review panel is open — is not picked up, because `adopt` only re-plans when a top-level *name* is new. It resolves on the next observation of the project, and the 30 s fallback interval plus `ReviewChanges.touch` on every agent turn keep the panel fresh meanwhile.
