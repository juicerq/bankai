import { expect, test } from "bun:test";
import { type HeartbeatSocket, sweepSockets } from "@main/transport/stream/stream-heartbeat";

class FakeSocket implements HeartbeatSocket {
	pings = 0;
	terminated = 0;
	private pongs: (() => void)[] = [];

	ping() {
		this.pings += 1;
	}

	terminate() {
		this.terminated += 1;
	}

	once(_event: "pong", listener: () => void) {
		this.pongs.push(listener);
	}

	pong() {
		for (const listener of this.pongs) {
			listener();
		}
		this.pongs = [];
	}
}

test("a socket is pinged before anything is concluded about it", () => {
	const socket = new FakeSocket();

	sweepSockets([socket], new WeakSet());

	expect(socket.pings).toBe(1);
	expect(socket.terminated).toBe(0);
});

test("a socket that answered the last ping is pinged again, never terminated", () => {
	const socket = new FakeSocket();
	const pending = new WeakSet<HeartbeatSocket>();

	sweepSockets([socket], pending);
	socket.pong();
	sweepSockets([socket], pending);

	expect(socket.pings).toBe(2);
	expect(socket.terminated).toBe(0);
});

test("a socket that never answered is terminated instead of lingering half open", () => {
	const socket = new FakeSocket();
	const pending = new WeakSet<HeartbeatSocket>();

	sweepSockets([socket], pending);
	sweepSockets([socket], pending);

	expect(socket.terminated).toBe(1);
	expect(socket.pings).toBe(1);
});
