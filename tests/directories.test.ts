import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "bun:test";
import { browseDirectories, expandUserPath } from "@main/fs/directories";
import { assertDefined } from "./utils/assertions";

function scratch(name: string) {
	assertDefined(process.env.DATA_DIR);
	const path = join(process.env.DATA_DIR, name);
	mkdirSync(path);

	return path;
}

describe("browse directories", () => {
	it("lists directories alphabetically and leaves files out", async () => {
		const root = scratch("tree");
		mkdirSync(join(root, "zeta"));
		mkdirSync(join(root, "alpha"));
		writeFileSync(join(root, "readme.md"), "");

		expect(await browseDirectories(root)).toEqual({ path: root, directories: ["alpha", "zeta"] });
	});

	it("lists hidden directories so the picker decides when to show them", async () => {
		const root = scratch("hidden");
		mkdirSync(join(root, ".config"));

		expect((await browseDirectories(root)).directories).toEqual([".config"]);
	});

	it("lists a directory reached through a symlink and skips a symlinked file", async () => {
		const root = scratch("links");
		mkdirSync(join(root, "target"));
		writeFileSync(join(root, "target.txt"), "");
		symlinkSync(join(root, "target"), join(root, "linked-directory"));
		symlinkSync(join(root, "target.txt"), join(root, "linked-file"));

		expect((await browseDirectories(root)).directories).toEqual(["linked-directory", "target"]);
	});

	it("reports an empty directory instead of failing when it cannot be read", async () => {
		const root = scratch("locked");
		mkdirSync(join(root, "unreachable"));
		chmodSync(root, 0o000);

		expect(await browseDirectories(root)).toEqual({ path: root, directories: [] });

		chmodSync(root, 0o700);
	});

	it("fails on a directory that does not exist", async () => {
		assertDefined(process.env.DATA_DIR);

		const failure = await browseDirectories(join(process.env.DATA_DIR, "nowhere")).catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(Error);
	});

	it("browses the home directory through a tilde", async () => {
		expect((await browseDirectories("~")).path).toBe(homedir());
	});
});

describe("expand user path", () => {
	it("expands a bare tilde and a tilde segment", () => {
		expect(expandUserPath("~")).toBe(homedir());
		expect(expandUserPath("~/projects")).toBe(join(homedir(), "projects"));
	});

	it("resolves a relative path against the working directory", () => {
		expect(expandUserPath("projects")).toBe(resolve("projects"));
	});

	it("keeps an absolute path and drops its trailing separator", () => {
		expect(expandUserPath("/home/jui/projects/")).toBe("/home/jui/projects");
	});
});
