import { describe, expect, test } from "bun:test";
import { initialShellTopology, newShellTab } from "@renderer/routes/-utils/shell-topology";

describe("initialShellTopology", () => {
	test("creates a default shell and marks it for registration when nothing is restored", () => {
		const topology = initialShellTopology();

		expect(topology.tabs).toHaveLength(1);
		expect(topology.tabs[0]?.label).toBe("Shell 1");
		expect(topology.defaultShell).toBe(topology.tabs[0]);
		expect(topology.nextShellNumber).toBe(2);
	});

	test("treats an empty restored list as a fresh workspace", () => {
		const topology = initialShellTopology([]);

		expect(topology.tabs[0]?.label).toBe("Shell 1");
		expect(topology.defaultShell).toBe(topology.tabs[0]);
	});

	test("restores tabs and their order without a phantom default", () => {
		const shells = [
			{ id: "s1", label: "Shell 1" },
			{ id: "s2", label: "Shell 2" },
		];

		const topology = initialShellTopology(shells);

		expect(topology.tabs).toEqual(shells);
		expect(topology.defaultShell).toBeUndefined();
	});

	test("derives the next shell number from the highest restored Shell N label", () => {
		const shells = [
			{ id: "s1", label: "Shell 1" },
			{ id: "s3", label: "Shell 3" },
			{ id: "x", label: "notes" },
		];

		expect(initialShellTopology(shells).nextShellNumber).toBe(4);
	});

	test("ignores restored labels that do not match the Shell N pattern", () => {
		expect(initialShellTopology([{ id: "x", label: "notes" }]).nextShellNumber).toBe(1);
	});
});

describe("newShellTab", () => {
	test("leaves the harness flag off a shell that never asked to skip it", () => {
		expect(newShellTab(2)).toEqual({ id: expect.any(String), label: "Shell 2" });
	});

	test("carries the request for a shell with no harness", () => {
		expect(newShellTab(2, true).plain).toBe(true);
	});
});
