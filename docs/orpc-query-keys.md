---
title: Why a mutation's setQueryData can silently miss the query it means to update
tags: [ui]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## `.key()` and `queryOptions().queryKey` are not the same key

For `orpc.settings.getHarness`:

- `.key()` → `[["settings","getHarness"],{}]`
- `.queryOptions().queryKey` → `[["settings","getHarness"],{"type":"query"}]`

`.key()` is a **prefix**. It is the right argument for `invalidateQueries`, which matches partially, and the wrong argument for `setQueryData`, which needs the exact key — the write lands on a cache entry nothing reads and the UI never moves.

Pass `.key({ type: "query" })` when writing a mutation result straight into the cache:

```ts
useMutation(orpc.settings.updateHarness.mutationOptions({
	onSuccess: (harness) => queryClient.setQueryData(orpc.settings.getHarness.key({ type: "query" }), harness),
}))
```

This hid in `useLayoutPreferences` for a long time because the layout query is read once at mount into local state, so a write that never landed looked identical to one that did. It surfaced the first time a component rendered straight from the query.
