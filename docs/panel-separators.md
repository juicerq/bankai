---
title: Why a panel's 1px separators keep coming out doubled
tags: [ui]
updated_at: 2026-07-27
created_at: 2026-07-27
---

## Two neighbours each drawing their own edge is a 2px line

Every panel here is built from stacked rows on a dark surface, separated by a single `border-outline` hairline. The recurring bug: a row ends with `border-b`, the next region starts with `border-t`, and where they meet the seam renders at double weight against a header or footer that was already correct. It reads as a rendering glitch rather than a choice, and it is the single most common visual defect in this codebase.

It is a *composition* bug, not a styling one, and it appears exactly when a block that was previously last in a stack stops being last — a new section added below it, a component reused in a second place, a footer that grew a top rule.

**A separator belongs to the container, not to the row.** Put `divide-y divide-outline` on the wrapper and let the rows carry no edge of their own; the wrapper draws n−1 lines by construction and cannot double, however many rows are added or removed later. `settings-modal.tsx` does this: the modal's header and footer own their single rule and the body wraps its rows in a `divide-y`.

Reserve `border-b` / `border-t` on an individual element for the two ends of a panel — a header, a footer, a fixed toolbar — where the edge really is that element's own and it has no sibling to collide with.

The check when reading a stack: count how many elements between any two adjacent regions declare a horizontal border. The answer is one. If nobody does, the rows run together; if both do, the seam doubles.
