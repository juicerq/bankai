---
title: Why the main process is Node and never Bun, and what that does to a benchmark
tags: [build, test]
updated_at: 2026-07-26
created_at: 2026-07-26
---

## Bun owns the tooling, nothing at runtime

Bankai ships as an Electron app, so `src/main` and `src/preload` run on Electron's Node runtime and `src/renderer` runs in Chromium. `Bun.file`, `Bun.spawn` and `Bun.$` do not exist in any of them. Bun owns the package manager, `bun test`, and the release workflow — nothing at runtime.

A swap to a Bun API in `src/main` passes `bun test`, because tests do run under Bun, and then fails in the packaged app.

## Benchmark main-process code under node, not bun

Bun's I/O is several times faster and will understate the real cost. Measured on the same `/proc` walk: 2.4 ms under Bun, 15.1 ms under Node.
