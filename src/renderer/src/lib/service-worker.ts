import { isBrowserClient } from "@renderer/lib/platform";

export function installServiceWorker(): void {
	if (!isBrowserClient() || !("serviceWorker" in navigator)) {
		return;
	}

	navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
		console.error("service worker registration failed", err);
	});
}
