---
title: How to open the dev renderer on a phone, and why the packaged path refuses
tags: [server, env]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## The loopback server only serves the bundle packaged

`startLoopbackServer` serves the renderer from the asar, read once at boot. In development there is no asar, so the bundle route answers with "Bankai serves the renderer bundle only packaged" — the vite dev server owns the renderer then.

## Dev on the phone goes through vite, not the loopback bundle

The renderer dev server is pinned to `127.0.0.1:4697` (`electron.vite.config.ts`, `strictPort`) and proxies `/rpc` (HTTP) and `/stream` (WebSocket) to the loopback server on 4696. The Mobile access toggle points tailscale at vite by itself: `serveProxyTarget` prefers `ELECTRON_RENDERER_URL` — set by electron-vite only while the dev server owns the renderer — over the loopback port, and the exposure read uses the same target, so the toggle reflects the state it wrote.

The phone then gets HMR and the real oRPC/stream through one origin. The pairing QR stays valid — its URL carries only host and token, never a port.

The equivalent by hand, if the toggle is not involved:

```sh
tailscale serve --bg --https=443 http://127.0.0.1:4697
```

Port 5173 is left alone on purpose: something else on this machine squats it.

## A phone left open through a CSS edit needs a reload, not a bug report

Editing a component that adds Tailwind classes makes vite push an `hmr update /src/styles.css` to every open client. On a phone that has been sitting on the page, that half-applied stylesheet can leave the surface with scrollbars on both axes, as if the layout broke. It is the page's state, not the code: loading the same dev URL fresh renders at exactly the viewport width. Reload before chasing it.
