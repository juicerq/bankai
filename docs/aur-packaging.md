---
title: How Bankai reaches Arch users through the AUR, and what each release has to touch
tags: [build, update]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## The AUR package repackages the published AppImage

`packaging/aur/` holds the `bankai-bin` PKGBUILD. Its single source is the `Bankai-<version>.AppImage` attached to the GitHub release, extracted with `--appimage-extract` and installed into `/opt/bankai`, with `/usr/bin/bankai` as a symlink and a hand-written `/usr/share/applications/bankai.desktop`. The AppImage's own `AppRun`, `bankai.desktop` and bundled `usr/lib` are dropped: the desktop entry has to call the symlink instead of `AppRun`, and the bundled libraries are covered by the declared `depends`.

`chrome-sandbox` is installed setuid root (4755), so the packaged app runs with the Chromium sandbox on. Running the binary straight out of `pkg/` for a smoke test needs `--no-sandbox` because the file is not root-owned there yet.

## The release workflow republishes the recipe by itself

The `aur` job in `.github/workflows/release.yml` runs after the Linux release inside an `archlinux:base-devel` container: it rewrites `pkgver` from the tag, lets `updpkgsums` fetch the new AppImage and recompute the checksum, builds the package as a non-root `builder` user to prove the recipe still works, regenerates `.SRCINFO`, commits the refreshed files back to `main`, and pushes them to `ssh://aur@aur.archlinux.org/bankai-bin.git`.

The push authenticates with the `AUR_SSH_KEY` secret — a key pair dedicated to CI (`~/.ssh/aur_ci` locally), separate from the maintainer's personal key. The AUR account's SSH field holds both.

The very first publish had to be manual: cloning an AUR package that does not exist yet fails, so the repo was created by pushing `HEAD:refs/heads/master` into it. The job's `git clone` only works from the second release on.

## The AUR job can only see a published release, and electron-builder will not publish one on its own

`updpkgsums` downloads the AppImage over plain HTTP, so anything that leaves the GitHub release unpublished makes the job fail with a 404. Three separate behaviours in `electron-publish`'s `gitHubPublisher.js` can do that, and none of them is fixed by `publish.releaseType` in `electron-builder.yml` — that option is only read when the release is *created* (`draft: this.releaseType === "draft"`), never when one already exists.

- Deleting a tag to re-trigger the workflow turns its release into a draft. The publisher finds it, and `if (release.draft) { return release }` hands it back untouched: assets upload into a draft that no anonymous download can reach.
- A release published more than two hours ago is refused outright, so re-running an old tag uploads nothing. `EP_GH_IGNORE_TIME` is the documented way past it, and re-uploading is safe because the publisher deletes an asset of the same name before writing the new one.
- Both refusals are `log.warn` plus `return null`, and `doUpload` then logs `skipped publishing` and returns normally. **The build stays green while publishing nothing.**

The workflow therefore does not trust the build's exit code: after `electron-builder`, it runs `gh release edit --draft=false` and asserts the `Bankai-<version>.AppImage` asset is actually listed. Both are idempotent, so a re-trigger needs no manual step.

## Self-update belongs to the AppImage, and the gate is execPath, not the env var

`electron-updater`'s Linux updater decides it is inactive when `process.env.APPIMAGE` is missing, so a package install never checks, never downloads, and never shows the update button — it only logs one warning per check. Arch users update through `yay`.

Trusting `APPIMAGE` alone would be wrong, because the variable is inherited: a Bankai shell is a child of the AppImage, so anything launched from inside Bankai — including a package-installed Bankai — sees `APPIMAGE` pointing at the *host* AppImage and would happily download an update over it. `canSelfUpdate` in `src/main/update/self-update.ts` therefore requires `process.execPath` to live inside `process.env.APPDIR`: only the running AppImage's own binary qualifies. Windows keeps updating itself.

The same inheritance poisons testing. Any packaged smoke test run from a Bankai shell must clear `APPIMAGE`, `APPDIR` and `OWD`, or the app under test believes it is an AppImage and the run proves nothing.

## Testing a packaged build against a running instance

The packaged app takes a single-instance lock keyed to its `userData` directory, so a smoke test launched while your real Bankai is open exits immediately and silently. Pass `--user-data-dir=/tmp/...` alongside `DATA_DIR=/tmp/...` to get both a separate lock and a separate store.
