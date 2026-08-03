import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { StorePaths } from "@main/store/store-paths";
import { assertDefined } from "./utils/assertions";

describe("instance identity", () => {
	it("keeps the production data identity and takes the single-instance lock", () => {
		const identity = StorePaths.resolveIdentity({
			packaged: true,
			prodUserDataDir: "/home/op/.config/Bankai",
		});

		expect(identity).toEqual({
			userDataDir: "/home/op/.config/Bankai",
			singleInstanceLock: true,
		});
	});

	it("isolates development onto a sibling directory and never locks", () => {
		const prodUserDataDir = "/home/op/.config/Bankai";
		const identity = StorePaths.resolveIdentity({ packaged: false, prodUserDataDir });

		expect(identity.singleInstanceLock).toBe(false);
		expect(identity.userDataDir).not.toBe(prodUserDataDir);
		expect(identity.userDataDir).toBe("/home/op/.config/Bankai-dev");
	});

	it("gives development its own desktop name so the taskbar resolves a separate icon", () => {
		const identity = StorePaths.resolveIdentity({
			packaged: false,
			prodUserDataDir: "/home/op/.config/Bankai",
		});

		expect(identity.desktopName).toBe(StorePaths.DEV_DESKTOP_NAME);
	});
});

describe("data dir resolution", () => {
	it("lets an explicit DATA_DIR win over the electron identity", () => {
		assertDefined(process.env.DATA_DIR);

		expect(StorePaths.dataDir()).toBe(process.env.DATA_DIR);
	});

	it("resolves distinct stores for distinct DATA_DIRs", () => {
		const original = process.env.DATA_DIR;
		assertDefined(original);

		process.env.DATA_DIR = join(original, "alpha");
		const first = StorePaths.dataDir();

		process.env.DATA_DIR = join(original, "beta");
		const second = StorePaths.dataDir();

		process.env.DATA_DIR = original;

		expect(first).toBe(join(original, "alpha"));
		expect(second).toBe(join(original, "beta"));
		expect(first).not.toBe(second);
	});
});
