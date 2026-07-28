---
title: How the session list is narrowed to chosen Projects
tags: [ui]
updated_at: 2026-07-28
created_at: 2026-07-27
---

## The badges are a union, and choosing nothing is what shows everything

`useChosenProjects` holds the chosen project ids; `useSessionList` narrows the open list, the archive and the numbering to them. An empty set means every session, so there is no "all" badge to click and no state where the list is empty because of a narrowing nobody asked for.

The term is Project badges and `CONTEXT.md` puts "filter" on its `_Avoid_` list, which is why no identifier here carries that word.

The badge row lives above the list in `ProjectBadges` and the Project rail's footer rows toggle the same set — one state, two surfaces, both marked with the accent the app already uses for "the machine is addressing this". A single mounted project renders no badge row at all: it could only ever narrow to what is already shown, and the Shell picker makes the same call for the same reason (`session-creation.md`).

## Only a project holding an open session wears a badge

`useSessionList` publishes `openProjectIds` from the open list before the narrowing, and `ProjectBadges` lists a project when that set holds it or when it is already chosen. A project whose sessions are all archived has nothing to narrow to, so its badge goes; keeping the chosen ones is what stops a narrowing from outliving the last badge that could undo it. Fewer than two listed projects renders no row, the same call a single mounted project already made.

The row is one scrolling line — `overflow-x-auto` with `shrink-0` badges capped at `max-w-32`, and `.badge-strip` in `styles.css` hides the scrollbar so a badge clipped at the edge is the only cue that the line continues. It used to wrap and grow to `max-h-20`, which stole four rows of session list on a narrow window.

## Narrowing changes what is read, never what is running

Toggling a badge does not touch the Selected session, so the Workspace keeps showing whatever it showed — including a session the badges now hide. Clicking a Project row does the same and nothing else: it used to open that project's newest session, which is the navigation this row no longer performs.

`Ctrl+Tab` is the deliberate exception. `waiting` is computed from the whole open list before the badges narrow it, so the jump still reaches an agent blocked on the user in a project the badges hide. `Alt+1..9` follows the visible rows instead, because those numbers are painted on what the user can see.

The set is `useState` and never reaches disk — a narrowing that survived a restart would hide sessions the user does not remember hiding. Removing a project forgets it (`chosen.forget` in the removal's `onSuccess`); without that, its id would stay in the set and narrow the list to nothing, with no badge left to click to undo it.
