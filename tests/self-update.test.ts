import { describe, expect, it } from "bun:test";
import { canSelfUpdate } from "@main/desktop/self-update";

describe("self update eligibility", () => {
	it("updates itself when the running binary is the AppImage", () => {
		expect(
			canSelfUpdate({
				platform: "linux",
				execPath: "/tmp/.mount_Bankai5Shkhr/bankai",
				appImage: "/home/op/.local/lib/bankai/Bankai.AppImage",
				appDir: "/tmp/.mount_Bankai5Shkhr",
			}),
		).toBe(true);
	});

	it("leaves a package install to its package manager", () => {
		expect(
			canSelfUpdate({ platform: "linux", execPath: "/opt/bankai/bankai" }),
		).toBe(false);
	});

	it("ignores an AppImage environment inherited from another process", () => {
		expect(
			canSelfUpdate({
				platform: "linux",
				execPath: "/opt/bankai/bankai",
				appImage: "/home/op/.local/lib/bankai/Bankai.AppImage",
				appDir: "/tmp/.mount_Bankai5Shkhr",
			}),
		).toBe(false);
	});

	it("keeps the Windows installer updating itself", () => {
		expect(
			canSelfUpdate({
				platform: "win32",
				execPath: "C:\\Users\\op\\AppData\\Local\\Programs\\bankai\\Bankai.exe",
			}),
		).toBe(true);
	});
});
