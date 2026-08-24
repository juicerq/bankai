import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { DAEMON_IDLE_GRACE_MS, DaemonIdle } from "@main/daemon/daemon-idle";
import { DaemonProbes } from "@main/daemon/daemon-probes";
import { LiveConnections } from "@main/transport/server/live-connections";
import { assertDefined } from "./utils/assertions";

function socket() {
	const listeners: (() => void)[] = [];

	return {
		once: (_event: string, listener: () => void) => listeners.push(listener),
		close: () => {},
		disconnect: () => {
			for (const listener of listeners) {
				listener();
			}
		},
	};
}

function unattendedFuture(): number {
	return Math.max(Date.now(), DaemonProbes.lastAt()) + DAEMON_IDLE_GRACE_MS * 10;
}

function loggedMessages(): string[] {
	assertDefined(process.env.DATA_DIR);

	const path = join(process.env.DATA_DIR, "log.ndjson");
	const raw = existsSync(path) ? readFileSync(path, "utf8").trim() : "";

	if (!raw) {
		return [];
	}

	return raw.split("\n").map((line) => String(JSON.parse(line).message));
}

beforeEach(() => {
	LiveConnections.closeAll();
});

afterEach(() => {
	setSystemTime();
});

describe("daemon idle shutdown", () => {
	it("gives up only after the whole grace window passed unattended", () => {
		const idle = new DaemonIdle();
		const start = unattendedFuture();

		expect(idle.expired(start)).toBe(false);
		expect(idle.expired(start + DAEMON_IDLE_GRACE_MS - 1)).toBe(false);
		expect(idle.expired(start + DAEMON_IDLE_GRACE_MS)).toBe(true);
	});

	it("stays up as long as a client holds the stream open", () => {
		const idle = new DaemonIdle();
		const start = unattendedFuture();
		LiveConnections.track(socket());

		expect(idle.expired(start)).toBe(false);
		expect(idle.expired(start + DAEMON_IDLE_GRACE_MS * 2)).toBe(false);
	});

	it("starts the clock when the last client leaves", () => {
		const idle = new DaemonIdle();
		const start = unattendedFuture();
		const phone = socket();
		LiveConnections.track(phone);
		idle.expired(start);

		phone.disconnect();

		expect(idle.expired(start + DAEMON_IDLE_GRACE_MS)).toBe(false);
		expect(idle.expired(start + DAEMON_IDLE_GRACE_MS * 2)).toBe(true);
	});

	it("a client that arrives mid-window buys the daemon a fresh window", () => {
		const idle = new DaemonIdle();
		const start = unattendedFuture();
		idle.expired(start);
		const phone = socket();
		LiveConnections.track(phone);
		idle.expired(start + 1_000);

		phone.disconnect();

		expect(idle.expired(start + DAEMON_IDLE_GRACE_MS)).toBe(false);
	});

	it("counts a hello as a sign of life, so a booting app never adopts a dying daemon", () => {
		const idle = new DaemonIdle();
		const start = unattendedFuture();
		setSystemTime(new Date(start));
		DaemonProbes.note();

		expect(idle.expired(start)).toBe(false);
		expect(idle.expired(start + DAEMON_IDLE_GRACE_MS - 1)).toBe(false);
	});

	it("dies a full window after the last hello went stale", () => {
		const idle = new DaemonIdle();
		const start = unattendedFuture();
		setSystemTime(new Date(start));
		DaemonProbes.note();

		expect(idle.expired(start + DAEMON_IDLE_GRACE_MS)).toBe(false);
		expect(idle.expired(start + DAEMON_IDLE_GRACE_MS * 2)).toBe(true);
	});
});

describe("the last look before the daemon goes", () => {
	it("spares a daemon a client reached between the verdict and the shutdown", () => {
		const idle = new DaemonIdle();
		const start = unattendedFuture();
		setSystemTime(new Date(start));
		expect(idle.expired(Date.now())).toBe(false);
		setSystemTime(new Date(start + DAEMON_IDLE_GRACE_MS));
		expect(idle.expired(Date.now())).toBe(true);

		LiveConnections.track(socket());
		idle.stopIfStillIdle();

		expect(loggedMessages()).not.toContain("daemon:idle-shutdown");
		expect(idle.expired(Date.now())).toBe(false);
	});
});
