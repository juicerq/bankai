---
title: How a new session is created and which project it lands in
tags: [ui, continuity]
updated_at: 2026-07-27
created_at: 2026-07-27
---

## Creating takes the project as an argument, not as a mode

The header `+`, `Ctrl+X T`, the empty session list and the empty workspace all run `requestNewShell`, which opens the **Shell picker** whenever more than one project is mounted and creates immediately when only one is. The two empty states name no project on purpose: the one place a project is chosen is the picker. Neither reads the Active project: the target used to be whichever project owned the selected session, so creating into another one meant going there first and only then pressing `+`. `Ctrl+X T` then `Enter` reproduces the old gesture exactly, because the picker opens highlighting the current project.

Creating writes straight to continuity, so a project whose workspace is not mounted needs nothing special — the new shell is in the store before the workspace exists, and the workspace mounts because the Active project follows the selection (`session-selection.md`).

The picker filters on `project.name` only. Every name is its directory's basename (`src/main/store/projects.ts`), so a path substring match makes `ju` hit every project under `/home/jui/projects`. The path stays rendered on the row, where it disambiguates two projects sharing a basename without polluting the search.

Reusing an idle shell instead of opening another was considered and dropped. It is the right move in t3code, where an unsent draft thread is noise, but a Bankai shell sitting at a prompt is a usable terminal, and nothing here can tell one that was never used from one whose output has scrolled — `ShellOutputLines` only emits behind an activity state (`shell-output-lines.md`).

The two overlays do not stack: `requestNewShell` bails while the Project picker is open, because both feed the rail's single `setPickerActive` flag and the second one to close would withdraw the rail out from under the first.

## Mounting a project with no shells creates the first one

Adding a project lands the user inside a session in it because `mountProject` in `src/renderer/src/routes/index.tsx` opens a shell when the project's workspace holds none, instead of activating it and letting the workspace invent one on mount. The component that mounts decides nothing: restoring a project whose shells were all closed therefore starts no agent (`workspace-restore.md`).

## The shell names itself

`Shell N` is chosen inside `ContinuityReducers.openShell`, one above the highest `Shell <number>` label that project already holds. No caller passes a label, so the number cannot disagree with the list it is counted from — the renderer used to number from a counter seeded at mount, which drifted the moment a shell was opened from another surface.
