import { describe, expect, it } from "bun:test";
import { LiveConnections } from "@main/transport/server/live-connections";
import { Reach } from "@main/transport/server/server-reach";

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
		LiveConnections.track(phone);
		LiveConnections.track(desk);

		await Reach.regenerateToken();

		expect(phone.closes).toHaveLength(1);
		expect(desk.closes).toHaveLength(1);
	});

	it("closes a client only once across regenerations", async () => {
		const phone = socket();
		LiveConnections.track(phone);

		await Reach.regenerateToken();
		await Reach.regenerateToken();

		expect(phone.closes).toHaveLength(1);
	});

	it("leaves a client that already disconnected alone", () => {
		const phone = socket();
		LiveConnections.track(phone);
		phone.disconnect();

		LiveConnections.closeAll();

		expect(phone.closes).toEqual([]);
	});
});
