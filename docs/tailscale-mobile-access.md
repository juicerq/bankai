---
title: What the Mobile access toggle needs from a tailnet before it can serve anything
tags: [tailscale, server]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## HTTPS is what the good path is for, and what the way out costs

The phone surface registers a service worker and subscribes to push, and browsers refuse both outside a secure context — as they refuse the in-app QR scanner, which needs a camera. So the pairing URL is `https://<magicdns>/#token=…`, the serve handler is pinned to 443, and that stays the recommended way in.

The way out for a tailnet with no certificate is a second listener bound to the node's own `100.x` address, paired as `http://100.x.y.z:<port>/#token=…`. Everything works there except what the secure context gates: no install to the home screen, no notification while the app is closed, no camera scanner. It is an origin of its own, so pairing, token and any installed app on the HTTPS origin are untouched by it.

There is one switch, not two: turning Mobile access on takes the HTTPS path when the tailnet issues certificates and the plain tailnet address when it does not. The user never picks the transport, because the choice is not a security one — the traffic is inside the tailnet either way — only a capability one, and the panel says which one it landed on.

## A tailnet without HTTPS certificates does not fail loudly

`tailscale serve --https=443` on a tailnet that has never enabled HTTPS certificates does not write an error to stderr. The CLI runs an interactive enablement flow (`enableFeatureInteractive` in `cmd/tailscale/cli/serve_legacy.go`): it prints the control server's instructions and an admin URL to *stdout*, then either exits 0 without configuring anything, or blocks waiting for the user to flip the switch in a browser — which, spawned from the main process, only ends at the 8s timeout.

A third ending exists when the flow itself cannot run: `error enabling https feature: …`. All three look alike from here — exposure stays false, and the first two leave nothing in stderr, so the generic path used to report "Tailscale is not answering on this machine", a remedy for a problem the user does not have.

## The capability is readable, so ask before serving

`tailscale status --json` carries `Self.CapMap`, and the key `https` is present exactly when the tailnet issues certificates (`tailcfg.CapabilityHTTPS`). `tailnetIssuesCertificates` reads it from the status `setMobileAccess` already fetches and picks the route, so the blocking flow is never spawned. A node with no `DNSName` answers `true` on purpose: Tailscale is not running, and letting `serve` fail there produces the remedy that case deserves.

The missing capability is never a `problem` on `MobileAccess`. `problem` means an action failed and is painted red; the certificate state is just which route the switch took, so it only shows up as the note under an open plain listener. Reporting it before the user clicks anything painted a working panel as broken.

## Two listeners, never a rebind

The loopback listener is what Tailscale Serve proxies into, so it can never move: rebinding it to the tailnet address would break every phone that pairs over HTTPS. The tailnet listener is therefore a second `http.Server` over the same request handler and the same token, opened on `Self.TailscaleIPs`' IPv4 entry and closed on demand — the loopback one is never touched, and nothing already connected drops.

The fallback persists in settings (`server.tailnet`) and is restored at boot without blocking startup. Nothing closes it on its own: a tailnet that starts issuing certificates later leaves the plain listener open until Mobile access is turned off, because a phone may still be paired only there. The address is captured when the listener opens, so a Tailscale IP change needs a close and reopen.
