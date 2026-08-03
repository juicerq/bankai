import { describe, expect, it } from "bun:test";
import { Startup } from "@main/startup";

describe("startup timing", () => {
	it("reports each stage as the time since the one before it", () => {
		expect(Startup.steps([
			{ stage: "main-module", elapsedMs: 120 },
			{ stage: "app-ready", elapsedMs: 200 },
			{ stage: "ready-to-show", elapsedMs: 650 },
		])).toEqual([
			{ stage: "main-module", elapsedMs: 120, stepMs: 120 },
			{ stage: "app-ready", elapsedMs: 200, stepMs: 80 },
			{ stage: "ready-to-show", elapsedMs: 650, stepMs: 450 },
		]);
	});

	it("orders stages by elapsed time so a late-arriving mark cannot report a negative step", () => {
		expect(Startup.steps([
			{ stage: "ready-to-show", elapsedMs: 650 },
			{ stage: "content-loaded", elapsedMs: 600 },
		]).map((step) => step.stepMs)).toEqual([600, 50]);
	});

	it("reports nothing for a boot that recorded no marks", () => {
		expect(Startup.steps([])).toEqual([]);
	});
});
