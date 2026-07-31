---
title: How the session list is narrowed to chosen Projects
tags: [ui]
updated_at: 2026-07-31
created_at: 2026-07-27
---

## The project header is a union, and choosing nothing is what shows everything

`useChosenProjects` holds the chosen project ids; `useSessionList` narrows the open list, the archive and the numbering to them. An empty set means every session, so there is no "all" control to click and no state where the list is empty because of a narrowing nobody asked for.

The term is Project narrowing and `CONTEXT.md` puts "filter" on its `_Avoid_` list, which is why no identifier here carries that word.

The project header lives above the list in `ProjectNarrowing` and the Project rail's footer rows toggle the same set. It follows the review header anatomy at a secondary scale: one continuous `h-7` row with `text-data`, controls separated by borders, surface feedback for hover and selection, and no badge treatment. A single mounted project renders no header at all: it could only ever narrow to what is already shown, and the Shell picker makes the same call for the same reason (`session-creation.md`).

## Only a project holding an open session appears in the header

`useSessionList` publishes `openProjectIds` from the open list before the narrowing, and `ProjectNarrowing` lists a project when that set holds it or when it is already chosen. A project whose sessions are all archived has nothing to narrow to, so its control goes; keeping the chosen ones is what stops a narrowing from outliving the last control that could undo it. Fewer than two listed projects renders no header, the same call a single mounted project already made.

The header is one scrolling line: `overflow-x-auto`, with controls capped at `max-w-40`. It never wraps and steals session rows on a narrow window.

## Narrowing changes what is read, never what is running

Toggling a project does not touch the Selected session, so the Workspace keeps showing whatever it showed — including a session the header now hides. Clicking a Project row does the same and nothing else: it used to open that project's newest session, which is the navigation this row no longer performs.

`Ctrl+Tab` is the deliberate exception. `waiting` is computed from the whole open list before the project header narrows it, so the jump still reaches an agent blocked on the user in a project the header hides. `Alt+1..9` follows the visible rows instead, because those numbers are painted on what the user can see.

The set is `useState` and never reaches disk — a narrowing that survived a restart would hide sessions the user does not remember hiding. Removing a project forgets it (`chosen.forget` in the removal's `onSuccess`); without that, its id would stay in the set and narrow the list to nothing, with no control left to click to undo it.
