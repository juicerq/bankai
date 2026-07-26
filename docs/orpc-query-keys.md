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

## A settings control must send a patch, not the object its render captured

A panel where two controls write the same record has a race that has nothing to do with the network: blurring a text field is itself a change, and the click that follows lands with the props of the render that drew it. `onSave({ ...harness, autostart: false })` sends the `harness` from *before* the blur, so the arguments the user just typed are overwritten by the click that follows — both requests succeed, and the second one is wrong.

`useHarnessSettings` takes a `Partial<HarnessSettings>` and merges it against the query cache at click time, with an optimistic `onMutate` write so the cache already carries the earlier change. No render has to happen in between. `tests/web/settings-modal.test.tsx` fires focusOut and click back to back with no microtask between them — a stricter ordering than a real mouse produces, which is the point.

This hid in `useLayoutPreferences` for a long time because the layout query is read once at mount into local state, so a write that never landed looked identical to one that did. It surfaced the first time a component rendered straight from the query.
