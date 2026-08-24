import { describe, expect, it } from "bun:test";
import { SelfUpdate } from "@main/desktop/self-update";

describe("self update eligibility", () => {
	it("updates itself when the running binary is the AppImage", () => {
		expect(
			SelfUpdate.allowed({
				platform: "linux",
				execPath: "/tmp/.mount_Bankai5Shkhr/bankai",
				appImage: "/home/op/.local/lib/bankai/Bankai.AppImage",
				appDir: "/tmp/.mount_Bankai5Shkhr",
			}),
		).toBe(true);
	});

	it("leaves a package install to its package manager", () => {
		expect(
			SelfUpdate.allowed({ platform: "linux", execPath: "/opt/bankai/bankai" }),
		).toBe(false);
	});

	it("ignores an AppImage environment inherited from another process", () => {
		expect(
			SelfUpdate.allowed({
				platform: "linux",
				execPath: "/opt/bankai/bankai",
				appImage: "/home/op/.local/lib/bankai/Bankai.AppImage",
				appDir: "/tmp/.mount_Bankai5Shkhr",
			}),
		).toBe(false);
	});

	it("keeps the Windows installer updating itself", () => {
		expect(
			SelfUpdate.allowed({
				platform: "win32",
				execPath: "C:\\Users\\op\\AppData\\Local\\Programs\\bankai\\Bankai.exe",
			}),
		).toBe(true);
	});
});

describe("what the core loses to an install", () => {
	it("leaves the Linux core running, so the update costs no agent", () => {
		expect(SelfUpdate.coreSurvives("linux")).toBe(true);
	});

	it("stops the core on Windows, where the installer overwrites a locked binary", () => {
		expect(SelfUpdate.coreSurvives("win32")).toBe(false);
	});

	it("stops the core on macOS, where the install replaces the bundle it runs from", () => {
		expect(SelfUpdate.coreSurvives("darwin")).toBe(false);
	});
});
