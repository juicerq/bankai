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

test("session page accepts a local file address without a host", () => {
	expect(SessionPageUrl.parse("file:///home/jui/page.html")).toBe("file:///home/jui/page.html");
});

test("session page rejects credentials, unsafe protocols, remote files, and non-loopback plain HTTP", () => {
	const rejected = [
		"https://user:secret@example.com",
		"http://example.com",
		"http://localhost.example.com",
		"http://127.example.com",
		"http://[::2]",
		"file://evil.example/share/page.html",
		"javascript:alert(1)",
		"not a URL",
	];

	for (const address of rejected) {
		expect(SessionPageUrl.parse(address)).toBeUndefined();
	}
});

test("a page reaches a file address only when it already is one", () => {
	expect(SessionPageUrl.parseNavigation({ from: "https://example.com/", to: "file:///etc/passwd" })).toBeUndefined();
	expect(SessionPageUrl.parseNavigation({ from: "file:///home/jui/page.html", to: "file:///home/jui/next.html" }))
		.toBe("file:///home/jui/next.html");
	expect(SessionPageUrl.parseNavigation({ from: "file:///home/jui/page.html", to: "https://example.com/" }))
		.toBe("https://example.com/");
});
