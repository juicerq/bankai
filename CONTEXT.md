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

**Project badges**:
The row above the session list that narrows it to chosen Projects. Each badge toggles its own Project and they accumulate; with none active every session is listed. The Project rail's footer rows toggle the same set. It never changes the Selected session, and it is forgotten when Bankai closes.
_Avoid_: Filter, chips, tabs, segmented control

**Project picker**:
The overlay that mounts a Project, built around one editable path: typing narrows the directory it names, Enter opens the highlighted directory, and Ctrl+Enter mounts whatever the path currently reads. The system dialog stays behind it as an escape hatch.
_Avoid_: File picker, directory dialog, file browser, modal

**Shell picker**:
The overlay that names which Project a new Shell opens in. It is what the header `+` and `Ctrl+X T` reach for once more than one Project is mounted; with a single one they create straight away. Typing narrows by Project name, Enter creates in the highlighted one, and it opens highlighting the Project the selected Shell belongs to, so the shortcut still creates here without a second thought.
_Avoid_: Command palette, project switcher, quick open, modal

**Focus mode**:
The internal layout state that gives the Workspace's content the whole window: the Project rail leaves its fixed position and the top band — the Workspace header and the window controls — disappears with it. Each hidden region returns over the content while the pointer rests at its own edge. Entered by the explicit toggle or by dragging the rail's divider below the rail's minimum width. Exited by the toggle or by resizing the revealed rail, which docks it at the chosen width.
_Avoid_: Fullscreen mode, native fullscreen, system fullscreen, collapsed rail, zen mode

**Divider**:
The draggable hairline between two adjacent regions that trades width between them. Every divider supports pointer drag and keyboard steps.
_Avoid_: Resize handle, separator, splitter, gutter

**Layout preferences**:
The user's chosen region widths, Focus mode state, and panel visibility (Review panel and Tree open or closed), remembered across app launches. Global to the app, not per project.
_Avoid_: Panel sizes, UI state

**Shell**:
One live terminal session running inside a project.
_Avoid_: Terminal, tab, session, PTY

**Selected session**:
The one Shell the Workspace shows and every session gesture acts on. Exactly one exists across all mounted Projects, and the Active project is a consequence of which session is selected rather than something set on its own.
_Avoid_: Active shell, current tab, focused session, active session

**Project command**:
A saved command line belonging to a Project, kept across app launches and run from the Commands modal. Each one is of a single kind: a Task or a Service.
_Avoid_: Script, alias, preset, shortcut

**Commands modal**:
The overlay that lists a Project's Project commands and is where they are created, edited, deleted and run.
_Avoid_: Command palette, runner, settings panel

**Task**:
The Project command kind that opens a Shell and runs there, listed among the sessions like any other Shell.
_Avoid_: Job, one-shot, script run

**Service**:
The Project command kind that runs detached in the background, outside the session list and with no Shell of its own. It may be flagged to start when Bankai opens.
_Avoid_: Daemon, background task, server, process

**Service state**:
The running disposition of a Service: running, stopped, or failed. Held only while Bankai runs — nothing is running until Bankai starts it again.
_Avoid_: Status, health, lifecycle

**Services list**:
The section at the foot of the session list that names every Service across every mounted Project, shows each one's Service state, and carries the actions on it.
_Avoid_: Tray, dock, panel, footer

**Service output**:
The read-only reading of what a Service printed. It belongs to the Service rather than to a Project, and it outlives the process that produced it until that Service starts again or Bankai closes.
_Avoid_: Logs, console, terminal, Shell

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
A conversational CLI coding agent the user runs inside a Shell — Claude Code, Codex, or pi. One-shot and headless commands from the same CLI are ordinary shell processes, not Agents.
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

**Session name**:
The line that says what a Shell is about, and the only part of its card the user reads to find it again. It has one owner at a time: the user, once they have named it by hand, and otherwise whatever source the Harness makes available — a name the agent CLI publishes about its own conversation, or one derived from the conversation. A Shell nobody has named yet falls back to its branch.
_Avoid_: Title, label, tag, description

**Naming milestone**:
A point in a Shell's life at which its Session name is worth reconsidering, counted in Shell turns and spaced further apart as the session grows. It exists because a conversation's subject settles late — the opening message is the worst evidence available — while a name that moves every turn stops being a landmark.
_Avoid_: Refresh, interval, poll, tick

**Agent activity**:
The current disposition of Agent work in a Shell: Working, Needs attention, or Done. A Shell with no recognized Agent turn carries no activity. A project's activity is the most urgent among its Shells' — Needs attention over Done over Working.
_Avoid_: Status, presence, agent state

**Working**:
The agent is executing an open turn — thinking, running tools, or editing. No user action is required.
_Avoid_: Busy, running, active

**Needs attention**:
The agent stopped mid-turn waiting on the user — a permission request or a question. The most urgent activity: work is blocked until the user responds.
_Avoid_: Blocked, waiting, paused, pending

**Done**:
The Agent finished the latest Shell turn, and the Shell still awaits the user's next decision: start another turn, archive it, or close it. Looking at the Shell does not resolve it. A turn only reaches it once the Agent has stayed quiet: an Agent goes quiet for seconds between handing work to a subagent and picking the turn back up, and that gap is still Working.
_Avoid_: Done unseen, unread, completed, finished, new

**Activity indicator**:
The compact element left of the shell tabs, present during Focus mode, that keeps every mounted project's Agent activity visible while the Project rail is hidden. Passive: activating a project stays with the rail and shortcuts.
_Avoid_: Mini rail, project dots, status bar

**Reading position**:
Where the user is inside the Review, held as the changed line at the top of the diff area rather than a pixel offset. It survives any update the user did not ask for, and starts fresh when the user changes Scope, Worktree, or Project.
_Avoid_: Scroll position, offset, scroll top

**Focused file**:
The one changed file occupying the Review's content area in full, with unchanged lines as context and changed lines still marked. The underlying Review remains present and current.
_Avoid_: Full-file view, preview, expand, open file, source view, modal

**Update button**:
The Workspace header control, left of the Focus mode toggle, that appears only once a new version is downloaded and waiting. It names that version on its face rather than behind a hover, so it reads as an offer and not as a state. Clicking it restarts Bankai into that version; ignoring it changes nothing, since the version also applies whenever the app is closed.
_Avoid_: Update notification, toast, restart banner, upgrade prompt

**Mobile surface**:
The phone-sized presentation of Bankai a browser receives: the session list and its Conversations. It is the only surface a browser gets, regardless of screen size.
_Avoid_: Mobile app, responsive view, mobile mode

**Conversation**:
The reading of one Shell's Agent session as exchanged messages — the user's prompts, the agent's replies, and its tool activity — with the Composer beneath it.
_Avoid_: Chat, thread, transcript view, messages screen

**Composer**:
The fixed input area at the bottom of a Conversation that sends the user's next prompt to the Agent. While the Agent is Working it offers Stop instead of send; without a Live agent session it is disabled.
_Avoid_: Input, message box, prompt field, text bar

**Attention card**:
The labelled prompt shown above the Composer while a Shell Needs attention, naming what the Agent is asking and offering the discrete responses. When nothing fresh names the request, the Keypad stands in.
_Avoid_: Permission dialog, approval buttons, action sheet

**Keypad**:
The generic row of terminal keys the Mobile surface offers whenever a Shell Needs attention, able to answer any prompt the Attention card cannot name.
_Avoid_: Shortcut bar, button row, fallback buttons

**Pairing**:
The act that grants a phone access to Bankai: scanning the QR from the desktop settings, which carries the address and the token in one gesture. Losing or regenerating the token returns every phone to the pairing screen.
_Avoid_: Login, sign in, setup, connect

**Mobile access**:
The desktop setting that exposes Bankai to the user's tailnet so phones can reach it. Off by default; turning it off unexposes without touching running work.
_Avoid_: Server toggle, remote mode, sharing
