---
title: What the Mobile access toggle needs from a tailnet before it can serve anything
tags: [tailscale, server]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## HTTPS is a requirement, not a preference

The phone surface registers a service worker and subscribes to push, and browsers refuse both outside a secure context. Serving the tailnet over plain HTTP — `tailscale serve --http=80`, or binding the loopback server to the tailscale interface — would load the UI and silently cost every notification while the page is closed. That is why the pairing URL is `https://<magicdns>/#token=…` and the serve handler is pinned to 443.

## A tailnet without HTTPS certificates does not fail loudly

`tailscale serve --https=443` on a tailnet that has never enabled HTTPS certificates does not write an error to stderr. The CLI runs an interactive enablement flow (`enableFeatureInteractive` in `cmd/tailscale/cli/serve_legacy.go`): it prints the control server's instructions and an admin URL to *stdout*, then either exits 0 without configuring anything, or blocks waiting for the user to flip the switch in a browser — which, spawned from the main process, only ends at the 8s timeout.

A third ending exists when the flow itself cannot run: `error enabling https feature: …`. All three look alike from here — exposure stays false, and the first two leave nothing in stderr, so the generic path used to report "Tailscale is not answering on this machine", a remedy for a problem the user does not have.

## The capability is readable, so ask before serving

`tailscale status --json` carries `Self.CapMap`, and the key `https` is present exactly when the tailnet issues certificates (`tailcfg.CapabilityHTTPS`). `httpsProblem` reads it from the status we already fetch and names the admin DNS page; `setMobileAccess` checks it before enabling, so the blocking flow is never spawned. A node with no `DNSName` reports nothing here — that is the "Tailscale is not running" case, and it owns its own notice.
