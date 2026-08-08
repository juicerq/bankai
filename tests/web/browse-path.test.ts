import { describe, expect, test } from "bun:test";
import {
	appendBrowseSegment,
	browseDirectoryPath,
	browseLeafSegment,
	browseParentPath,
	browseSeparator,
} from "@renderer/routes/-features/review/tree/browse-path";

describe("browse path", () => {
	test("reads the directory a path is browsing", () => {
		expect(browseDirectoryPath("/home/jui/")).toBe("/home/jui/");
		expect(browseDirectoryPath("/home/jui/pro")).toBe("/home/jui/");
		expect(browseDirectoryPath("projects")).toBe("");
	});

	test("reads the partial name typed after the directory", () => {
		expect(browseLeafSegment("/home/jui/pro")).toBe("pro");
		expect(browseLeafSegment("/home/jui/")).toBe("");
	});

	test("climbs one directory at a time and stops at the root", () => {
		expect(browseParentPath("/home/jui/")).toBe("/home/");
		expect(browseParentPath("/home/")).toBe("/");
		expect(browseParentPath("/")).toBeNull();
	});

	test("climbs from the directory being browsed, not from the partial name", () => {
		expect(browseParentPath("/home/jui/pro")).toBe("/home/");
	});

	test("replaces the partial name when a directory is opened", () => {
		expect(appendBrowseSegment("/home/jui/pro", "projects")).toBe("/home/jui/projects/");
		expect(appendBrowseSegment("/home/jui/", "projects")).toBe("/home/jui/projects/");
	});

	test("keeps browsing with the separator the path already uses", () => {
		expect(browseSeparator("C:\\Users\\jui")).toBe("\\");
		expect(browseSeparator("/home/jui")).toBe("/");
		expect(appendBrowseSegment("C:\\Users\\jui\\", "Projects")).toBe("C:\\Users\\jui\\Projects\\");
	});

	test("climbs a windows path down to its drive root", () => {
		expect(browseParentPath("C:\\Users\\jui\\")).toBe("C:\\Users\\");
		expect(browseParentPath("C:\\")).toBeNull();
	});
});
