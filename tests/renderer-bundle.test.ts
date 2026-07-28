import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type RendererBundle, readRendererBundle, resolveBundleAsset } from "@main/server/bundle";
import { assertDefined } from "./utils/assertions";

let root: string;
let bundle: RendererBundle;

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), "bankai-bundle-"));
	mkdirSync(join(root, "assets"));

	writeFileSync(
		join(root, "index.html"),
		'<!doctype html><html><head><script src="./assets/index-a1b2c3.js"></script></head></html>',
	);
	writeFileSync(join(root, "manifest.webmanifest"), '{"name":"Bankai"}');
	writeFileSync(join(root, "sw.js"), "self.skipWaiting();");
	writeFileSync(join(root, "icon-192.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	writeFileSync(join(root, "assets", "index-a1b2c3.js"), "export default 1;");

	bundle = await readRendererBundle(root);
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("renderer bundle read", () => {
	it("keys every nested file by its served path", () => {
		expect([...bundle.keys()].toSorted()).toEqual([
			"/assets/index-a1b2c3.js",
			"/icon-192.png",
			"/index.html",
			"/manifest.webmanifest",
			"/sw.js",
		]);
	});

	it("reads binary files without corrupting them", () => {
		const asset = resolveBundleAsset(bundle, "/icon-192.png");

		assertDefined(asset);
		expect([...asset.body]).toEqual([0x89, 0x50, 0x4e, 0x47]);
		expect(asset.contentType).toBe("image/png");
	});

	it("types the manifest as a web app manifest", () => {
		expect(resolveBundleAsset(bundle, "/manifest.webmanifest")?.contentType).toBe(
			"application/manifest+json; charset=utf-8",
		);
	});

	it("anchors the index to the root so its relative assets survive a deep route", () => {
		expect(resolveBundleAsset(bundle, "/session/abc")?.body.toString()).toContain(
			'<head><base href="/" />',
		);
	});

	it("refuses an index it cannot anchor", async () => {
		const broken = mkdtempSync(join(tmpdir(), "bankai-bundle-broken-"));
		writeFileSync(join(broken, "index.html"), "<!doctype html>");

		expect(() => readRendererBundle(broken)).toThrow("no <head>");

		rmSync(broken, { recursive: true, force: true });
	});

	it("lets hashed assets be cached forever and revalidates everything else", () => {
		expect(resolveBundleAsset(bundle, "/assets/index-a1b2c3.js")?.cacheControl).toBe(
			"public, max-age=31536000, immutable",
		);
		expect(resolveBundleAsset(bundle, "/sw.js")?.cacheControl).toBe("no-cache");
	});
});

describe("renderer bundle routing", () => {
	it("serves the index for an unknown extensionless route", () => {
		expect(resolveBundleAsset(bundle, "/session/abc")?.contentType).toBe(
			"text/html; charset=utf-8",
		);
	});

	it("serves the index for the root", () => {
		expect(resolveBundleAsset(bundle, "/")).toBe(resolveBundleAsset(bundle, "/index.html"));
	});

	it("ignores the query string and the fragment", () => {
		expect(resolveBundleAsset(bundle, "/sw.js?v=2")?.body.toString()).toBe("self.skipWaiting();");
	});

	it("misses a missing file instead of answering with the index", () => {
		expect(resolveBundleAsset(bundle, "/assets/gone-000000.js")).toBeUndefined();
	});

	it("answers a traversal with the index instead of a file outside the bundle", () => {
		const index = resolveBundleAsset(bundle, "/index.html");

		expect(resolveBundleAsset(bundle, "/assets/../../../etc/passwd")).toBe(index);
		expect(resolveBundleAsset(bundle, "/..%2f..%2fetc%2fhosts")).toBe(index);
	});

	it("misses a malformed escape instead of throwing", () => {
		expect(resolveBundleAsset(bundle, "/%E0%A4%A")).toBeUndefined();
	});
});
