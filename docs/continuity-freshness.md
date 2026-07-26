---
title: How the renderer's continuity value stays true
tags: [continuity, store, ipc, ui]
updated_at: 2026-07-25
created_at: 2026-07-25
---

## Continuity is pushed, never refetched

`src/main/store/continuity.ts` routes every mutation through a local `mutate` wrapper that writes through `Store.mutate` and then hands the whole new value to every listener registered by `Continuity.subscribe`. One chokepoint, total ordering, no per-caller bookkeeping.

`src/main/continuity/ipc.ts` turns that into one global channel: the renderer sends `continuity:subscribe` once, main answers by pushing the current value on `continuity:changed` and keeps pushing on every later mutation. The seed rides the same channel as the updates on purpose — two channels have no ordering guarantee between them, so a newer push could land before an older response and be overwritten.

`src/renderer/src/lib/continuity-push.ts` is installed at boot from `main.tsx` and writes each push into the query cache with `setQueryData`, preserving the cached `failed` flag so the lost-sessions notice survives the next write. The route loader still fetches once, only so the first paint is not blank; the query client's `staleTime: Infinity` means nothing ever refetches.

Two designs are ruled out and must not come back: feeding a mutation's return value into the cache, and invalidating the query on mutation success. Both need a renderer-side trigger, and the writes that matter most have none.

## Main writes continuity behind the renderer's back

These call sites mutate the continuity store with no renderer mutation behind them:

- `src/main/activity/AgentActivity.ts` — `setShellSession` / `clearShellSession`, and the last-touched stamp at turn start
- `src/main/terminal/TerminalSessions.ts` — `clearShellSession`
- `src/main/router/projects.ts` — `purgeProject`

## Shell state ownership is split on purpose

`useShellTabs` stays the optimistic owner for the mounted project — it binds the PTY and must answer instantly — while cross-project surfaces read the pushed value. In steady state they agree; the transient is a surface trailing one round-trip when a tab opens. Collapsing the two into one source puts a round-trip in the path of opening a tab.

## There is no second window

`src/main/index.ts` creates exactly one `BrowserWindow`, guarded by `requestSingleInstanceLock`, and each instance resolves its own `userData` path through `resolveInstanceIdentity`. Two dev instances do not share a store (they are required to use different `DATA_DIR`s). Concurrent renderers over one store is not a case that exists.
