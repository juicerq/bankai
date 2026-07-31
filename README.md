# Bankai

Bankai is a personal Electron desktop app for running project shell sessions alongside a compact, read-only git review panel.

## Features

- Persistent project list stored in Electron's user-data directory
- Native directory picker for adding projects
- Multiple real `node-pty` shell tabs per project
- `xterm.js` terminal rendering, input, resizing, and scrollback
- Toggleable, resizable review panel showing the project's real `git diff`

The review panel reads the selected project's working tree through `git` and renders the diff in two scopes: **Uncommitted** (working tree against `HEAD`) and **Branch** (the whole branch against its merge-base with the default branch). It polls while visible and never writes to the repository.

## Install

On Arch Linux, install [`bankai-bin`](https://aur.archlinux.org/packages/bankai-bin) from the AUR:

```sh
yay -S bankai-bin
```

Anywhere else, download the latest `.AppImage` from the [releases page](https://github.com/juicerq/bankai-2/releases), then run it:

```sh
chmod +x Bankai-*.AppImage
./Bankai-*.AppImage
```

The AppImage updates itself. The AUR package does not — update it with `yay`.

## Development

Requires Bun 1.3+, a supported Node/Electron native build toolchain, and Linux or Windows.

```sh
bun install
bun run check
bun run test
bun run dev
bun run build
```

The development window announces itself as `bankai-dev.desktop`, so it carries an amber blade instead of the production white one and the two are tellable apart in a taskbar. On Linux, install that entry once per machine:

```sh
rsvg-convert -w 512 -h 512 build/icon-dev.svg -o ~/.local/share/icons/hicolor/512x512/apps/bankai-dev.png
cp build/bankai-dev.desktop ~/.local/share/applications/
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

Pushing a `v*` tag triggers the release workflow, which builds the Linux AppImage and publishes it to a GitHub release on `juicerq/bankai-2`. Run the `release windows` workflow with that tag to attach the Windows NSIS installer. Code signing and macOS packaging are not configured.
