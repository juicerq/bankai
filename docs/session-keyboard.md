---
title: How the keyboard reaches the session list
tags: [ui, window]
updated_at: 2026-07-26
created_at: 2026-07-25
---

## Keyboard reach stops at what is rendered

Holding `Alt` paints `1..9` over the rendered rows in visual order: the open list, then the archive if it is open, capped at nine. `Ctrl+Tab` jumps to the first `needs-attention` session in the open list. There is no bonus band any more: a waiting session cannot be archived, so it is already in the open list where its border and dot mark it.

`Alt` and not `Ctrl`: holding `Ctrl` collides with `Ctrl+C`, `Ctrl+D`, `Ctrl+L` and `Ctrl+R` inside an agent, which would paint numbers and throw the sidebar open on every interruption. There is no native menu bar for `Alt` to focus. No timing threshold gates the paint — a quick `Alt+1` simply jumps and the numbers are gone by the time `Alt` comes up. The wider constraint this follows from is in `shortcuts.md`.

In fullscreen, holding `Alt` reveals the sidebar through the same `canWithdraw` predicate the pointer edge, menus, drags and the picker already feed. `Ctrl+1..9` no longer activates a project and has no replacement.

## The session shortcuts live above the workspace, not inside it

`Ctrl+X T` and `Ctrl+X X` sit in `useBankaiShortcuts` and act on the selected session with no gate on a workspace being active. The per-workspace shortcut hook owns only `Ctrl+X R`. They moved there when the tab strip was removed — see `adr/0004-session-list-replaces-tab-strip.md`.
