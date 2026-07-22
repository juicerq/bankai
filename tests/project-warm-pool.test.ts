import { expect, it } from "bun:test";
import { ProjectWarmPool } from "@renderer/routes/-utils/project-warm-pool";

it("keeps an inactive project warm for fifteen minutes", () => {
	const timers = new ManualTimers();
	const pool = new ProjectWarmPool(timers.schedule);

	pool.deactivate("alpha");
	expect(pool.getSnapshot()).toEqual(["alpha"]);
	expect(timers.at(0).delay).toBe(15 * 60 * 1000);

	timers.run(0);
	expect(pool.getSnapshot()).toEqual([]);
});

it("cancels expiration when a project becomes active again", () => {
	const timers = new ManualTimers();
	const pool = new ProjectWarmPool(timers.schedule);

	pool.deactivate("alpha");
	pool.activate("alpha");
	timers.run(0);

	expect(timers.at(0).cancelled).toBe(true);
	expect(pool.getSnapshot()).toEqual([]);
});

it("releases pending expirations with its last subscriber", () => {
	const timers = new ManualTimers();
	const pool = new ProjectWarmPool(timers.schedule);
	const unsubscribe = pool.subscribe(() => {});

	pool.deactivate("alpha");
	unsubscribe();
	timers.run(0);

	expect(timers.at(0).cancelled).toBe(true);
	expect(pool.getSnapshot()).toEqual([]);
});

it("keeps only the two most recently inactive projects warm", () => {
	const timers = new ManualTimers();
	const pool = new ProjectWarmPool(timers.schedule);

	pool.deactivate("alpha");
	pool.deactivate("beta");
	pool.deactivate("gamma");

	expect(pool.getSnapshot()).toEqual(["gamma", "beta"]);
	expect(timers.at(0).cancelled).toBe(true);
});

class ManualTimers {
	private readonly timers: { callback: () => void; delay: number; cancelled: boolean }[] = [];

	readonly schedule = (callback: () => void, delay: number) => {
		const timer = { callback, delay, cancelled: false };
		this.timers.push(timer);
		return () => {
			timer.cancelled = true;
		};
	};

	at(index: number) {
		const timer = this.timers[index];
		if (!timer) {
			throw new Error(`Missing timer ${index}`);
		}
		return timer;
	}

	run(index: number) {
		const timer = this.at(index);
		if (!timer.cancelled) {
			timer.callback();
		}
	}
}
