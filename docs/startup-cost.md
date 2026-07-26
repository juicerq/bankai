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
