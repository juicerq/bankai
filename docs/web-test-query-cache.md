---
title: Why a query-cache write in a web test does not reach the component inside act
tags: [test, ui]
updated_at: 2026-07-31
created_at: 2026-07-27
---

## `act` flushes React, not TanStack Query's notifier

`queryClient.setQueryData(...)` inside `act(...)` lands in the cache immediately — `getQueryData` proves it — but the observer's re-render is scheduled through the query notify manager, which `act` does not drain. Reading `result.current` right after the write returns the value from before it, and the test fails claiming the push never happened.

Assert the cache directly when the subject is the write, and wrap the component-side assertion in `waitFor`:

```ts
act(() => {
	queryClient.setQueryData(queryKey, { value, failed: false });
});

await waitFor(() => {
	expect(result.current.continuity.workspaces[0]?.shells).toHaveLength(0);
});
```

This is what a continuity push looks like from the renderer's side (`continuity-freshness.md`), so every test that simulates one pays it.

## A mutation's refetch needs its own wait before the DOM one

A `useMutation` whose `onSuccess` invalidates a list takes two hops to reach the DOM: the handler writes, then the invalidated query refetches, then the observer re-renders. One `waitFor` on the rendered result intermittently fails to see the second hop and times out at 5000ms, even though the DOM is correct 28ms in — `tests/web/commands-modal.test.tsx` did this on roughly one run in twenty, and on every run when the machine was under load. Wait on the store first, then on the DOM:

```ts
fireEvent.click(action("Delete Dev server"));

await waitFor(() => {
	expect(transport.commands.map((command) => command.id)).not.toContain("c1");
});

await waitFor(() => {
	expect(query("command-row", { id: "c1" })).toBeNull();
});
```

The first wait is an assertion in its own right — it is what proves the delete reached the store rather than only the screen. Raising the timeout is the wrong repair: the wait is not slow, it is unobserved.

## Structural sharing is what makes a push cheap

TanStack Query applies `replaceEqualDeep` to `setQueryData`, so a push that changes one workspace hands every other workspace back by identity. That is the whole reason `ProjectWorkspace` can be a `memo` over `shells`: a push touching another project compares equal and the workspace does not re-render. `tests/web/use-sessions.test.tsx` pins it with a `structuredClone`d push, because the guarantee comes from the library rather than from our code.
