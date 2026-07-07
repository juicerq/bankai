import { describe, expect, it } from "vitest";
import { Flags } from "@core/store/flags";

describe("flags", () => {
	it("returns no flags for an unknown session", async () => {
		expect(await Flags.get("s1")).toEqual([]);
	});

	it("flags a whole turn and reads it back", async () => {
		await Flags.setFlag({ sessionId: "s1", turnId: "s1:0", flagged: true });
		expect(await Flags.get("s1")).toEqual([{ turnId: "s1:0" }]);
	});

	it("flags a specific line without collapsing to the turn", async () => {
		await Flags.setFlag({
			sessionId: "s1",
			turnId: "s1:0",
			path: "/a.ts",
			line: 3,
			flagged: true,
		});
		expect(await Flags.get("s1")).toEqual([
			{ turnId: "s1:0", path: "/a.ts", line: 3 },
		]);
	});

	it("keeps a turn flag and a line flag on the same turn distinct", async () => {
		await Flags.setFlag({ sessionId: "s1", turnId: "s1:0", flagged: true });
		const flags = await Flags.setFlag({
			sessionId: "s1",
			turnId: "s1:0",
			path: "/a.ts",
			line: 3,
			flagged: true,
		});
		expect(flags).toEqual([
			{ turnId: "s1:0" },
			{ turnId: "s1:0", path: "/a.ts", line: 3 },
		]);
	});

	it("unflags a line without touching the turn flag", async () => {
		await Flags.setFlag({ sessionId: "s1", turnId: "s1:0", flagged: true });
		await Flags.setFlag({
			sessionId: "s1",
			turnId: "s1:0",
			path: "/a.ts",
			line: 3,
			flagged: true,
		});
		const flags = await Flags.setFlag({
			sessionId: "s1",
			turnId: "s1:0",
			path: "/a.ts",
			line: 3,
			flagged: false,
		});
		expect(flags).toEqual([{ turnId: "s1:0" }]);
	});

	it("keeps flags isolated per session", async () => {
		await Flags.setFlag({ sessionId: "a", turnId: "a:0", flagged: true });
		await Flags.setFlag({ sessionId: "b", turnId: "b:0", flagged: true });
		expect(await Flags.get("a")).toEqual([{ turnId: "a:0" }]);
		expect(await Flags.get("b")).toEqual([{ turnId: "b:0" }]);
	});
});
