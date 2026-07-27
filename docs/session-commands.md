---
title: How a session gesture reaches the workspace that owns it
tags: [ui, continuity, router]
updated_at: 2026-07-27
created_at: 2026-07-25
---

## Only the gestures that touch the tab list go through the command channel

Each mounted workspace registers `{ openShell, closeShell }` under its project id, and those two gestures on a **mounted** project run that command, because the workspace still owns its tab list. They fall back differently when the project is not mounted:

- **create** has no fallback — it activates the project and queues the open, which drains the moment that workspace registers. This is why creating into a non-resident project reads as "activate, then create"
- **close** writes straight to continuity; there is no PTY to tear down

Select and archive are not on this channel. They write to continuity directly and every workspace follows the pushed selection (`session-selection.md`), so there is nothing for a mounted workspace to answer.

## Creating takes the project as an argument, not as a mode

The header `+` and `Ctrl+X T` both run `requestNewShell`, which opens the **Shell picker** whenever more than one project is mounted and creates immediately when only one is. Neither ever reads `activeProjectId` any more: the target used to be whichever project owned the selected session, so creating into another one meant going there first — through the footer, which lands you in an existing session of that project — and only then pressing `+`. `Ctrl+X T` then `Enter` reproduces the old gesture exactly, because the picker opens highlighting the current project.

`createSession` already took a project id and already handled a project that is not resident (activate, queue, drain on register), so the picker needed nothing new underneath it — the shortcut was simply passing one id where the user had a list.

The picker filters on `project.name` only. Every name is its directory's basename (`src/main/store/projects.ts`), so a path substring match makes `ju` hit every project under `/home/jui/projects`. The path stays rendered on the row, where it disambiguates two projects sharing a basename without polluting the search.

Reusing an idle shell instead of opening another was considered and dropped. It is the right move in t3code, where an unsent draft thread is noise, but a Bankai shell sitting at a prompt is a usable terminal, and nothing here can tell one that was never used from one whose output has scrolled — `ShellOutputLines` only emits behind an activity state (`shell-output-lines.md`).

The two overlays do not stack: `requestNewShell` bails while the Project picker is open, because both feed the rail's single `setPickerActive` flag and the second one to close would withdraw the rail out from under the first.

## Projects are a footer section, and nothing selects one

`ProjectFooter` is pinned under the session list, sorted by name, closed by default, its open state persisted as `layout.projectsOpen`. Sorting is by name and not by store order because project order no longer exists: it was array order in the store, so removing it migrated nothing.

Clicking a project row does not select the project — it opens its newest **open** session, falling back to its newest archived one, and creating one when it has none. That is the only way in: `activeProjectId` is now a consequence of which session is selected, never a thing the user sets. Adding a project lands inside a session in it for free, because a workspace mounting with no restored shells opens a default shell through `registerDefaultShell`.

Removing a project with open shells asks first, naming the count. Removing the one that owns the selected session moves the selection through `purgeProject` (`session-selection.md`), so the route hands nothing over; with no projects left the workspace region is empty and the existing `EmptyState` takes over.
