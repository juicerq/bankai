# Bankai

A desktop workspace that runs shell sessions against a local project and reads that project's git changes beside them. It never writes to a repository.

## Language

**Project**:
A local directory the user has mounted into the app. Owns the shells opened against it and the changes the review reads.
_Avoid_: Repository, folder, workspace

**Active project**:
The project whose workspace is visible and receives project-level shortcuts. Exactly one mounted project is active at a time.
_Avoid_: Selected project, focused project

**Workspace**:
The region of the window that belongs to one project: its shells and its review.
_Avoid_: Tab, view, pane

**Shell**:
One live terminal session running inside a project.
_Avoid_: Terminal, tab, session, PTY

**Review**:
The read-only reading of a project's current git changes.
_Avoid_: Diff view, git panel, changes

**Review panel**:
The region that presents the review: the scope selector, the totals, and the diff.
_Avoid_: Sidebar, drawer

**Scope**:
Which set of changes the review reads. Two exist: Uncommitted, the working tree against `HEAD`; and Branch, the whole branch against its merge-base with the default branch.
_Avoid_: Mode, filter, range

**Changed file**:
One file the current scope reports as differing, including a file git does not track yet. The unit the review is organized by.
_Avoid_: Diff, entry, item

**Status mark**:
The single letter that names how a changed file differs: modified, added, deleted, renamed, or untracked.
_Avoid_: State, type, kind

**Tree**:
The navigator that arranges the current scope's changed files as a folder hierarchy. It contains only changed files — never the rest of the project.
_Avoid_: Explorer, file browser, sidebar

**Focused file**:
The one changed file occupying the Review's content area in full, with unchanged lines as context and changed lines still marked. The underlying Review remains present and current.
_Avoid_: Full-file view, preview, expand, open file, source view, modal
