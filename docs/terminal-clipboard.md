---
title: How terminal text reaches the system clipboard, and why xterm alone only fills PRIMARY
tags: [terminal, ui]
updated_at: 2026-07-31
created_at: 2026-07-31
---

## xterm.js gives Linux the PRIMARY selection, never CLIPBOARD

On Linux `@xterm/xterm` mirrors a mouse selection into the hidden textarea (`onLinuxMouseSelection`) and pastes on `auxclick` with button 1. That is the whole X11 PRIMARY loop: select with the mouse, paste with the middle button, no app code needed.

It writes nothing to CLIPBOARD, and it binds no chord. `Ctrl+Shift+C` and `Ctrl+Shift+V` do not exist in xterm — a terminal emulator on top of it has to implement both, or the user's copy dies at the middle button.

## The chord lives in `RendererTerminalSession`

`attachCustomKeyEventHandler` in `use-terminal-session.ts` claims `Ctrl+Shift+C` and `Ctrl+Shift+V`, and returns `false` so the bytes never reach the shell. Copy uses `navigator.clipboard.writeText`; paste uses `readText` and `terminal.paste`, which applies bracketed paste when the shell asked for it.

The chord is not in `use-bankai-shortcuts.ts`. Those window handlers only claim `Ctrl+X`, `Ctrl+Tab` and `Alt+Digit`, so `Ctrl+Shift+C` survives capture and reaches xterm.
