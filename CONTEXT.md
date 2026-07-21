# Bankai

A desktop workspace that runs shell sessions against a local project and reads that project's git changes beside them. It never writes to a repository.

## Language

**Project**:
A local directory the user has mounted into the app. Owns the shells opened against it and the changes the review reads.
_Avoid_: Repository, folder, workspace

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

**Full-file view**:
A changed file shown in its entirety with its diff still embedded — unchanged lines as context, changed lines still marked. A per-file state, not a separate screen.
_Avoid_: Preview, expand, open file, source view
