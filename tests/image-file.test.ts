import { mkdirSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { ImageFile } from "@main/git/image-file";
import { assertDefined } from "./utils/assertions";

const PNG_1X1 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const GIF_1X1 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

describe("ImageFile.mimeOf", () => {
	it("names a PNG from its signature", () => {
		expect(ImageFile.mimeOf(Buffer.from(PNG_1X1, "base64"))).toBe("image/png");
	});

	it("names a GIF from its signature", () => {
		expect(ImageFile.mimeOf(Buffer.from(GIF_1X1, "base64"))).toBe("image/gif");
	});

	it("names a JPEG from its signature", () => {
		expect(ImageFile.mimeOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe("image/jpeg");
	});

	it("names a WEBP only when the RIFF container declares it", () => {
		const webp = Buffer.concat([
			Buffer.from("RIFF"),
			Buffer.from([0x1a, 0x00, 0x00, 0x00]),
			Buffer.from("WEBP"),
		]);
		const wave = Buffer.concat([
			Buffer.from("RIFF"),
			Buffer.from([0x1a, 0x00, 0x00, 0x00]),
			Buffer.from("WAVE"),
		]);

		expect(ImageFile.mimeOf(webp)).toBe("image/webp");
		expect(ImageFile.mimeOf(wave)).toBeUndefined();
	});

	it("names nothing for a binary that is not an image", () => {
		expect(ImageFile.mimeOf(Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]))).toBeUndefined();
	});

	it("names nothing for a header too short to carry a signature", () => {
		expect(ImageFile.mimeOf(Buffer.from([0xff, 0xd8]))).toBeUndefined();
		expect(ImageFile.mimeOf(Buffer.alloc(0))).toBeUndefined();
	});
});

describe("ImageFile.detect", () => {
	function dir(name: string): string {
		assertDefined(process.env.DATA_DIR);
		const path = join(process.env.DATA_DIR, name);
		mkdirSync(path);

		return path;
	}

	it("names an image from the head of a file far past the size cap", async () => {
		const path = dir("detect-huge");
		writeFileSync(join(path, "huge.png"), Buffer.from(PNG_1X1, "base64"));
		truncateSync(join(path, "huge.png"), ImageFile.MAX_BYTES * 2);

		expect(await ImageFile.detect(join(path, "huge.png"))).toBe("image/png");
	});

	it("names nothing for a file that only carries the extension of an image", async () => {
		const path = dir("detect-liar");
		writeFileSync(join(path, "liar.png"), "this is plain text, not a PNG\n");

		expect(await ImageFile.detect(join(path, "liar.png"))).toBeUndefined();
	});

	it("names nothing for a file that is not there", async () => {
		expect(await ImageFile.detect(join(dir("detect-missing"), "gone.png"))).toBeUndefined();
	});
});
