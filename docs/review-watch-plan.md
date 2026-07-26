---
title: Why the review panel asks Git which directories to watch
tags: [fs, git]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## A recursive watch on a project root watches node_modules

`fs.watch(root, { recursive: true })` on Linux registers an inotify watch per directory, and it does so synchronously. On this repo that meant **787 ms of blocked main process, 146 MB of RSS, and 40005 watch descriptors** — 95% of it `node_modules`. With `fs.inotify.max_user_watches` at 524288, roughly a dozen observed projects exhaust the system limit.

Node offers no exclusion filter for a recursive watch, so `reviewWatchPlan` asks Git instead: one `git check-ignore --stdin` over the top-level directories, then a recursive watch on each directory Git does not ignore, plus a non-recursive watch on the root itself. Same repo: **9.5 ms, 9.8 MB, 267 descriptors.** The `check-ignore` call blocks for ~3 ms, once per observed project.

Asking Git is not a heuristic — the review panel renders a Git diff, so a path Git ignores can never appear in it.

## Two traps the arrangement has to dodge

- **`.git` must stay watched.** In a normal repository `.git` is a directory and the old recursive root watch covered it; a commit is what invalidates the panel. `check-ignore` does not report `.git` as ignored, so it survives as a recursive target. In a linked worktree `.git` is a file, and `gitMetadataPaths` resolves the real gitdir and commondir.
- **A non-recursive root watch never sees into a directory created later.** `ReviewChanges.adopt` re-plans on the debounce whenever `readdirSync` (0.02 ms) shows a top-level name it has not classified.

## A project that is not a repository gets no recursive watch at all

`Git.snapshot` returns `not-a-repo` for it, so the panel has nothing to render and there is nothing worth observing. `reviewWatchPlan` probes with `git rev-parse --is-inside-work-tree` and stops at a non-recursive watch on the root, which is still enough to notice a `.git` appearing later — `adopt` re-plans on that new top-level name.

Skipping that probe is expensive, not merely wasteful. A project pointed at `~/projects` — the directory that holds every other project — blocked the main process for **4162 ms** building watch descriptors it could never use. See `startup-cost.md`.

`check-ignore` failing inside a real repository still degrades to the single recursive watch.

## Known gap

A directory that stops being ignored — you delete a line from `.gitignore` while the review panel is open — is not picked up, because `adopt` only re-plans when a top-level *name* is new. It resolves on the next observation of the project, and the 30 s fallback interval plus `ReviewChanges.touch` on every agent turn keep the panel fresh meanwhile.
