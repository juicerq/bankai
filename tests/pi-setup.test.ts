import {
	chmod,
	lstat,
	mkdir,
	readlink,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PI_COMPANION_ENTRY } from "@core/harness/pi/protocol";
import {
	compatiblePiVersion,
	installPiCompanion,
	setupPi,
} from "@core/setup/pi";
import { assertDefined } from "./utils/assertions";

function setupPaths() {
	assertDefined(process.env.DATA_DIR);
	return {
		agentDirectory: join(process.env.DATA_DIR, "pi-agent"),
		companionPath: join(process.env.DATA_DIR, PI_COMPANION_ENTRY),
	};
}

describe("Pi setup", () => {
	it("accepts the supported Pi release", () => {
		expect(compatiblePiVersion("0.80.10")).toBe(true);
		expect(compatiblePiVersion("pi 0.80.14")).toBe(true);
		expect(compatiblePiVersion("0.79.9")).toBe(false);
		expect(compatiblePiVersion("0.81.0")).toBe(false);
		expect(compatiblePiVersion("unknown")).toBe(false);
	});

	it("validates the installed Pi before changing its extension directory", async () => {
		assertDefined(process.env.DATA_DIR);
		const originalPath = process.env.PATH;
		const bin = join(process.env.DATA_DIR, "bin");
		const executable = join(bin, "pi");
		await mkdir(bin);
		await writeFile(executable, "#!/bin/sh\necho 0.80.10\n");
		await chmod(executable, 0o755);
		process.env.PATH = bin;
		process.env.PI_CODING_AGENT_DIR = join(process.env.DATA_DIR, "agent");
		const companionPath = join(process.env.DATA_DIR, PI_COMPANION_ENTRY);
		await writeFile(companionPath, "export default () => {};");

		try {
			const destination = await setupPi({ companionPath });
			expect((await lstat(destination)).isSymbolicLink()).toBe(true);

			await writeFile(executable, "#!/bin/sh\necho 0.81.0\n");
			const incompatible = await setupPi({ companionPath }).catch((error: unknown) => error);
			expect(String(incompatible)).toContain("incompatible Pi version");
		} finally {
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
		}
	});

	it("fails before installation when the artifact is missing or is TypeScript", async () => {
		const paths = setupPaths();
		const missing = await installPiCompanion(paths).catch((cause: unknown) => cause);
		expect(String(missing)).toContain("companion artifact is missing");

		const sourcePath = join(process.env.DATA_DIR!, "pi-companion.ts");
		await writeFile(sourcePath, "export default () => {};");
		const source = await installPiCompanion({
			...paths,
			companionPath: sourcePath,
		}).catch((cause: unknown) => cause);
		expect(String(source)).toContain("must be compiled JavaScript");
	});

	it("installs idempotently and repairs a bankai-owned stale link", async () => {
		const paths = setupPaths();
		await writeFile(paths.companionPath, "export default () => {};");

		const destination = await installPiCompanion(paths);
		expect((await lstat(destination)).isSymbolicLink()).toBe(true);
		expect(await readlink(destination)).toBe(paths.companionPath);
		expect(await installPiCompanion(paths)).toBe(destination);

		const next = join(process.env.DATA_DIR!, "next", PI_COMPANION_ENTRY);
		await mkdir(join(process.env.DATA_DIR!, "next"));
		await writeFile(next, "export default () => {};");
		await installPiCompanion({ ...paths, companionPath: next });
		expect(await readlink(destination)).toBe(next);
	});

	it("refuses a regular file or foreign link", async () => {
		const paths = setupPaths();
		const extensions = join(paths.agentDirectory, "extensions");
		const destination = join(extensions, PI_COMPANION_ENTRY);
		await writeFile(paths.companionPath, "export default () => {};");
		await mkdir(extensions, { recursive: true });
		await writeFile(destination, "foreign");

		const fileError = await installPiCompanion(paths).catch((error: unknown) => error);
		expect(String(fileError)).toContain("refusing to overwrite non-symlink");

		await unlink(destination);
		await symlink("/tmp/foreign-extension.js", destination);
		const linkError = await installPiCompanion(paths).catch((error: unknown) => error);
		expect(String(linkError)).toContain("refusing to overwrite foreign");
	});
});
