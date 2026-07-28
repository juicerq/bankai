---
title: Which surfaces move the frameless window, and what a drag region costs
tags: [ui, window]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## The window has no OS title bar

`src/main/index.ts` creates the window with `frame: false`, so nothing the OS draws can move,
maximize or resize it. Every one of those affordances has to come from the page.

## The top band is the title bar

Two elements carry `app-region: drag` (`WINDOW_DRAG_CLASS`): the wordmark row at the top of the
project rail and the workspace header. Together they span the whole top band except the window
controls, which sit on the right and are `no-drag`.

Chromium hit-tests a drag region as `HTCAPTION` (`WebContentsView::NonClientHitTest`), so the
caption gestures are handled below the page: press-and-drag moves the window, and whatever the
platform does on a caption — double-click to maximize, right-click for the system menu, which
Electron surfaces as `system-context-menu` — comes with it. None of it is wired in the renderer.

## A drag region swallows every pointer event inside it

Anything interactive that overlaps a drag region stops receiving clicks, hover and enter/leave —
the region is hit-tested before the page sees the event. Every button inside the top band must
carry `WINDOW_NO_DRAG_CLASS`: the header actions, the update button, the window controls. A new
control added to the header without it will look alive and do nothing.

The region is a rectangle computed from the element's absolute bounds *with transforms applied*,
so the header translated off-screen in focus mode does not leave a dead strip over the terminal.

## The maximized state is pushed, never polled

`publishMaximizedState` sends `window:maximized` on `maximize`, `unmaximize` and every
`did-finish-load`. The preload caches the value and notifies subscribers, so the renderer reads it
synchronously through `useSyncExternalStore` and the middle control can show a restore icon while
the window is maximized.
