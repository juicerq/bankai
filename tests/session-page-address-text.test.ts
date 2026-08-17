import { expect, test } from "bun:test";
import { SessionPageAddressText } from "@renderer/routes/-features/session-page/session-page-address-text";

test("a host with a port is completed with the scheme its host allows", () => {
	expect(SessionPageAddressText.resolve("localhost:5000")).toBe("http://localhost:5000/");
	expect(SessionPageAddressText.resolve("127.0.0.1:3000")).toBe("http://127.0.0.1:3000/");
	expect(SessionPageAddressText.resolve("[::1]:4700/path")).toBe("http://[::1]:4700/path");
	expect(SessionPageAddressText.resolve("meusite.com:8080/docs")).toBe("https://meusite.com:8080/docs");
});

test("a bare host is completed with https and localhost with http", () => {
	expect(SessionPageAddressText.resolve("meusite.com")).toBe("https://meusite.com/");
	expect(SessionPageAddressText.resolve("localhost")).toBe("http://localhost/");
});

test("plain http is upgraded outside loopback and kept on loopback", () => {
	expect(SessionPageAddressText.resolve("http://meusite.com")).toBe("https://meusite.com/");
	expect(SessionPageAddressText.resolve("http://localhost:5000")).toBe("http://localhost:5000/");
	expect(SessionPageAddressText.resolve("https://meusite.com/docs")).toBe("https://meusite.com/docs");
});

test("text that is not an address becomes a Google search", () => {
	expect(SessionPageAddressText.resolve("busca qualquer")).toBe(
		"https://www.google.com/search?q=busca%20qualquer",
	);
	expect(SessionPageAddressText.resolve("bankai")).toBe("https://www.google.com/search?q=bankai");
});

test("an empty draft resolves to nothing", () => {
	expect(SessionPageAddressText.resolve("")).toBeUndefined();
	expect(SessionPageAddressText.resolve("   ")).toBeUndefined();
});

test("an address the page cannot open stays unresolved", () => {
	expect(SessionPageAddressText.resolve("ftp://meusite.com")).toBeUndefined();
	expect(SessionPageAddressText.resolve("https://user:secret@meusite.com")).toBeUndefined();
});

test("describe splits a URL into host, path and locality", () => {
	expect(SessionPageAddressText.describe("https://meusite.com/docs?q=1")).toEqual({
		host: "meusite.com",
		path: "/docs?q=1",
		local: false,
	});
	expect(SessionPageAddressText.describe("http://localhost:5000/")).toEqual({
		host: "localhost:5000",
		path: "",
		local: true,
	});
	expect(SessionPageAddressText.describe("file:///home/jui/page.html")).toEqual({
		host: "",
		path: "/home/jui/page.html",
		local: true,
	});
	expect(SessionPageAddressText.describe("")).toBeUndefined();
});
