import { describe, expect, it } from "vitest";
import { WorkspaceGroups } from "@core/workspace/WorkspaceGroups";

describe("WorkspaceGroups", () => {
	it("adds a tab and selects it", () => {
		expect(WorkspaceGroups.add({ p: { tabs: ["a"], active: 0 } }, "p", "b")).toEqual({
			p: { tabs: ["a", "b"], active: 1 },
		});
	});

	it("clamps selection after removing the active tab", () => {
		expect(WorkspaceGroups.remove({ p: { tabs: ["a", "b"], active: 1 } }, "b")).toEqual({
			p: { tabs: ["a"], active: 0 },
		});
	});

	it("cycles in both directions", () => {
		const groups = { p: { tabs: ["a", "b"], active: 0 } };

		expect(WorkspaceGroups.cycle(groups, "p", -1).p?.active).toBe(1);
		expect(WorkspaceGroups.cycle(groups, "p", 1).p?.active).toBe(1);
	});

	it("rejects selection outside the group", () => {
		expect(WorkspaceGroups.select({ p: { tabs: ["a"], active: 0 } }, "p", 2)).toBeNull();
		expect(WorkspaceGroups.select({ p: { tabs: ["a"], active: 0 } }, "p", -1)).toBeNull();
	});
});
