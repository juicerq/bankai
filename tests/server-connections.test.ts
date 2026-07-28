import { describe, expect, it } from "bun:test";
import { closeLiveConnections, trackLiveConnection } from "@main/server/connections";
import { regenerateServerToken } from "@main/server/reach";

function socket() {
	const closes: { code?: number; reason?: string }[] = [];
	const listeners: (() => void)[] = [];

	return {
		closes,
		once: (_event: string, listener: () => void) => listeners.push(listener),
		close: (code?: number, reason?: string) => {
			closes.push({ code, reason });
		},
		disconnect: () => {
			for (const listener of listeners) {
				listener();
			}
		},
	};
}

describe("live stream connections", () => {
	it("drops every paired client when the token is regenerated", async () => {
		const phone = socket();
		const desk = socket();
		trackLiveConnection(phone);
		trackLiveConnection(desk);

		await regenerateServerToken();

		expect(phone.closes).toHaveLength(1);
		expect(desk.closes).toHaveLength(1);
	});

	it("closes a client only once across regenerations", async () => {
		const phone = socket();
		trackLiveConnection(phone);

		await regenerateServerToken();
		await regenerateServerToken();

		expect(phone.closes).toHaveLength(1);
	});

	it("leaves a client that already disconnected alone", () => {
		const phone = socket();
		trackLiveConnection(phone);
		phone.disconnect();

		closeLiveConnections();

		expect(phone.closes).toEqual([]);
	});
});
