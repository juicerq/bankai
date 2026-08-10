import { expect, test } from "bun:test";
import { SessionPageUrl } from "@shared/session-page";

test("session page accepts secure web addresses and loopback development addresses", () => {
	expect(SessionPageUrl.parse("https://example.com/docs?q=bankai#page")).toBe(
		"https://example.com/docs?q=bankai#page",
	);
	expect(SessionPageUrl.parse("http://localhost:4700")).toBe("http://localhost:4700/");
	expect(SessionPageUrl.parse("http://127.42.1.9:4700/path")).toBe(
		"http://127.42.1.9:4700/path",
	);
	expect(SessionPageUrl.parse("http://[::1]:4700/path")).toBe(
		"http://[::1]:4700/path",
	);
});

test("session page rejects credentials, unsafe protocols, and non-loopback plain HTTP", () => {
	const rejected = [
		"https://user:secret@example.com",
		"http://example.com",
		"http://localhost.example.com",
		"http://127.example.com",
		"http://[::2]",
		"file:///etc/passwd",
		"javascript:alert(1)",
		"not a URL",
	];

	for (const address of rejected) {
		expect(SessionPageUrl.parse(address)).toBeUndefined();
	}
});
