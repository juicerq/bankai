export function installServiceWorker(): void {
	if (window.bankaiAuth || !("serviceWorker" in navigator)) {
		return;
	}

	navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
		console.error("service worker registration failed", err);
	});
}
