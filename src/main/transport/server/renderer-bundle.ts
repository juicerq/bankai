import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { SERVER_HOST } from "@shared/server";

const CONTENT_TYPES: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".wasm": "application/wasm",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".woff2": "font/woff2",
};

const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const BUNDLE_INDEX_PATH = "/index.html";
const HEAD_OPEN = "<head>";
const ROOT_BASE_TAG = '<base href="/" />';
const HASHED_ASSET_PREFIX = "/assets/";
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const REVALIDATE_CACHE = "no-cache";

interface BundleAsset {
	body: Buffer;
	contentType: string;
	cacheControl: string;
}

export type BundleAssets = ReadonlyMap<string, BundleAsset>;

async function readRendererBundle(root: string): Promise<BundleAssets> {
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	const bundle = new Map<string, BundleAsset>();

	for (const entry of entries) {
		if (!entry.isFile()) {
			continue;
		}

		const absolute = join(entry.parentPath, entry.name);
		const path = `/${relative(root, absolute).split(sep).join("/")}`;
		const file = await readFile(absolute);

		bundle.set(path, {
			body: path === BUNDLE_INDEX_PATH ? rootAnchoredIndex(file) : file,
			contentType: CONTENT_TYPES[extname(path)] ?? DEFAULT_CONTENT_TYPE,
			cacheControl: path.startsWith(HASHED_ASSET_PREFIX) ? IMMUTABLE_CACHE : REVALIDATE_CACHE,
		});
	}

	return bundle;
}

function rootAnchoredIndex(file: Buffer): Buffer {
	const html = file.toString("utf8");

	if (!html.includes(HEAD_OPEN)) {
		throw new Error("Renderer index.html has no <head> to anchor its asset URLs to the root");
	}

	return Buffer.from(html.replace(HEAD_OPEN, HEAD_OPEN + ROOT_BASE_TAG));
}

function resolveBundleAsset(bundle: BundleAssets, url: string): BundleAsset | undefined {
	const path = bundlePath(url);

	if (path === undefined) {
		return undefined;
	}

	const asset = bundle.get(path);

	if (asset || extname(path)) {
		return asset;
	}

	return bundle.get(BUNDLE_INDEX_PATH);
}

function bundlePath(url: string): string | undefined {
	try {
		return decodeURIComponent(new URL(url, `http://${SERVER_HOST}`).pathname);
	} catch {
		return undefined;
	}
}

export const RendererBundle = {
	read: readRendererBundle,
	resolveAsset: resolveBundleAsset,
};
