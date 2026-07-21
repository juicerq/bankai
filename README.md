# Bankai

Bankai is a focused Electron desktop prototype for running project shell sessions and validating a compact review-panel workflow.

## Prototype scope

- Persistent project list stored in Electron's user-data directory
- Native directory picker for adding projects
- Multiple real `node-pty` shell tabs per mounted project
- `xterm.js` terminal rendering, input, resizing, and scrollback
- Sample review panel with a UI-only reviewed state

The review panel uses fixed sample data and is **only for UI validation**. It does not read, modify, approve, or reject repository changes.

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
