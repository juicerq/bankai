import { describe, expect, it } from "vitest";
import { SPLIT_RATIO_DEFAULT, SPLIT_RATIO_MAX, SPLIT_RATIO_MIN } from "@core/workspace/WorkspaceGroup";
import { WorkspaceGroups } from "@core/workspace/WorkspaceGroups";

const tab = (id: string, split = false, splitRatio = SPLIT_RATIO_DEFAULT) => ({ id, split, splitRatio });

describe("WorkspaceGroups", () => {
	it("adds a tab and selects it", () => {
		expect(WorkspaceGroups.add({ p: { tabs: [tab("a")], active: 0 } }, "p", "b")).toEqual({
			p: { tabs: [tab("a"), tab("b")], active: 1 },
		});
	});

	it("clamps selection after removing the active tab", () => {
		expect(WorkspaceGroups.remove({
			p: { tabs: [tab("a"), tab("b")], active: 1 },
		}, "b")).toEqual({
			p: { tabs: [tab("a")], active: 0 },
		});
	});

	it("cycles in both directions", () => {
		const groups = { p: { tabs: [tab("a"), tab("b")], active: 0 } };

		expect(WorkspaceGroups.cycle(groups, "p", -1).p?.active).toBe(1);
		expect(WorkspaceGroups.cycle(groups, "p", 1).p?.active).toBe(1);
	});

	it("rejects selection outside the group", () => {
		expect(WorkspaceGroups.select({ p: { tabs: [tab("a")], active: 0 } }, "p", 2)).toBeNull();
		expect(WorkspaceGroups.select({ p: { tabs: [tab("a")], active: 0 } }, "p", -1)).toBeNull();
	});

	it("toggles the split of the active tab only", () => {
		const groups = {
			p: { tabs: [tab("a"), tab("b")], active: 1 },
		};

		expect(WorkspaceGroups.toggleSplit(groups, "p")).toEqual({
			p: { tabs: [tab("a"), tab("b", true)], active: 1 },
		});
	});

	it("adjusts the split ratio of the active tab only", () => {
		const groups = {
			p: { tabs: [tab("a"), tab("b")], active: 1 },
		};

		const next = WorkspaceGroups.adjustSplitRatio(groups, "p", 0.05);
		expect(next.p?.tabs[0]?.splitRatio).toBe(SPLIT_RATIO_DEFAULT);
		expect(next.p?.tabs[1]?.splitRatio).toBeCloseTo(0.55);
	});

	it("clamps the ratio to its bounds on both sides", () => {
		const wide = { p: { tabs: [tab("a", false, SPLIT_RATIO_MAX)], active: 0 } };
		expect(WorkspaceGroups.adjustSplitRatio(wide, "p", 0.05).p?.tabs[0]?.splitRatio).toBe(SPLIT_RATIO_MAX);

		const narrow = { p: { tabs: [tab("a", false, SPLIT_RATIO_MIN)], active: 0 } };
		expect(WorkspaceGroups.adjustSplitRatio(narrow, "p", -0.05).p?.tabs[0]?.splitRatio).toBe(SPLIT_RATIO_MIN);
	});
});
