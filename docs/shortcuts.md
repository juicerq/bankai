---
title: Why the always-focused terminal constrains every shortcut
tags: [ui, terminal]
updated_at: 2026-07-28
created_at: 2026-07-25
---

## Shortcuts always win over xterm, so the terminal is not the constraint

`use-bankai-shortcuts.ts` and `use-project-workspace-shortcuts.ts` both register `keydown` on `window` in the **capture** phase and call `preventDefault` plus `stopPropagation` before acting. Any chord they claim never reaches xterm. Picking a chord is therefore never a question of whether the terminal would eat it — it is a question of what the user loses inside the agent, and of what the window manager takes first.

`Alt+Tab` is the one chord that is genuinely unavailable: the WM takes it before the renderer sees it. `Ctrl+Tab` is not a WM binding on Linux and is free.

## `!terminalFocus` gating does not transfer from t3code

t3code guards commands with a `when: "!terminalFocus"` clause, so `mod+n` means `terminal.new` inside the terminal and `chat.new` outside it. That works because their terminal is one panel among several.

In Bankai the terminal is the product. It holds focus essentially always, so a `!terminalFocus` gate does not disambiguate a chord — it disables it. Any design copied from t3code that leans on that clause has to find another guard.

## A held `Ctrl` is not available as a gesture

Inside an agent the user presses `Ctrl` constantly — `Ctrl+C` to interrupt, plus `Ctrl+D`, `Ctrl+L`, `Ctrl+R`. Any UI affordance triggered by *holding* `Ctrl` therefore fires many times an hour as an unwanted flash, and in fullscreen that means the sidebar reveals itself on every interrupt.

A time threshold before drawing was considered as a fix and rejected: invisible timing the user cannot see or control.

`Alt` has no equivalent. There is no `Alt+C`, and holding `Alt` alone is not a terminal gesture, so `Alt` is the modifier a hold-to-reveal affordance can safely use. Two things make this safe here specifically:

- The window is created with `frame: false` (`src/main/index.ts`) and nothing calls `setApplicationMenu`, so there is no native menu bar for `Alt` to focus. In a framed Electron window this would not hold.
- `Alt+Digit` is already claimed by the app today, so rebinding it steals nothing new from the shell.

## The leader's letters mean the panel; punctuation means the app

After `Ctrl+X` the letters name what they open — `f` fullscreen, `t` a shell, `x` closes one, `r` the review panel, `e` expands it over the terminal, `c` the commands palette. Settings took `,` instead of a letter because every editor the user already has open binds preferences to a comma, so it is the one chord guessed correctly without reading anything. It also keeps a letter free for a panel, which is what letters are for here.

## Only the 60% base layer is available

The user's keyboard is a 60/65%: no F row, and `Esc` sits where the backtick would be, so the backtick lives behind `Fn`. Any chord using a function key or a backtick is a three-finger layer gymnastic, not a shortcut, and does not count as bound.

What stays available: letters, the number row, `Tab`, `Esc`, the modifiers, and punctuation on the base layer. A shortcut proposal that reaches outside that is not a proposal.
