---
title: Why typing in a web test does nothing unless the input is focused first
tags: [test, ui]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## Focus the input before firing input, or React never sees it

In `tests/web`, `fireEvent.input(field, { target: { value } })` on an unfocused input sets `field.value` in the DOM and nothing else: the component's `onInput` never runs, its state never changes, and the assertion fails while the DOM inspection looks right. Firing a `keyDown` on that same input is dropped too.

React decides at startup whether the browser supports input events. happy-dom fails that probe, so React falls back to a polyfill that watches whichever element received `focusin` and reacts to value changes on it. With no focusin, its `activeElement` instance is null and the dispatch throws `TypeError: null is not an object (evaluating 'inst.tag')` inside `getInstIfValueChanged` — swallowed, because bun test does not fail on a console error.

`fireEvent.focus(field)` first, and it all works. `project-picker` never hit this only because its input carries `autoFocus`.

Two related notes: prefer `onInput` over `onChange` in components, as the rest of the app does, and use `fireEvent.focusOut` rather than `fireEvent.blur` — React 17+ listens for `focusout`, which `blur` does not bubble into.
