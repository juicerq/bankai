# Bankai

Bankai is a focused Electron desktop prototype for running project shell sessions and validating a compact review-panel workflow.

## Prototype scope

- Persistent project list stored in Electron's user-data directory
- Native directory picker for adding projects
- Multiple real `node-pty` shell tabs per mounted project
- `xterm.js` terminal rendering, input, resizing, and scrollback
- Read-only review panel showing the project's real `git diff`

The review panel reads the selected project's working tree through `git` and renders the diff in two scopes: **Uncommitted** (working tree against `HEAD`) and **Branch** (the whole branch against its merge-base with the default branch). It polls while visible and never writes to the repository.

## Development

Requires Bun 1.3+, a supported Node/Electron native build toolchain, and Linux or Windows.

```sh
bun install
bun run check
bun run test
bun run dev
bun run build
```

`node-pty` is a native dependency. Electron Builder rebuilds it for the target Electron ABI and unpacks its native files from ASAR. Linux source builds may require Python, `make`, and a C++ compiler; Windows source builds may require Visual Studio Build Tools.

## Security boundaries

The renderer runs sandboxed with `contextIsolation`, without Node integration. ORPC uses a transferred `MessagePort`; terminal IPC exposes only open, write, resize, close, data, and exit operations through the preload. Main-process handlers validate runtime payloads and bind each PTY session to its owning `WebContents`. PTY dimensions must be positive finite integers and are capped at practical node-pty safety limits of 2,000 columns and 1,000 rows, accommodating maximized modern displays. Project paths come from persisted, main-process-owned project records selected through the native directory dialog.

## Packaging

```sh
bun run dist        # current platform
bun run dist:linux  # x64 AppImage
bun run dist:win    # x64 NSIS
```

Release publishing is configured for `juicerq/bankai`. Code signing and macOS packaging are not configured in this prototype.
