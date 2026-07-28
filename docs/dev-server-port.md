---
title: Which port the loopback server takes, and how to run dev beside the installed app
tags: [server, env]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## The port has three sources, and the environment wins

`serverPort` resolves `SERVER_PORT` first, then the port stored in settings, then `SERVER_DEFAULT_PORT` (4696). An `SERVER_PORT` that is not an integer in 1–65535 throws instead of quietly falling back — a typo that silently landed on 4696 would hand the dev renderer the installed app's data.

## Dev and the installed app collide on 4696 unless one moves

`DATA_DIR` already separates the two stores, but both instances ask for the same loopback port, and the second to start dies with "port 4696 on 127.0.0.1 is already in use". The vite dev server proxies `/rpc` and `/stream` to `SERVER_PORT` as well, reading the same variable at config time, so one variable moves the whole dev instance:

```sh
SERVER_PORT=4700 bun run dev
```

Setting it on only one of the two sides is the failure worth knowing: the main process would listen on the new port while the renderer's proxy still pointed at 4696, and the dev UI would be driving the installed app.

The renderer dev server stays pinned to 4697 with `strictPort`, so two *dev* instances still collide there even with different `SERVER_PORT` values.
