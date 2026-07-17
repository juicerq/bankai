import { describe, expect, it } from "vitest";
import { procFs } from "@core/proc/procFs";

describe("procFs", () => {
	it("reads the live kernel process table for the running test process", async () => {
		expect(await procFs.pids()).toContain(process.pid);
		expect(await procFs.parent(process.pid)).toBe(process.ppid);
		expect(await procFs.procStart(process.pid)).toMatch(/^\d+$/);

		const argv = await procFs.cmdline(process.pid);
		expect(argv?.length).toBeGreaterThan(0);
		expect(argv?.every((part) => part.length > 0)).toBe(true);
	});

	it("returns nulls for a pid absent from the table", async () => {
		const live = new Set(await procFs.pids());
		let dead = 999_999;
		while (live.has(dead)) {
			dead++;
		}

		expect(await procFs.parent(dead)).toBeNull();
		expect(await procFs.procStart(dead)).toBeNull();
		expect(await procFs.foreground(dead)).toBeNull();
		expect(await procFs.cmdline(dead)).toBeNull();
	});
});
