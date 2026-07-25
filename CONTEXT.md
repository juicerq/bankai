# Bankai

A desktop workspace that runs shell sessions against a local project and reads that project's git changes beside them. It never writes to a repository.

## Language

**Project**:
A local directory the user has mounted into the app. Owns the shells opened against it, the worktrees linked to its repository, and the changes the review reads.
_Avoid_: Repository, folder, workspace

**Active project**:
The project whose workspace is visible and receives project-level shortcuts. Exactly one mounted project is active at a time.
_Avoid_: Selected project, focused project

**Workspace**:
The region of the window that belongs to one project: its shells and its review.
_Avoid_: Tab, view, pane

**Project rail**:
The left edge region that lists mounted projects and lets the user manage or activate one.
_Avoid_: Sidebar

**Project picker**:
The overlay that mounts a Project, built around one editable path: typing narrows the directory it names, Enter opens the highlighted directory, and Ctrl+Enter mounts whatever the path currently reads. The system dialog stays behind it as an escape hatch.
_Avoid_: File picker, directory dialog, file browser, modal

**Fullscreen mode**:
The internal layout state that removes the Project rail from its fixed position and gives the Workspace the full window width. Entered by the explicit toggle or by dragging the rail's divider below the rail's minimum width. Exited by the toggle or by resizing the revealed rail, which docks it at the chosen width.
_Avoid_: Native fullscreen, system fullscreen, collapsed rail

**Divider**:
The draggable hairline between two adjacent regions that trades width between them. Every divider supports pointer drag and keyboard steps.
_Avoid_: Resize handle, separator, splitter, gutter

**Layout preferences**:
The user's chosen region widths, fullscreen state, and panel visibility (Review panel and Tree open or closed), remembered across app launches. Global to the app, not per project.
_Avoid_: Panel sizes, UI state

**Shell**:
One live terminal session running inside a project.
_Avoid_: Terminal, tab, session, PTY

**Review**:
The read-only reading of a project's current git changes.
_Avoid_: Diff view, git panel, changes

**Review panel**:
The region that presents the review: its header — the Scope selector, the Worktree selector, the totals, and the file actions — above the diff.
_Avoid_: Sidebar, drawer

**Header menu**:
The single shape every Review panel header control opens: a labelled trigger carrying an icon, and a list where each entry states what it is and, under it, what it reads against. Selection entries mark the current one; action entries just act.
_Avoid_: Dropdown, popover, combobox, select

**Overflow menu**:
The Header menu that takes in whatever the Review panel header is too narrow to keep inline, in a fixed order: the file actions first, then the Worktree selector. It appears only when it holds something.
_Avoid_: Kebab menu, three dots, more button, hamburger

**Worktree**:
One checked-out tree of a project's repository: the project directory itself, plus every linked tree `git worktree add` created from it. The review reads exactly one at a time.
_Avoid_: Branch, checkout, clone, copy

**Shell worktree**:
The Worktree an Agent is working in, read from its live session rather than declared by the user. It sticks once seen: leaving the agent keeps it, only closing the Shell drops it.
_Avoid_: Working directory, cwd, agent path

**Worktree selector**:
The Header menu that names the Worktree being read and offers the others. It follows the active Shell's Shell worktree until the user pins a tree, and stays absent while the project has a single worktree.
_Avoid_: Branch picker, dropdown, switcher

**Scope**:
Which set of changes the review reads inside the current Worktree. Three exist: Last turn, the working tree against the Turn baseline of the active Shell, which the review opens on; Uncommitted, the working tree against `HEAD`; and Branch, the whole branch against its merge-base with the default branch.
_Avoid_: Mode, filter, range

**Scope selector**:
The Header menu that names the Scope being read and offers the others. Always present, and the last control the header gives up.
_Avoid_: Tabs, segmented control, filter

**Shell turn**:
The stretch during which one Shell has its Agent working. It opens when that shell starts Working or Needs attention after being quiet, and closes when the agent stops. Each shell turns on its own — two tabs in the same project never share one.
_Avoid_: Session, run, cycle

**Turn baseline**:
What one Worktree's files looked like when a Shell's current turn opened: the commit `HEAD` pointed at, plus the content of every file that already differed from it. Bound to the tree it was taken in — a review reading another worktree has no baseline there. Held per shell while Bankai runs, replaced by that shell's next turn and dropped when its tab closes, never persisted; without one the Last turn scope has nothing to read against.
_Avoid_: Snapshot, checkpoint, stash

**Changed file**:
One file the current scope reports as differing, including a file git does not track yet. The unit the review is organized by.
_Avoid_: Diff, entry, item

**Status mark**:
The single letter that names how a changed file differs: modified, added, deleted, renamed, or untracked.
_Avoid_: State, type, kind

**Tree**:
The navigator that arranges the current scope's changed files as a folder hierarchy. It contains only changed files — never the rest of the project.
_Avoid_: Explorer, file browser, sidebar

**Prewarm**:
Preparing a mounted project's review in the background before its first activation, so the first visit paints from already-known state.
_Avoid_: Preload, eager load, warmup

**Agent**:
A CLI coding agent the user runs inside a Shell — Claude Code, Codex, or pi.
_Avoid_: Assistant, bot, AI, process

**Harness**:
The per-CLI integration that recognizes that agent's live sessions inside Shells and reads their activity. One harness per supported agent CLI.
_Avoid_: Adapter, plugin, integration, driver

**Agent session**:
A durable conversation owned by a Harness. It may outlive its Agent process and can be resumed when the Harness supports it.
_Avoid_: Shell, process, PTY

**Live agent session**:
An Agent session whose Agent process is still running inside a Shell, whether it is Working, Needs attention, or idle inside the Agent. Leaving the Agent and returning to the shell prompt ends the live session.
_Avoid_: Working session, active Shell

**Session ref**:
The durable address of an Agent session: its Harness plus the native identifier assigned by that Harness.
_Avoid_: Agent ID, Shell ID, native session ID alone

**Continuity**:
The promise that reopening Bankai returns Projects and their Shells to their last meaningful arrangement and resumes the Agent sessions that were still live. It covers the Active project, Shell order and selection, and each live Session ref, but not terminal scrollback or unsent input.
_Avoid_: Workspace, Layout preferences, snapshot

**Agent activity**:
The observed state of the Agent inside a Shell: Working, Needs attention, or Done unseen. A shell with no recognized agent, or whose finished work was already seen, carries no activity. A project's activity is the most urgent among its shells' — Needs attention over Done unseen over Working.
_Avoid_: Status, presence, agent state

**Working**:
The agent is executing an open turn — thinking, running tools, or editing. No user action is required.
_Avoid_: Busy, running, active

**Needs attention**:
The agent stopped mid-turn waiting on the user — a permission request or a question. The most urgent activity: work is blocked until the user responds.
_Avoid_: Blocked, waiting, paused, pending

**Done unseen**:
The agent finished its turn and the user has not looked at that Shell since. Clears only when the shell is viewed — its tab active in the Active project.
_Avoid_: Unread, completed, finished, new

**Activity indicator**:
The compact element left of the shell tabs, present during Fullscreen mode, that keeps every mounted project's Agent activity visible while the Project rail is hidden. Passive: activating a project stays with the rail and shortcuts.
_Avoid_: Mini rail, project dots, status bar

**Reading position**:
Where the user is inside the Review, held as the changed line at the top of the diff area rather than a pixel offset. It survives any update the user did not ask for, and starts fresh when the user changes Scope, Worktree, or Project.
_Avoid_: Scroll position, offset, scroll top

**Focused file**:
The one changed file occupying the Review's content area in full, with unchanged lines as context and changed lines still marked. The underlying Review remains present and current.
_Avoid_: Full-file view, preview, expand, open file, source view, modal

**Update button**:
The Workspace header control, left of the Fullscreen mode toggle, that appears only once a new version is downloaded and waiting. Clicking it restarts Bankai into that version; ignoring it changes nothing, since the version also applies whenever the app is closed.
_Avoid_: Update notification, toast, restart banner, upgrade prompt
