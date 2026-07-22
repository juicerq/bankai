import { afterEach, describe, expect, jest, test } from "bun:test";
import { throttle } from "@shared/throttle";

afterEach(() => jest.useRealTimers());

describe("throttle", () => {
	test("runs immediately and keeps updating during sustained calls", () => {
		jest.useFakeTimers();
		const calls: string[] = [];
		const run = throttle((value: string) => calls.push(value), 150);

		run("first");
		jest.advanceTimersByTime(50);
		run("second");
		jest.advanceTimersByTime(50);
		run("third");
		jest.advanceTimersByTime(50);

		expect(calls).toEqual(["first", "third"]);

		run("fourth");
		jest.advanceTimersByTime(150);

		expect(calls).toEqual(["first", "third", "fourth"]);
	});

	test("cancels a pending trailing call", () => {
		jest.useFakeTimers();
		const calls: string[] = [];
		const run = throttle((value: string) => calls.push(value), 150);

		run("first");
		run("pending");
		run.cancel();
		jest.advanceTimersByTime(150);

		expect(calls).toEqual(["first"]);
	});
});
