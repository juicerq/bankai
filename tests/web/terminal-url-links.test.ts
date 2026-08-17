import { expect, test } from "bun:test";
import { TerminalUrlLinks } from "@renderer/routes/-features/terminal/terminal-url-links";

test("an HTTPS page URL keeps its port, query, and fragment while surrounding punctuation stays plain", () => {
	const text = "Docs: (https://example.com:8443/path?q=one#part).";
	const url = "https://example.com:8443/path?q=one#part";
	const start = text.indexOf(url);

	expect(TerminalUrlLinks.find(text)).toEqual([{
		url,
		start,
		end: start + url.length,
	}]);
});

test("approved HTTP loopback page URLs become links", () => {
	const text = "http://localhost:4700/dev?x=1#top http://127.0.0.2:4800/a http://[::1]:4900/b";

	expect(TerminalUrlLinks.find(text).map(({ url }) => url)).toEqual([
		"http://localhost:4700/dev?x=1#top",
		"http://127.0.0.2:4800/a",
		"http://[::1]:4900/b",
	]);
});

test("a local file URL becomes a link", () => {
	const text = "Open file:///home/jui/projects/bankai/page.html to check it.";

	expect(TerminalUrlLinks.find(text).map(({ url }) => url)).toEqual([
		"file:///home/jui/projects/bankai/page.html",
	]);
});

test("credentials, external HTTP, remote files, and unsupported protocols stay plain text", () => {
	const text = [
		"https://user:secret@example.com/private",
		"http://example.com/insecure",
		"ftp://example.com/archive",
		"file://evil.example/share/page.html",
		"javascript:alert(1)",
	].join(" ");

	expect(TerminalUrlLinks.find(text)).toEqual([]);
});
