---
title: How a phone gets its key, by link or by camera, and what each path needs
tags: [server, ui]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## The key travels in the fragment, so the server never sees it

The desktop QR encodes `https://<host>/#token=<token>` — host and token only, never a port. The fragment is claimed on load, written to `localStorage`, and wiped from the address bar. Because it is a fragment it never leaves the browser, which is what lets the pairing URL be a plain link.

## Scanning inside the app is the same claim, reached differently

The unpaired screen reads the QR itself when the browser can: `BarcodeDetector` plus `getUserMedia`, both gated behind `qrScanAvailable` so a browser without them falls back to the "scan it from the desktop" copy instead of showing a dead button. Both APIs need a secure context, so this only appears over the Tailscale HTTPS origin — never over plain `http://<ip>:<port>`.

A scanned code is not always for the origin doing the scanning. When the code's origin matches, the token is stored and the page reloads; when it does not, the app navigates to the scanned URL and lets the usual fragment claim run there. A code with no token in its fragment leaves the camera reading rather than closing the scanner.

## The camera is opened from a ref callback, not an effect

`useEffect` is banned in this renderer and the lint enforces it. The scanner opens the stream from the video element's ref callback and returns the teardown from it — React 19 runs a ref callback's return value as its cleanup, so leaving the screen stops the tracks. Anything holding a camera or a timer here has to release it that way; an unclosed stream leaves the phone's camera indicator lit.
