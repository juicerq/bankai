self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
	if (!event.data) {
		return;
	}

	const payload = event.data.json();

	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			data: payload.data,
			icon: "/icon-192.png",
			badge: "/icon-192.png",
			tag: payload.data?.shellId,
			renotify: true,
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();

	const shellId = event.notification.data?.shellId;

	event.waitUntil(openConversation(shellId ? `/mobile/${shellId}` : "/mobile"));
});

async function openConversation(path) {
	const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
	const client = windows[0];

	if (!client) {
		await self.clients.openWindow(path);

		return;
	}

	const navigated = await client.navigate(path).catch(() => client);
	await (navigated ?? client).focus();
}
