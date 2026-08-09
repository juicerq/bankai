import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "bun:test";
import { Directories } from "@main/infra/directories";
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

		expect(await Directories.browse(root)).toEqual({ path: root, directories: ["alpha", "zeta"] });
	});

	it("lists hidden directories so the picker decides when to show them", async () => {
		const root = scratch("hidden");
		mkdirSync(join(root, ".config"));

		expect((await Directories.browse(root)).directories).toEqual([".config"]);
	});

	it("lists a directory reached through a symlink and skips a symlinked file", async () => {
		const root = scratch("links");
		mkdirSync(join(root, "target"));
		writeFileSync(join(root, "target.txt"), "");
		symlinkSync(join(root, "target"), join(root, "linked-directory"));
		symlinkSync(join(root, "target.txt"), join(root, "linked-file"));

		expect((await Directories.browse(root)).directories).toEqual(["linked-directory", "target"]);
	});

	it("reports an empty directory instead of failing when it cannot be read", async () => {
		const root = scratch("locked");
		mkdirSync(join(root, "unreachable"));
		chmodSync(root, 0o000);

		expect(await Directories.browse(root)).toEqual({ path: root, directories: [] });

		chmodSync(root, 0o700);
	});

	it("fails on a directory that does not exist", async () => {
		assertDefined(process.env.DATA_DIR);

		const failure = await Directories.browse(join(process.env.DATA_DIR, "nowhere")).catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(Error);
	});

	it("browses the home directory through a tilde", async () => {
		expect((await Directories.browse("~")).path).toBe(homedir());
	});
});

describe("project directory", () => {
	it("creates a missing project directory whose parent exists", async () => {
		assertDefined(process.env.DATA_DIR);
		const projectPath = join(process.env.DATA_DIR, "created-project");

		const ensured = await Directories.ensureProject(projectPath);

		expect(ensured).toBe(projectPath);
		expect((await Directories.inspectProject(projectPath)).state).toBe("directory");
	});

	it("does not create a directory when its parent is missing", async () => {
		assertDefined(process.env.DATA_DIR);
		const projectPath = join(process.env.DATA_DIR, "missing-parent", "project");

		expect(() => Directories.ensureProject(projectPath)).toThrow("Parent directory does not exist");
	});

	it("does not replace a file with a project directory", async () => {
		assertDefined(process.env.DATA_DIR);
		const projectPath = join(process.env.DATA_DIR, "existing-file");
		writeFileSync(projectPath, "");

		expect(() => Directories.ensureProject(projectPath)).toThrow(`Not a directory: ${projectPath}`);
	});

	it("refuses a project path whose location depends on the process directory", async () => {
		expect(() => Directories.inspectProject("projects/bankai")).toThrow("Project directory must be an absolute path");
	});
});

describe("expand user path", () => {
	it("expands a bare tilde and a tilde segment", () => {
		expect(Directories.expandUser("~")).toBe(homedir());
		expect(Directories.expandUser("~/projects")).toBe(join(homedir(), "projects"));
	});

	it("resolves a relative path against the working directory", () => {
		expect(Directories.expandUser("projects")).toBe(resolve("projects"));
	});

	it("keeps an absolute path and drops its trailing separator", () => {
		expect(Directories.expandUser("/home/jui/projects/")).toBe("/home/jui/projects");
	});
});
