---
title: Why the expanded review panel covers the terminal instead of taking its width
tags: [ui, terminal]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## The terminal cannot be squeezed to make room

The review panel and the shells share one flex row, so the obvious way to let the
panel reach the rail is to let it grow and the terminal shrink. It costs the
session: xterm refits to the columns it is given, and an agent TUI rewrapped to a
handful of columns comes back mangled when the panel docks again — the buffer is
already rewritten by then.

So the expanded panel keeps reserving exactly the width it docks at
(`geometry.dockedWidth`) in the row, and only its inner surface grows, over the
shells. The terminal never learns that anything happened. The width the panel
animates is the surface's, not the frame's, which is why the two carry separate
transitions and why the clip that hides the panel during an open/close has to come
off while it covers.

## Expanding does not overwrite the docked width

While expanded the diff fills whatever the tree leaves behind, so that width is
derived, not chosen. Resizing the tree in that state writes down `treeWidth` only:
persisting the derived diff width would erase the width the panel docks back to.
