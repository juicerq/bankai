---
title: How Bankai reaches Arch users through the AUR, and what each release has to touch
tags: [build, update]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## The AUR package repackages the published AppImage

`packaging/aur/` holds the `bankai-bin` PKGBUILD. Its single source is the `Bankai-<version>.AppImage` attached to the GitHub release, extracted with `--appimage-extract` and installed into `/opt/bankai`, with `/usr/bin/bankai` as a symlink and a hand-written `/usr/share/applications/bankai.desktop`. The AppImage's own `AppRun`, `bankai.desktop` and bundled `usr/lib` are dropped: the desktop entry has to call the symlink instead of `AppRun`, and the bundled libraries are covered by the declared `depends`.

`chrome-sandbox` is installed setuid root (4755), so the packaged app runs with the Chromium sandbox on. Running the binary straight out of `pkg/` for a smoke test needs `--no-sandbox` because the file is not root-owned there yet.

## Every release needs three edits in the PKGBUILD

`pkgver`, `sha256sums` (of the new AppImage) and a regenerated `.SRCINFO` (`makepkg --printsrcinfo > .SRCINFO`). Nothing in CI does this yet — the AUR repo is a separate git remote (`ssh://aur@aur.archlinux.org/bankai-bin.git`) that has to be pushed by hand.

## Auto-update is dead in the AUR install

`electron-updater` only self-updates on Linux when the process is an AppImage; it reads `process.env.APPIMAGE`. A packaged install has no such variable, so `checkForUpdates` rejects and `src/main/update/ipc.ts` swallows it into a log line. The update button never appears, and Arch users update through their package manager instead.

## Testing a packaged build against a running instance

The packaged app takes a single-instance lock keyed to its `userData` directory, so a smoke test launched while your real Bankai is open exits immediately and silently. Pass `--user-data-dir=/tmp/...` alongside `DATA_DIR=/tmp/...` to get both a separate lock and a separate store.
