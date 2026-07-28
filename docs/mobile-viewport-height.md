---
title: How the mobile surface sizes itself, and why 100dvh loses the composer
tags: [ui]
updated_at: 2026-07-28
created_at: 2026-07-28
---

## The composer disappears when dvh outlives the visible area

Reported symptom: after leaving the app, staying away, or turning the phone screen off and on, everything works — the list, the badge filter, entering and leaving a conversation, the conversation content itself — except the chat input, which is simply not on screen. No DISCONNECTED overlay, no empty conversation, so nothing in the stream or in the session-ref projection is involved.

`html, body, #root` are locked to `height: 100dvh` with `overflow: hidden` (`src/renderer/src/styles.css`). The conversation screen is a flex column whose last child is the composer. When the browser restores a frozen page — especially with the software keyboard open at freeze time — the visual viewport is smaller than the `dvh` the layout already committed to. The excess hangs below the visible area, the composer goes with it, and `overflow: hidden` removes any way to scroll to it. Rotating the phone forces a resize and brings it back; that is the cheap confirmation.

`dvh` is recalculated on the transitions the browser recognises (address bar showing and hiding, mainly). Restoring a backgrounded tab is not reliably one of them, and `interactive-widget=resizes-content` in the viewport meta does not cover it either.

## The mobile surface is measured, not deduced

`useVisualViewport` (`src/renderer/src/routes/mobile/-utils/use-visual-viewport.ts`) is a ref callback on a wrapper in the mobile route that writes `window.visualViewport.height` into the element's inline height and `offsetTop` into a `translateY`, on the viewport's `resize` and `scroll` plus the window's `pageshow`. That is the only measurement that follows the keyboard, the address bar and a bfcache restore at once. `pageshow` is the event that fires on the restore path where `resize` may not.

The wrapper is `fixed inset-x-0 top-0` with `h-dvh` as the class-level fallback for anything without `visualViewport`, so it escapes the `overflow: hidden` on `#root` instead of being clipped by it. The screens keep using `h-full`, which now resolves against the measured wrapper.

The `translateY` is not decoration: on iOS the address bar shifts the visual viewport without changing its height, and a container that ignores `offsetTop` drifts. It also gives the two `fixed inset-0` sheets (new shell, session actions) the measured box as their containing block, so they cover exactly the visible area rather than the layout viewport.
