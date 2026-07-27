import { describe, expect, test } from "bun:test";
import type { ShellTrace } from "@main/activity/AgentActivity";
import { TRACE_DWELL_MS, TRACE_QUEUE_CAP, TraceDwell } from "@main/activity/TraceDwell";

const SHELL = "shell-1";

function traces(label: string, since = 1000): Map<string, ShellTrace> {
	return new Map([[SHELL, { label, since }]]);
}

const alone = new Set<string>();

describe("holding a label long enough to read", () => {
	test("shows the first label at once", () => {
		const dwell = new TraceDwell();

		expect(dwell.next({ traces: traces("Reading a.ts"), immediate: alone, now: 0 }).visible.get(SHELL)?.label)
			.toBe("Reading a.ts");
	});

	test("holds a label until the floor passes, then shows the next", () => {
		const dwell = new TraceDwell();
		dwell.next({ traces: traces("Reading a.ts"), immediate: alone, now: 0 });

		const held = dwell.next({ traces: traces("Reading b.ts"), immediate: alone, now: 20 });
		expect(held.visible.get(SHELL)?.label).toBe("Reading a.ts");
		expect(held.wakeIn).toBe(TRACE_DWELL_MS - 20);

		const drained = dwell.next({ traces: traces("Reading b.ts"), immediate: alone, now: TRACE_DWELL_MS });
		expect(drained.visible.get(SHELL)?.label).toBe("Reading b.ts");
		expect(drained.wakeIn).toBeUndefined();
	});

	test("changes label with no delay once the floor has already passed", () => {
		const dwell = new TraceDwell();
		dwell.next({ traces: traces("Thinking"), immediate: alone, now: 0 });

		const next = dwell.next({ traces: traces("Reading a.ts"), immediate: alone, now: TRACE_DWELL_MS + 1 });
		expect(next.visible.get(SHELL)?.label).toBe("Reading a.ts");
	});

	test("drains a burst in order and leaves the last label on screen", () => {
		const dwell = new TraceDwell();
		const seen: string[] = [];
		dwell.next({ traces: traces("Thinking"), immediate: alone, now: 0 });
		for (const [index, label] of ["Reading a.ts", "Reading b.ts"].entries()) {
			seen.push(dwell.next({ traces: traces(label), immediate: alone, now: 20 + index }).visible.get(SHELL)?.label ?? "");
		}

		let now = 20;
		for (let step = 0; step < 3; step++) {
			now += TRACE_DWELL_MS;
			seen.push(dwell.next({ traces: traces("Reading b.ts"), immediate: alone, now }).visible.get(SHELL)?.label ?? "");
		}

		expect(seen).toEqual([
			"Thinking",
			"Thinking",
			"Reading a.ts",
			"Reading b.ts",
			"Reading b.ts",
		]);
	});

	test("drops the middle of a burst longer than the queue instead of falling behind", () => {
		const dwell = new TraceDwell();
		dwell.next({ traces: traces("Thinking"), immediate: alone, now: 0 });
		for (const [index, label] of ["one", "two", "three", "four"].entries()) {
			dwell.next({ traces: traces(label), immediate: alone, now: 20 + index });
		}

		const drained = [1, 2, 3].map((step) =>
			dwell.next({ traces: traces("four"), immediate: alone, now: 20 + step * TRACE_DWELL_MS }).visible.get(SHELL)
				?.label
		);

		expect(drained).toEqual(["three", "four", "four"]);
		expect(TRACE_QUEUE_CAP).toBe(2);
	});

	test("keeps the count anchored to the moment the held label happened", () => {
		const dwell = new TraceDwell();
		dwell.next({ traces: traces("Reading a.ts", 900), immediate: alone, now: 0 });
		dwell.next({ traces: traces("Reading b.ts", 1000), immediate: alone, now: 20 });

		const drained = dwell.next({ traces: traces("Reading b.ts", 1000), immediate: alone, now: TRACE_DWELL_MS });
		expect(drained.visible.get(SHELL)?.since).toBe(1000);
	});

	test("shows a state the user must act on immediately", () => {
		const dwell = new TraceDwell();
		dwell.next({ traces: traces("Reading a.ts"), immediate: alone, now: 0 });

		const urgent = dwell.next({ traces: traces("Needs permission"), immediate: new Set([SHELL]), now: 20 });
		expect(urgent.visible.get(SHELL)?.label).toBe("Needs permission");
		expect(urgent.wakeIn).toBeUndefined();
	});

	test("drops the queue of a shell that disappeared", () => {
		const dwell = new TraceDwell();
		dwell.next({ traces: traces("Reading a.ts"), immediate: alone, now: 0 });
		dwell.next({ traces: traces("Reading b.ts"), immediate: alone, now: 20 });
		dwell.next({ traces: new Map(), immediate: alone, now: 30 });

		expect(dwell.next({ traces: traces("Thinking"), immediate: alone, now: 40 }).visible.get(SHELL)?.label)
			.toBe("Thinking");
	});
});
