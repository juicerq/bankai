import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listDirs } from "@core/fs/listDirs";

let root: string;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "project-j-listdirs-"));

	const mk = (name: string, mtime: number) => {
		const path = join(root, name);
		mkdirSync(path);
		utimesSync(path, mtime, mtime);
	};

	mk("older", 1000);
	mk("newer", 3000);
	mk("mid-b", 2000);
	mk("mid-a", 2000);
	mk(".hidden", 4000);
	writeFileSync(join(root, "a-file.txt"), "x");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("listDirs", () => {
	it("returns only directories, excluding files", async () => {
		const names = (await listDirs(root)).map((entry) => entry.name);
		expect(names).not.toContain("a-file.txt");
		expect(names).toContain("older");
	});

	it("orders by mtime desc, alphabetical on tie", async () => {
		const names = (await listDirs(root)).map((entry) => entry.name);
		expect(names).toEqual([".hidden", "newer", "mid-a", "mid-b", "older"]);
	});

	it("flags dotfolders as hidden but still lists them", async () => {
		const hidden = (await listDirs(root)).find((entry) => entry.name === ".hidden");
		expect(hidden?.hidden).toBe(true);
	});
});
