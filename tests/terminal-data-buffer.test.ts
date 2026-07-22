import { afterEach, describe, expect, jest, test } from "bun:test";
import {
	TERMINAL_DATA_FLUSH_MS,
	TerminalDataBuffer,
} from "@main/terminal/TerminalDataBuffer";

afterEach(() => jest.useRealTimers());

describe("terminal data buffer", () => {
	test("batches chunks in order with low latency", () => {
		jest.useFakeTimers();
		const emitted: string[] = [];
		const output = new TerminalDataBuffer((data) => emitted.push(data));

		output.append("first");
		output.append(" second");
		jest.advanceTimersByTime(TERMINAL_DATA_FLUSH_MS - 1);

		expect(emitted).toEqual([]);

		output.append(" third");
		jest.advanceTimersByTime(1);

		expect(emitted).toEqual(["first second third"]);
	});

	test("keeps session buffers independent", () => {
		jest.useFakeTimers();
		const firstSession: string[] = [];
		const secondSession: string[] = [];
		const first = new TerminalDataBuffer((data) => firstSession.push(data));
		const second = new TerminalDataBuffer((data) => secondSession.push(data));

		first.append("a");
		second.append("1");
		first.append("b");
		second.append("2");
		jest.advanceTimersByTime(TERMINAL_DATA_FLUSH_MS);

		expect(firstSession).toEqual(["ab"]);
		expect(secondSession).toEqual(["12"]);
	});

	test("flushes data before close and data produced while the process exits", () => {
		jest.useFakeTimers();
		const emitted: string[] = [];
		const output = new TerminalDataBuffer((data) => emitted.push(data));

		output.append("before close");
		output.flush();
		output.append("during close");
		output.dispose();
		jest.advanceTimersByTime(TERMINAL_DATA_FLUSH_MS);

		expect(emitted).toEqual(["before close", "during close"]);
	});

	test("flushes pending data exactly once when disposed", () => {
		jest.useFakeTimers();
		const emitted: string[] = [];
		const output = new TerminalDataBuffer((data) => emitted.push(data));

		output.append("before exit");
		output.dispose();
		output.dispose();
		jest.advanceTimersByTime(TERMINAL_DATA_FLUSH_MS);
		output.append("after exit");
		jest.advanceTimersByTime(TERMINAL_DATA_FLUSH_MS);

		expect(emitted).toEqual(["before exit"]);
	});
});
