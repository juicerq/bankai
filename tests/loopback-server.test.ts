import { createServer, type Server } from "node:http";
import { describe, expect, it } from "bun:test";
import { authorizeRequest } from "@main/server/auth";
import { listenLoopback } from "@main/server/listen";
import { SERVER_HOST, SERVER_TOKEN_BYTES } from "@shared/server";

const token = "a".repeat(SERVER_TOKEN_BYTES * 2);

describe("server authorization", () => {
	it("accepts the bearer token", () => {
		expect(authorizeRequest(`Bearer ${token}`, token)).toBe(true);
	});

	it("rejects a request with no authorization header", () => {
		expect(authorizeRequest(undefined, token)).toBe(false);
	});

	it("rejects a wrong token of the same length", () => {
		expect(authorizeRequest(`Bearer ${"b".repeat(token.length)}`, token)).toBe(false);
	});

	it("rejects a token of a different length instead of throwing", () => {
		expect(authorizeRequest("Bearer short", token)).toBe(false);
	});

	it("rejects a scheme other than bearer", () => {
		expect(authorizeRequest(token, token)).toBe(false);
	});
});

function boundAddress(server: Server) {
	const address = server.address();

	if (typeof address !== "object" || address === null) {
		throw new Error("expected a bound TCP address");
	}

	return address;
}

describe("loopback listen", () => {
	it("binds the loopback interface only", async () => {
		const server = createServer();
		await listenLoopback(server, 0);

		expect(boundAddress(server).address).toBe(SERVER_HOST);

		server.close();
	});

	it("fails with the busy port named instead of moving to another one", async () => {
		const taken = createServer();
		await listenLoopback(taken, 0);

		const { port } = boundAddress(taken);
		const second = createServer();

		expect(() => listenLoopback(second, port)).toThrow(`port ${port}`);
		expect(second.listening).toBe(false);

		taken.close();
	});
});
