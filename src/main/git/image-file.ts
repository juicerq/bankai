import { open } from "node:fs/promises";
import type { ReviewContent } from "@shared/review";

const MAX_BYTES = 2 * 1024 * 1024;
const HEADER_BYTES = 16;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const GIF = Buffer.from("GIF8");
const RIFF = Buffer.from("RIFF");
const WEBP = Buffer.from("WEBP");

type ImageMime = Extract<ReviewContent, { status: "image" }>["mime"];

function mimeOf(header: Buffer): ImageMime | undefined {
	if (header.subarray(0, PNG.length).equals(PNG)) {
		return "image/png";
	}
	if (header.subarray(0, JPEG.length).equals(JPEG)) {
		return "image/jpeg";
	}
	if (header.subarray(0, GIF.length).equals(GIF)) {
		return "image/gif";
	}
	if (header.subarray(0, RIFF.length).equals(RIFF) && header.subarray(8, 12).equals(WEBP)) {
		return "image/webp";
	}

	return undefined;
}

async function detect(target: string): Promise<ImageMime | undefined> {
	const handle = await open(target, "r").catch(() => null);
	if (!handle) {
		return undefined;
	}

	try {
		const header = Buffer.alloc(HEADER_BYTES);
		const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0);

		return mimeOf(header.subarray(0, bytesRead));
	} finally {
		await handle.close();
	}
}

export const ImageFile = {
	MAX_BYTES,
	mimeOf,
	detect,
};
