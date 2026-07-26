---
title: How to measure Bankai's startup, and what was actually slow the first time it was measured
tags: [git, ui, test]
updated_at: 2026-07-26
created_at: 2026-07-26
---

# Measuring it

`src/main/startup.ts` marks stages against `process.getCreationTime()` — the only clock that covers the time before our first line of JavaScript runs. It is Electron-only and `undefined` under `bun test`, so it is called inside `markStartup`, never at module scope.

The renderer keeps its own marks in `src/renderer/src/lib/startup.ts` with plain `Date.now()`, and ships them to the main process once `requestIdleCallback` fires after the first frame. Wall-clock timestamps are directly comparable across processes, so both sets land on one timeline. Capturing the timestamp at the moment of the event and sending it late is what makes this safe — the transport cost never contaminates the measurement.

`installStartupTiming` marks every query `fetch` and `success` off the TanStack query cache, which is where the answer usually is. It subscribes to `getQueryCache()`, not a `useEffect`.

To read one:

```
bun run build && timeout 25 bun run preview
```

Preview is not packaged, so it uses the dev data directory (`~/.config/Bankai-dev/`) as the project rules require. The report lands in `~/.config/Bankai-dev/log.ndjson` under `startup:timing`.

Exactly one report is emitted per boot. `ready-to-show` schedules a 15 s fallback in case the renderer never reports; whichever arrives first wins.

# Do not trust ablation on this

Before the instrumentation existed, boots of the same scenario ranged from **2401 ms to 5698 ms**. Every ablation — removing shells, disabling the review prewarm — produced a difference smaller than that spread, so none of them meant anything. Two confident diagnoses died that way.

The variance was not noise in the usual sense. It was the recursive watch below, whose cost tracks how much of the directory tree is in the page cache.

# What it was: a blocked main process, wearing git's clothes

First real measurement: **7419 ms** to first frame, with a **6302 ms** hole between the review queries being issued and answered. The obvious read is that Git is slow, and it is wrong twice over.

- The git commands themselves take 4–38 ms. Measured directly on the same repositories.
- The git worker received all three messages in the same millisecond it finished loading. Its bundle is 20 KB and imports nothing external.

The main process was blocked. `ReviewChanges.observe` was building a recursive watch over `~/projects` — a registered project that is not a repository and contains every other project — for **4162 ms**, during which the main process could not process the worker's replies. The queue in `src/main/git/worker.ts` is serial, so the delay looked like it belonged to git.

Skipping the recursive watch for non-repositories: **7419 ms → 862–1179 ms**, and the run-to-run spread collapsed with it.

The lesson that generalizes: a synchronous call in the main process shows up as latency in whatever asynchronous work was in flight at the time. Time attributed to a subprocess is worth one check against that subprocess's own clock before believing it.

# The serial git queue is not worth parallelizing

`src/main/git/worker.ts` runs every request through one global promise chain. That looks like an obvious win to parallelize, and it was measured. It is not.

Replacing it with one queue per repository — safe, since concurrent reads are fine and only `worktree remove` writes — moved the numbers like this:

| | global queue | per repository |
|---|---|---|
| total time queued, whole boot | 198–251 ms | 57–76 ms |
| longest single wait | 54–73 ms | 40–50 ms |
| git window during boot (median) | 1355 ms | 1354 ms |
| first frame | no change | no change |

The queued time is real and it still buys nothing, because the operations do not sit on the critical path — the startup total is identical within noise.

The remaining argument was tail risk: one slow operation stalling every other project. No such operation exists at plausible sizes. Measured on this machine:

- 3000 modified files: `git diff` 61 ms
- 5000 untracked files, the path that reads every file to count lines: 215 ms
- 320 concurrent `git diff` / `ls-files` against one repository: zero failures, empty stderr

Git reads are safe to run concurrently (`GIT_OPTIONAL_LOCKS` in `man git` describes index refresh as an optional, skippable sub-operation), so the change is available if a genuinely slow operation ever appears. Until one does, the global queue costs nothing worth the code.
