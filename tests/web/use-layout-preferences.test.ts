import "./register-dom";
import { describe, expect, test } from "bun:test";
import { DEFAULT_RAIL_WIDTH, MAX_RAIL_WIDTH, MIN_RAIL_WIDTH } from "@renderer/routes/-features/workspace/layout/rail-layout";
import {
	DEFAULT_DIFF_WIDTH,
	DEFAULT_TREE_WIDTH,
	MIN_DIFF_WIDTH,
	MIN_TREE_WIDTH,
} from "@renderer/routes/-features/review/panel/review-layout";
import { clampLayout } from "@renderer/routes/-features/workspace/layout/use-layout-preferences";

describe("clampLayout", () => {
	test("falls back to the region defaults when nothing is stored", () => {
		expect(clampLayout(null)).toEqual({
			railWidth: DEFAULT_RAIL_WIDTH,
			diffWidth: DEFAULT_DIFF_WIDTH,
			treeWidth: DEFAULT_TREE_WIDTH,
			fullscreen: false,
			reviewOpen: true,
			reviewExpanded: false,
			treeOpen: true,
		});
	});

	test("clamps a stale rail width above the maximum", () => {
		expect(clampLayout({ railWidth: 5000 }).railWidth).toBe(MAX_RAIL_WIDTH);
	});

	test("clamps rail, diff, and tree widths below their minimums", () => {
		const clamped = clampLayout({ railWidth: 10, diffWidth: 10, treeWidth: 10 });

		expect(clamped.railWidth).toBe(MIN_RAIL_WIDTH);
		expect(clamped.diffWidth).toBe(MIN_DIFF_WIDTH);
		expect(clamped.treeWidth).toBe(MIN_TREE_WIDTH);
	});

	test("passes valid stored values through and restores fullscreen", () => {
		expect(
			clampLayout({
				railWidth: 300,
				diffWidth: 700,
				treeWidth: 240,
				fullscreen: true,
				reviewOpen: false,
				reviewExpanded: true,
				treeOpen: false,
				projectsOpen: true,
			}),
		).toEqual({
			railWidth: 300,
			diffWidth: 700,
			treeWidth: 240,
			fullscreen: true,
			reviewOpen: false,
			reviewExpanded: true,
			treeOpen: false,
		});
	});
});
